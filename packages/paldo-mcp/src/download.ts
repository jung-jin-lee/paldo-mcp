import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import kleur from "kleur";

const HF_DATASET = "nvidia/Nemotron-Personas-Korea";
const HF_API = "https://huggingface.co/api/datasets";
const HF_RESOLVE = "https://huggingface.co/datasets";

interface TreeEntry {
  type: "file" | "directory";
  path: string;
  size?: number;
}

async function listRemoteParquets(): Promise<TreeEntry[]> {
  // HF tree API; data lives at `data/*.parquet` or root depending on dataset.
  const candidates = [
    `${HF_API}/${HF_DATASET}/tree/main/data`,
    `${HF_API}/${HF_DATASET}/tree/main`,
  ];

  for (const url of candidates) {
    const res = await fetch(url);
    if (!res.ok) continue;
    const entries = (await res.json()) as TreeEntry[];
    const parquets = entries.filter(
      (e) => e.type === "file" && e.path.endsWith(".parquet"),
    );
    if (parquets.length > 0) return parquets;
  }
  throw new Error(
    `No parquet files found at ${HF_DATASET}. Dataset layout may have changed.`,
  );
}

function resolveUrl(path: string): string {
  return `${HF_RESOLVE}/${HF_DATASET}/resolve/main/${path}`;
}

function fmtBytes(n: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

async function downloadOne(
  entry: TreeEntry,
  destDir: string,
  index: number,
  total: number,
): Promise<void> {
  const url = resolveUrl(entry.path);
  const fileName = entry.path.split("/").pop()!;
  const destPath = join(destDir, fileName);

  // Skip if already complete (size match).
  if (entry.size !== undefined) {
    try {
      const s = await stat(destPath);
      if (s.size === entry.size) {
        console.log(
          kleur.dim(`  [${index}/${total}] ${fileName} — already present, skipping`),
        );
        return;
      }
    } catch {
      /* file doesn't exist, fall through */
    }
  }

  console.log(
    kleur.cyan(
      `  [${index}/${total}] ${fileName}${entry.size ? ` (${fmtBytes(entry.size)})` : ""}`,
    ),
  );

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${fileName}: ${res.status} ${res.statusText}`);
  }

  await mkdir(dirname(destPath), { recursive: true });
  await pipeline(
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(destPath),
  );
}

export async function downloadDataset(destDir: string): Promise<{
  files: number;
  totalBytes: number;
}> {
  console.log(kleur.bold(`\nFetching file list from Hugging Face…`));
  const entries = await listRemoteParquets();
  const totalBytes = entries.reduce((s, e) => s + (e.size ?? 0), 0);
  console.log(
    kleur.bold(
      `Found ${entries.length} parquet file(s), ${fmtBytes(totalBytes)} total.\n`,
    ),
  );

  await mkdir(destDir, { recursive: true });

  let i = 1;
  for (const entry of entries) {
    await downloadOne(entry, destDir, i++, entries.length);
  }

  return { files: entries.length, totalBytes };
}
