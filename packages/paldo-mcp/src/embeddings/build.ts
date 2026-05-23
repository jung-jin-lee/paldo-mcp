import { existsSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { FLOAT, LIST, VARCHAR, listValue } from "@duckdb/node-api";
import kleur from "kleur";
import { getConnection, getParquetGlob } from "paldo-core";
import { buildPassageText, embedPassages } from "./embed.js";
import { getEmbeddingsPath, getIndexDir } from "./paths.js";

export interface IndexInfo {
  path: string;
  exists: boolean;
  rows?: number;
  bytes?: number;
}

export function hasIndex(): boolean {
  return existsSync(getEmbeddingsPath());
}

export async function describeIndex(): Promise<IndexInfo> {
  const path = getEmbeddingsPath();
  if (!existsSync(path)) return { path, exists: false };
  const bytes = statSync(path).size;
  const conn = await getConnection();
  const reader = await conn.runAndReadAll(
    `SELECT COUNT(*) AS n FROM read_parquet($path)`,
    { path },
    { path: VARCHAR },
  );
  const row = reader.getRowObjectsJson()[0] as { n: number | bigint };
  return { path, exists: true, rows: Number(row.n), bytes };
}

export interface BuildOptions {
  /** Build only the first N personas. Useful for smoke tests. */
  limit?: number;
  /** Number of rows fed to the embedding model per forward pass. */
  embedBatch?: number;
  /** Called after each embedding batch with cumulative progress. */
  onProgress?: (done: number, total: number) => void;
}

export interface BuildResult {
  rows: number;
  path: string;
  elapsedMs: number;
}

interface PersonaRow {
  uuid: string;
  persona: string;
  hobbies_and_interests: string;
  career_goals_and_ambitions: string;
}

export async function buildIndex(opts: BuildOptions = {}): Promise<BuildResult> {
  const t0 = Date.now();
  await mkdir(getIndexDir(), { recursive: true });
  const conn = await getConnection();

  // Pull only the fields we embed plus the join key. Adding LIMIT is cheap
  // (parquet zone maps) and makes smoke tests fast.
  const limitClause = opts.limit ? `LIMIT ${opts.limit}` : "";
  const reader = await conn.runAndReadAll(
    `SELECT uuid, persona, hobbies_and_interests, career_goals_and_ambitions
     FROM read_parquet($parquet) ${limitClause}`,
    { parquet: getParquetGlob() },
    { parquet: VARCHAR },
  );
  const rows = reader.getRowObjectsJson() as unknown as PersonaRow[];
  const total = rows.length;
  if (total === 0) {
    throw new Error("No personas found — run `paldo-mcp init` first.");
  }

  const embedBatch = opts.embedBatch ?? 32;

  // Fresh table per build — we always rewrite the parquet at the end.
  await conn.run(
    `CREATE OR REPLACE TABLE _paldo_embeddings (uuid VARCHAR, vec FLOAT[])`,
  );
  const appender = await conn.createAppender("_paldo_embeddings");

  // Row-by-row append: appendDataChunk + setColumns has a known issue where
  // wrapping LIST values via listValue() silently writes zero rows even
  // though the API reports success. Row appender is rock-solid and the
  // throughput cost at ≤1M rows is negligible (embedding inference dominates).
  for (let i = 0; i < total; i += embedBatch) {
    const batch = rows.slice(i, i + embedBatch);
    const texts = batch.map(buildPassageText);
    const vecs = await embedPassages(texts);
    for (let j = 0; j < batch.length; j++) {
      appender.appendVarchar(batch[j]!.uuid);
      appender.appendValue(listValue(Array.from(vecs[j]!)), LIST(FLOAT));
      appender.endRow();
    }
    opts.onProgress?.(Math.min(i + batch.length, total), total);
  }
  appender.closeSync();

  // Single-file parquet output. COPY is effectively atomic so an interrupted
  // build leaves either no embeddings.parquet or the previous one untouched.
  const path = getEmbeddingsPath();
  await conn.run(
    `COPY _paldo_embeddings TO '${path.replace(/'/g, "''")}' (FORMAT PARQUET)`,
  );
  await conn.run(`DROP TABLE _paldo_embeddings`);

  return { rows: total, path, elapsedMs: Date.now() - t0 };
}

/**
 * Stderr progress line — overwrites itself so the parent terminal doesn't
 * scroll. Falls through to a final newline on completion.
 */
export function consoleProgress(): NonNullable<BuildOptions["onProgress"]> {
  const startedAt = Date.now();
  let lastPct = -1;
  return (done, total) => {
    const pct = Math.floor((done / total) * 100);
    if (pct === lastPct && done < total) return;
    lastPct = pct;
    const elapsed = (Date.now() - startedAt) / 1000;
    const rate = done / Math.max(elapsed, 0.001);
    const remaining = (total - done) / Math.max(rate, 0.001);
    const eta = remaining > 1 ? `, eta ~${Math.round(remaining)}s` : "";
    process.stderr.write(
      kleur.dim(
        `  embedding... ${done.toLocaleString()}/${total.toLocaleString()} (${pct}%)${eta}\r`,
      ),
    );
    if (done === total) process.stderr.write("\n");
  };
}
