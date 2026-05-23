import { rm } from "node:fs/promises";
import kleur from "kleur";
import { unregisterAt } from "../claude-config.js";
import { SCOPES, getDataDir } from "../paths.js";

interface UninstallOptions {
  keepData?: boolean;
}

export async function runUninstall(opts: UninstallOptions): Promise<void> {
  console.log(kleur.bold("\npaldo-mcp uninstall\n"));

  // Sweep every scope. Each unregisterAt is a no-op if the entry isn't there.
  for (const scope of SCOPES) {
    const { removed, path } = await unregisterAt(scope);
    if (removed) {
      console.log(
        kleur.green(`✓ Removed registration (${scope}) from ${path}`),
      );
    } else {
      console.log(kleur.dim(`  (${scope}) no registration at ${path}`));
    }
  }

  if (opts.keepData) {
    console.log(
      kleur.dim(`\nKept dataset files at ${getDataDir()} (--keep-data)`),
    );
  } else {
    const dataDir = getDataDir();
    await rm(dataDir, { recursive: true, force: true });
    console.log(kleur.green(`\n✓ Removed dataset directory ${dataDir}`));
  }

  console.log();
}
