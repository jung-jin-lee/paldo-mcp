import { homedir } from "node:os";
import { join } from "node:path";

export { getDataDir, getParquetGlob } from "paldo-core";

export type Scope = "user" | "project" | "local";

// Source of truth for the scope list. Adding a new scope is a single-line
// change; downstream `switch` exhaustiveness + `SCOPES` iteration both catch
// the gap immediately.
export const SCOPES = ["user", "project", "local"] as const satisfies readonly Scope[];

/**
 * Resolve the Claude Code config file path for a given scope.
 *
 * - `user`   → `~/.claude.json` (or `$CLAUDE_CONFIG` if set, for tests)
 * - `project` → `<cwd>/.mcp.json` (the Anthropic-defined project-scope file)
 * - `local`  → `<cwd>/.claude/settings.local.json`
 *
 * All three share the same `{ mcpServers: { ... } }` shape, so a single
 * register/unregister codepath operates on any of them.
 */
export function getScopeConfigPath(
  scope: Scope,
  cwd: string = process.cwd(),
): string {
  switch (scope) {
    case "user":
      return process.env.CLAUDE_CONFIG ?? join(homedir(), ".claude.json");
    case "project":
      return join(cwd, ".mcp.json");
    case "local":
      return join(cwd, ".claude", "settings.local.json");
  }
}

/**
 * Backwards-compatible alias used by older callers / external scripts.
 * Always points at the user-scope config file.
 */
export function getClaudeConfigPath(): string {
  return getScopeConfigPath("user");
}
