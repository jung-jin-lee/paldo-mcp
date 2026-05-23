import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_DATA_DIR = join(homedir(), ".paldo", "data");

export function getDataDir(): string {
  return process.env.PALDO_DATA_DIR ?? DEFAULT_DATA_DIR;
}

export function getParquetGlob(): string {
  return join(getDataDir(), "*.parquet");
}

export class DatasetMissingError extends Error {
  constructor(dir: string) {
    super(
      `Nemotron-Personas-Korea dataset not found at ${dir}. ` +
        `Run \`paldo-mcp init\` to download (~1.7GB, one-time).`,
    );
    this.name = "DatasetMissingError";
  }
}

export function assertDatasetPresent(): void {
  const dir = getDataDir();
  if (!existsSync(dir)) {
    throw new DatasetMissingError(dir);
  }
  const parquets = readdirSync(dir).filter((f) => f.endsWith(".parquet"));
  if (parquets.length === 0) {
    throw new DatasetMissingError(dir);
  }
}

let connectionPromise: Promise<DuckDBConnection> | null = null;

export function getConnection(): Promise<DuckDBConnection> {
  if (!connectionPromise) {
    connectionPromise = (async () => {
      const instance = await DuckDBInstance.create(":memory:");
      return instance.connect();
    })();
  }
  return connectionPromise;
}

export async function closeConnection(): Promise<void> {
  if (!connectionPromise) return;
  const conn = await connectionPromise;
  conn.disconnectSync();
  connectionPromise = null;
}
