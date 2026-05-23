import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { SCOPES, type Scope, getScopeConfigPath } from "./paths.js";

interface ClaudeConfig {
  mcpServers?: Record<
    string,
    { command: string; args?: string[]; env?: Record<string, string> }
  >;
  [key: string]: unknown;
}

const SERVER_KEY = "paldo-mcp";
const SERVER_COMMAND = "paldo-mcp";
const SERVER_ARGS = ["server"];

function argsEqual(a: string[] | undefined, b: string[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

async function readConfig(path: string): Promise<ClaudeConfig> {
  try {
    const text = await readFile(path, "utf8");
    return JSON.parse(text) as ClaudeConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

async function writeConfig(path: string, cfg: ClaudeConfig): Promise<void> {
  // project/local scopes live under `<cwd>/.claude/` which may not exist yet.
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cfg, null, 2) + "\n");
}

export interface RegistrationResult {
  scope: Scope;
  path: string;
  added: boolean;
}

export interface UnregistrationResult {
  scope: Scope;
  path: string;
  removed: boolean;
}

export interface ScopeStatus {
  scope: Scope;
  path: string;
  registered: boolean;
}

export async function registerAt(
  scope: Scope,
  cwd?: string,
): Promise<RegistrationResult> {
  const path = getScopeConfigPath(scope, cwd);
  const cfg = await readConfig(path);
  cfg.mcpServers = cfg.mcpServers ?? {};

  const existing = cfg.mcpServers[SERVER_KEY];
  if (
    existing?.command === SERVER_COMMAND &&
    argsEqual(existing.args, SERVER_ARGS)
  ) {
    return { scope, path, added: false };
  }

  cfg.mcpServers[SERVER_KEY] = {
    command: SERVER_COMMAND,
    args: SERVER_ARGS,
  };
  await writeConfig(path, cfg);
  return { scope, path, added: true };
}

export async function unregisterAt(
  scope: Scope,
  cwd?: string,
): Promise<UnregistrationResult> {
  const path = getScopeConfigPath(scope, cwd);
  const cfg = await readConfig(path);
  if (!cfg.mcpServers?.[SERVER_KEY]) {
    return { scope, path, removed: false };
  }
  delete cfg.mcpServers[SERVER_KEY];
  await writeConfig(path, cfg);
  return { scope, path, removed: true };
}

export async function isRegisteredAt(
  scope: Scope,
  cwd?: string,
): Promise<boolean> {
  const path = getScopeConfigPath(scope, cwd);
  const cfg = await readConfig(path);
  const entry = cfg.mcpServers?.[SERVER_KEY];
  return (
    entry?.command === SERVER_COMMAND && argsEqual(entry.args, SERVER_ARGS)
  );
}

export async function listRegistrations(cwd?: string): Promise<ScopeStatus[]> {
  return Promise.all(
    SCOPES.map(
      async (scope): Promise<ScopeStatus> => ({
        scope,
        path: getScopeConfigPath(scope, cwd),
        registered: await isRegisteredAt(scope, cwd),
      }),
    ),
  );
}
