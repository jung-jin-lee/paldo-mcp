import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { FLOAT, LIST, VARCHAR, listValue } from "@duckdb/node-api";
import kleur from "kleur";
import { getConnection, getParquetGlob } from "paldo-core";
import { buildPassageText, embedPassages } from "./embed.js";
import { getEmbeddingsPath, getIndexDir } from "./paths.js";

export interface BuildOptions {
  /** Build only the first N personas. Useful for smoke tests. */
  limit?: number;
  /** Number of rows fed to the embedding model per forward pass. */
  embedBatch?: number;
  /**
   * Rows per checkpoint chunk on disk. Each chunk is a standalone parquet so
   * an interrupted build resumes from the last completed chunk.
   * 5000 ≈ 8 MB per chunk × 200 chunks for the full 1 M dataset.
   */
  checkpointRows?: number;
  /** Force a fresh build — wipes existing checkpoints before starting. */
  force?: boolean;
  /** Called after each embedding batch with cumulative progress. */
  onProgress?: (done: number, total: number) => void;
}

export interface BuildResult {
  rows: number;
  path: string;
  elapsedMs: number;
  resumedFromRow: number;
}

export interface IndexInfo {
  path: string;
  exists: boolean;
  rows?: number;
  bytes?: number;
}

const DEFAULT_CHECKPOINT_ROWS = 5000;

interface PersonaRow {
  uuid: string;
  persona: string;
  hobbies_and_interests: string;
  career_goals_and_ambitions: string;
}

function getPartialsDir(): string {
  return join(getIndexDir(), ".partials");
}

function chunkPath(idx: number): string {
  return join(getPartialsDir(), `chunk-${String(idx).padStart(6, "0")}.parquet`);
}

function listExistingChunks(): number[] {
  const dir = getPartialsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((f) => /^chunk-(\d{6})\.parquet$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number.parseInt(m[1]!, 10))
    .sort((a, b) => a - b);
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

export async function buildIndex(opts: BuildOptions = {}): Promise<BuildResult> {
  const t0 = Date.now();
  await mkdir(getIndexDir(), { recursive: true });

  const partialsDir = getPartialsDir();
  if (opts.force) {
    await rm(partialsDir, { recursive: true, force: true });
  }
  await mkdir(partialsDir, { recursive: true });

  const checkpointRows = opts.checkpointRows ?? DEFAULT_CHECKPOINT_ROWS;
  const conn = await getConnection();

  // Fetch the population we plan to embed.
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

  // Resume detection. Each completed chunk holds exactly `checkpointRows` rows
  // (except possibly the last), so chunk count tells us how far we got.
  const existing = listExistingChunks();
  const completedChunks = existing.length;
  const resumedFromRow = Math.min(completedChunks * checkpointRows, total);
  let nextChunkIdx = completedChunks;

  if (resumedFromRow > 0 && resumedFromRow < total) {
    console.error(
      kleur.cyan(
        `  resuming from row ${resumedFromRow.toLocaleString()} (` +
          `${completedChunks} checkpoint(s) already on disk)`,
      ),
    );
  }

  const embedBatch = opts.embedBatch ?? 32;
  let pendingUuids: string[] = [];
  let pendingVecs: Float32Array[] = [];

  // Flush a chunk to a standalone parquet file.
  const flushChunk = async (): Promise<void> => {
    if (pendingUuids.length === 0) return;
    const idx = nextChunkIdx++;
    const tableName = "_paldo_chunk";
    await conn.run(
      `CREATE OR REPLACE TABLE ${tableName} (uuid VARCHAR, vec FLOAT[])`,
    );
    const appender = await conn.createAppender(tableName);
    for (let i = 0; i < pendingUuids.length; i++) {
      appender.appendVarchar(pendingUuids[i]!);
      appender.appendValue(
        listValue(Array.from(pendingVecs[i]!)),
        LIST(FLOAT),
      );
      appender.endRow();
    }
    appender.closeSync();
    const path = chunkPath(idx);
    await conn.run(
      `COPY ${tableName} TO '${path.replace(/'/g, "''")}' (FORMAT PARQUET)`,
    );
    await conn.run(`DROP TABLE ${tableName}`);
    pendingUuids = [];
    pendingVecs = [];
  };

  // Main loop: embed, accumulate, flush at checkpoint boundaries.
  for (let i = resumedFromRow; i < total; i += embedBatch) {
    const batch = rows.slice(i, i + embedBatch);
    const texts = batch.map(buildPassageText);
    const vecs = await embedPassages(texts);
    for (let j = 0; j < batch.length; j++) {
      pendingUuids.push(batch[j]!.uuid);
      pendingVecs.push(vecs[j]!);
      if (pendingUuids.length >= checkpointRows) await flushChunk();
    }
    opts.onProgress?.(Math.min(i + batch.length, total), total);
  }
  await flushChunk();

  // Merge every checkpoint into the final embeddings.parquet, then clean up.
  // Order by uuid for a stable scan order — useful for any downstream tooling.
  const finalPath = getEmbeddingsPath();
  const glob = join(partialsDir, "chunk-*.parquet").replace(/'/g, "''");
  await conn.run(
    `COPY (SELECT * FROM read_parquet('${glob}') ORDER BY uuid)
       TO '${finalPath.replace(/'/g, "''")}' (FORMAT PARQUET)`,
  );
  // Clean up only after merge succeeds — if the merge crashes the partials
  // survive for the next resume.
  await rm(partialsDir, { recursive: true, force: true });

  return { rows: total, path: finalPath, elapsedMs: Date.now() - t0, resumedFromRow };
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
