import kleur from "kleur";
import { unregisterAt } from "../claude-config.js";
import type { Scope } from "../paths.js";

interface DeinitOptions {
  scope?: Scope;
}

export async function runDeinit(opts: DeinitOptions): Promise<void> {
  const scope: Scope = opts.scope ?? "user";
  console.log(kleur.bold(`\npaldo-mcp deinit (scope: ${scope})\n`));

  const { removed, path } = await unregisterAt(scope);
  if (removed) {
    console.log(kleur.green(`✓ Removed paldo-mcp from ${path}`));
  } else {
    console.log(kleur.dim(`No paldo-mcp registration found in ${path}`));
  }

  console.log(
    kleur.dim(
      "\nDataset files preserved at ~/.paldo/data.\n" +
        "Use `paldo-mcp uninstall` to also delete data and clear every scope.\n",
    ),
  );
}
