// Configure the cache directory BEFORE importing the pipeline factory — env
// is consulted at module-load time inside transformers.js.
import { env, pipeline } from "@huggingface/transformers";
import { getModelsCacheDir } from "./paths.js";

env.cacheDir = getModelsCacheDir();
// We don't want transformers to try fetching anything via the browser; force
// the Node ONNX runtime.
env.allowLocalModels = true;
env.allowRemoteModels = true;

/**
 * Multilingual E5 small (384-d, ~120 MB ONNX). Trained with the convention
 * that indexed passages are prefixed with "passage: " and search queries with
 * "query: ". Skipping these prefixes silently degrades retrieval quality.
 */
export const MODEL_ID = "Xenova/multilingual-e5-small";
export const EMBEDDING_DIM = 384;

// Lazy singleton — model load takes ~1–2s and we want to amortize it across
// many embed() calls during a bulk index build.
type Extractor = Awaited<ReturnType<typeof pipeline<"feature-extraction">>>;
let extractorPromise: Promise<Extractor> | null = null;

export async function getExtractor(
  progressCallback?: (info: unknown) => void,
): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL_ID, {
      ...(progressCallback ? { progress_callback: progressCallback } : {}),
    });
  }
  return extractorPromise;
}

function unpackTensor(
  data: Float32Array,
  batchSize: number,
  dim: number,
): Float32Array[] {
  const out: Float32Array[] = [];
  for (let i = 0; i < batchSize; i++) {
    out.push(data.slice(i * dim, (i + 1) * dim));
  }
  return out;
}

/**
 * The ONNX-backed Tensor returned by transformers.js holds *native* memory
 * that JS GC can't see — without an explicit dispose the native heap grows
 * unboundedly across batches and crashes with SIGABRT after ~2k calls.
 * We always copy the data we care about into a JS-owned Float32Array first.
 */
function disposeTensor(t: unknown): void {
  const maybe = t as { dispose?: () => void };
  maybe.dispose?.();
}

/**
 * Encode passages (indexable text). Always prefixed with "passage: ".
 * Returns one Float32Array per input, L2-normalized so cosine similarity
 * reduces to a dot product.
 */
export async function embedPassages(
  texts: string[],
): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  const prefixed = texts.map((t) => `passage: ${t}`);
  const out = await extractor(prefixed, { pooling: "mean", normalize: true });
  // Copy before dispose — `out.data` is a view onto the native tensor buffer.
  const data = (out.data as Float32Array).slice();
  const unpacked = unpackTensor(data, texts.length, EMBEDDING_DIM);
  disposeTensor(out);
  return unpacked;
}

/**
 * Encode a single search query (always prefixed with "query: ").
 */
export async function embedQuery(query: string): Promise<Float32Array> {
  const extractor = await getExtractor();
  const out = await extractor([`query: ${query}`], {
    pooling: "mean",
    normalize: true,
  });
  const copy = (out.data as Float32Array).slice(0, EMBEDDING_DIM);
  disposeTensor(out);
  return copy;
}

/**
 * Build the text we index for a persona. We deliberately mix the summary
 * `persona` field with hobbies / career goals so semantic searches over
 * lifestyle, interests, or aspirations all retrieve the right people.
 */
export function buildPassageText(p: {
  persona: string;
  hobbies_and_interests: string;
  career_goals_and_ambitions: string;
}): string {
  return [p.persona, p.hobbies_and_interests, p.career_goals_and_ambitions]
    .filter(Boolean)
    .join(" ");
}
