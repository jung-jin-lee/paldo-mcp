import { existsSync, readdirSync } from "node:fs";
import kleur from "kleur";
import { registerAt } from "../claude-config.js";
import { downloadDataset } from "../download.js";
import {
  buildIndex,
  consoleProgress,
  hasIndex,
} from "../embeddings/build.js";
import { getDataDir, type Scope } from "../paths.js";

interface InitOptions {
  scope?: Scope;
  skipData?: boolean;
  skipRegister?: boolean;
  withSearch?: boolean;
  /** Only meaningful with --with-search: limit indexed rows (smoke test). */
  searchLimit?: number;
  force?: boolean;
}

function hasExistingData(dir: string): boolean {
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith(".parquet"));
}

export async function runInit(opts: InitOptions): Promise<void> {
  const scope: Scope = opts.scope ?? "user";
  const dataDir = getDataDir();

  console.log(kleur.bold().green("\npaldo-mcp init\n"));
  console.log(kleur.dim(`Data directory: ${dataDir}`));
  if (!opts.skipRegister) {
    console.log(kleur.dim(`Claude scope:   ${scope}`));
  }
  if (opts.withSearch) {
    console.log(
      kleur.dim(
        `Search index:   enabled${opts.searchLimit ? ` (--search-limit ${opts.searchLimit.toLocaleString()})` : ""}`,
      ),
    );
  }
  console.log();

  // Step 1 — Data (idempotent).
  const dataPresent = hasExistingData(dataDir);
  if (opts.skipData) {
    console.log(kleur.dim("Data step skipped (--skip-data)."));
  } else if (dataPresent && !opts.force) {
    console.log(
      kleur.dim("✓ Dataset already present. Use --force to re-download."),
    );
  } else {
    if (!dataPresent) {
      console.log(
        kleur.yellow(
          "⏳ First-time data download (~1.8 GB, 3–5 min on a typical connection)...\n",
        ),
      );
    }
    await downloadDataset(dataDir);
    console.log(kleur.green("\n✓ Dataset ready."));
  }

  // Step 2 — Semantic search index (opt-in, idempotent).
  if (opts.withSearch) {
    const indexPresent = hasIndex();
    if (indexPresent && !opts.force) {
      console.log(
        kleur.dim(
          "\n✓ Search index already present. Use --force to rebuild.",
        ),
      );
    } else {
      console.log(
        kleur.yellow(
          "\n⏳ Building semantic search index..." +
            "\n  - First run downloads embedding model (~120 MB, one-time)" +
            (opts.searchLimit
              ? `\n  - Indexing first ${opts.searchLimit.toLocaleString()} personas (subset)`
              : "\n  - Full 1M dataset: ~1–3 h on CPU"),
        ),
      );
      const result = await buildIndex({
        ...(opts.searchLimit !== undefined ? { limit: opts.searchLimit } : {}),
        onProgress: consoleProgress(),
      });
      const secs = (result.elapsedMs / 1000).toFixed(1);
      console.log(
        kleur.green(
          `✓ Indexed ${result.rows.toLocaleString()} personas in ${secs}s → ${result.path}`,
        ),
      );
    }
  }

  // Step 3 — Claude registration (idempotent).
  if (opts.skipRegister) {
    console.log(
      kleur.dim(
        "\nRegistration skipped (--skip-register).\n" +
          "  To register later: paldo-mcp init --skip-data --scope <user|project|local>",
      ),
    );
    console.log();
    return;
  }

  const result = await registerAt(scope);
  if (result.added) {
    console.log(
      kleur.green(`\n✓ Registered paldo-mcp (${scope}) in ${result.path}`),
    );
  } else {
    console.log(
      kleur.dim(`\n✓ Already registered (${scope}) in ${result.path}`),
    );
  }

  const hint =
    scope === "user"
      ? "Restart Claude Code to activate paldo-mcp across all projects."
      : `Restart Claude Code in this project to activate paldo-mcp (${scope} scope).`;
  console.log(kleur.bold(`\n${hint}\n`));
}
