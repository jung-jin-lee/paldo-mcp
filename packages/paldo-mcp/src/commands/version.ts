import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import kleur from "kleur";
import { getDataDir } from "../paths.js";

// Read once at module load. dist/commands/version.js → ../../package.json
const pkgPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "package.json",
);
const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
  name: string;
  version: string;
};

export function getCliVersion(): string {
  return pkg.version;
}

export function runVersion(): void {
  console.log(kleur.bold(`${pkg.name} ${pkg.version}`));
  console.log(kleur.dim(`  node      ${process.version}`));
  console.log(kleur.dim(`  platform  ${process.platform}/${process.arch}`));
  console.log(kleur.dim(`  data dir  ${getDataDir()}`));
}
