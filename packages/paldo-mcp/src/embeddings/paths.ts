import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where embedding artifacts live. Sibling to `~/.paldo/data/`.
 *
 *   ~/.paldo/
 *     data/        ← parquet shards (managed by paldo-core)
 *     index/       ← embeddings.parquet (this module)
 *     models/      ← @huggingface/transformers ONNX cache
 */
export function getIndexDir(): string {
  return process.env.PALDO_INDEX_DIR ?? join(homedir(), ".paldo", "index");
}

export function getEmbeddingsPath(): string {
  return join(getIndexDir(), "embeddings.parquet");
}

export function getModelsCacheDir(): string {
  return process.env.PALDO_MODELS_DIR ?? join(homedir(), ".paldo", "models");
}
