import { existsSync, readdirSync, statSync } from "node:fs";
import kleur from "kleur";
import { listRegistrations } from "../claude-config.js";
import { describeIndex } from "../embeddings/build.js";
import { getDataDir } from "../paths.js";

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

export async function runStatus(): Promise<void> {
  const dataDir = getDataDir();

  console.log(kleur.bold("\npaldo-mcp status\n"));

  // --- Data ---
  console.log(kleur.bold("Data"));
  console.log(`  location: ${dataDir}`);
  if (!existsSync(dataDir)) {
    console.log(kleur.red("  ✗ not downloaded. Run: paldo-mcp init"));
  } else {
    const parquets = readdirSync(dataDir).filter((f) =>
      f.endsWith(".parquet"),
    );
    if (parquets.length === 0) {
      console.log(
        kleur.red("  ✗ no parquet files. Run: paldo-mcp init --force"),
      );
    } else {
      const total = parquets.reduce(
        (s, f) => s + statSync(`${dataDir}/${f}`).size,
        0,
      );
      console.log(
        kleur.green(`  ✓ ${parquets.length} file(s), ${fmtBytes(total)}`),
      );
    }
  }

  // --- Semantic search index (opt-in) ---
  console.log(`\n${kleur.bold("Search index")}`);
  const info = await describeIndex();
  console.log(`  location: ${info.path}`);
  if (!info.exists) {
    console.log(
      kleur.dim(
        "  · not built (optional). To enable persona_search:\n" +
          "    paldo-mcp init --with-search",
      ),
    );
  } else {
    console.log(
      kleur.green(
        `  ✓ ${info.rows?.toLocaleString() ?? "?"} vectors, ${info.bytes ? fmtBytes(info.bytes) : "?"}`,
      ),
    );
  }

  // --- Claude registrations (all three scopes) ---
  console.log(`\n${kleur.bold("Claude registrations")}`);
  const regs = await listRegistrations();
  const anyRegistered = regs.some((r) => r.registered);
  for (const r of regs) {
    const mark = r.registered ? kleur.green("✓") : kleur.dim("·");
    const label = r.registered
      ? kleur.green("registered    ")
      : kleur.dim("not registered");
    console.log(`  ${mark} ${r.scope.padEnd(8)} ${label}  ${kleur.dim(r.path)}`);
  }
  if (!anyRegistered) {
    console.log(
      kleur.yellow(
        "\n  No scope is registered. Run: paldo-mcp init [--scope user|project|local]",
      ),
    );
  }
  console.log();
}
