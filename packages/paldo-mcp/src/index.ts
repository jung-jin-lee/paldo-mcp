#!/usr/bin/env node
import { Command, Option } from "commander";
import { runDeinit } from "./commands/deinit.js";
import { runInit } from "./commands/init.js";
import { runStatus } from "./commands/status.js";
import { runUninstall } from "./commands/uninstall.js";
import { runServer } from "./server.js";

// Shared option: defined once so init/deinit stay in sync if we add a scope.
const scopeOption = new Option(
  "--scope <scope>",
  "Where to write the Claude MCP entry",
)
  .choices(["user", "project", "local"])
  .default("user");

const program = new Command();

program
  .name("paldo-mcp")
  .description(
    "paldo-mcp — query 7M Korean synthetic personas (NVIDIA Nemotron-Personas-Korea) from Claude Code.",
  )
  .version("0.1.0");

program
  .command("init")
  .description(
    "Download the dataset (if missing) and register the MCP server with Claude Code. Idempotent.",
  )
  .addOption(scopeOption)
  .option("--skip-data", "Don't download/check data — register only")
  .option("--skip-register", "Don't touch Claude config — download only")
  .option(
    "--with-search",
    "Also build the semantic search index (enables persona_search; +1–3h on CPU, +1.5 GB disk)",
  )
  .option(
    "--search-limit <n>",
    "With --with-search: only index the first N personas (smoke test)",
    (v) => Number.parseInt(v, 10),
  )
  .option(
    "--force",
    "Re-download the dataset / rebuild the search index even if already present",
  )
  .action(runInit);

program
  .command("deinit")
  .description(
    "Remove the paldo-mcp entry from the given Claude scope. Dataset is kept.",
  )
  .addOption(scopeOption)
  .action(runDeinit);

program
  .command("status")
  .description(
    "Show install status: data presence + registration state across user/project/local scopes",
  )
  .action(runStatus);

program
  .command("uninstall")
  .description(
    "Remove paldo-mcp from every Claude scope AND delete the dataset directory",
  )
  .option("--keep-data", "Remove registrations only; keep parquet files")
  .action(runUninstall);

program
  .command("server")
  .description(
    "Run the MCP stdio server. Invoked automatically by Claude Code; you usually don't run this directly.",
  )
  .action(() => runServer());

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
