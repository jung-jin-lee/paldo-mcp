import { existsSync } from "node:fs";
import { VARCHAR } from "@duckdb/node-api";
import {
  type Persona,
  type SampleFilters,
  getByUuids,
  getConnection,
} from "paldo-core";
import { EMBEDDING_DIM, embedQuery } from "./embed.js";
import { getEmbeddingsPath } from "./paths.js";

export class IndexMissingError extends Error {
  constructor(path: string) {
    super(
      `Embedding index not found at ${path}. ` +
        `Run \`paldo-mcp init --with-search\` to build it (~1–3h for the full dataset).`,
    );
    this.name = "IndexMissingError";
  }
}

/**
 * In-memory snapshot of the embedding index. Vectors are stored in one
 * contiguous Float32Array (uuid index → byte offset = i * DIM * 4) so the
 * inner cosine loop can rip through cache-friendly memory.
 */
interface EmbeddingIndex {
  uuids: string[];
  vectors: Float32Array; // length = uuids.length * EMBEDDING_DIM
  dim: number;
}

let indexPromise: Promise<EmbeddingIndex> | null = null;

async function loadIndex(): Promise<EmbeddingIndex> {
  if (indexPromise) return indexPromise;
  indexPromise = (async () => {
    const path = getEmbeddingsPath();
    if (!existsSync(path)) throw new IndexMissingError(path);
    const conn = await getConnection();
    const reader = await conn.runAndReadAll(
      `SELECT uuid, vec FROM read_parquet($path)`,
      { path },
      { path: VARCHAR },
    );
    const rows = reader.getRowObjectsJson() as unknown as Array<{
      uuid: string;
      vec: number[];
    }>;

    const n = rows.length;
    if (n === 0) throw new IndexMissingError(path);
    const dim = rows[0]!.vec.length;
    if (dim !== EMBEDDING_DIM) {
      throw new Error(
        `Embedding dim mismatch: index has ${dim}, model produces ${EMBEDDING_DIM}. ` +
          `Rebuild with \`paldo-mcp init --with-search --force\`.`,
      );
    }

    const uuids = new Array<string>(n);
    const vectors = new Float32Array(n * dim);
    for (let i = 0; i < n; i++) {
      const row = rows[i]!;
      uuids[i] = row.uuid;
      const offset = i * dim;
      for (let j = 0; j < dim; j++) {
        vectors[offset + j] = row.vec[j]!;
      }
    }
    return { uuids, vectors, dim };
  })();

  try {
    return await indexPromise;
  } catch (err) {
    // Allow subsequent calls to retry instead of caching the failure.
    indexPromise = null;
    throw err;
  }
}

export interface SearchOptions {
  query: string;
  n: number;
  /** Optional categorical filter applied after semantic ranking. */
  filters?: SampleFilters;
  /**
   * How many top semantic hits to consider before filtering. When filters are
   * supplied we over-fetch so the post-filter top-N isn't starved. Default 10x.
   */
  overFetch?: number;
}

export interface ScoredPersona {
  persona: Persona;
  score: number;
}

/**
 * Brute-force cosine search. Vectors are L2-normalized at index time, so the
 * inner kernel is a plain dot product. For 1 M × 384 this runs in ~1–2 s on a
 * modern laptop CPU — cheap enough to skip HNSW for MVP.
 */
export async function search(opts: SearchOptions): Promise<ScoredPersona[]> {
  const index = await loadIndex();
  const queryVec = await embedQuery(opts.query);

  const total = index.uuids.length;
  const dim = index.dim;
  const vectors = index.vectors;

  // Score every row. Float64Array gives us NaN-safe comparisons and slightly
  // more accumulator range than Float32 for the dot product.
  const scores = new Float64Array(total);
  for (let i = 0; i < total; i++) {
    let s = 0;
    const base = i * dim;
    for (let j = 0; j < dim; j++) {
      s += vectors[base + j]! * queryVec[j]!;
    }
    scores[i] = s;
  }

  // Partial sort: get top-K indices. K = overFetch * n when filters are
  // present (because filters will drop some), or just n otherwise.
  const overFetch = opts.filters ? (opts.overFetch ?? 10) : 1;
  const k = Math.min(opts.n * overFetch, total);
  const indices = new Array<number>(total);
  for (let i = 0; i < total; i++) indices[i] = i;
  indices.sort((a, b) => scores[b]! - scores[a]!);
  const topIndices = indices.slice(0, k);
  const topUuids = topIndices.map((i) => index.uuids[i]!);

  // Hydrate the personas from DuckDB. getByUuids takes the optional filter
  // and applies it as a SQL WHERE so we never materialize personas we'll
  // throw away.
  const fetched = await getByUuids(topUuids, opts.filters);
  const byUuid = new Map(fetched.map((p) => [p.uuid, p]));

  // Re-attach the rank order and the original cosine score, then trim.
  const out: ScoredPersona[] = [];
  for (let i = 0; i < topIndices.length && out.length < opts.n; i++) {
    const idx = topIndices[i]!;
    const persona = byUuid.get(index.uuids[idx]!);
    if (persona) out.push({ persona, score: scores[idx]! });
  }
  return out;
}

/**
 * Test-only: clear the in-memory index cache so the next `search()` reloads
 * from disk. Not exposed through the public CLI/MCP surface.
 */
export function _resetIndexCache(): void {
  indexPromise = null;
}
