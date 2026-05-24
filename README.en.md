# paldo-mcp

[한국어](README.md) | **English**

> _Paldo_ (팔도, 八道) — "the eight provinces of Korea." A nation-wide cross-section of voices.

MCP server exposing **NVIDIA Nemotron-Personas-Korea** (1M Korean synthetic personas, grounded in KOSIS statistics) to Claude Code and any MCP-compatible client.

```bash
npm install -g paldo-mcp
paldo-mcp init        # one-time: download dataset (~1.7GB) + register with Claude Code
# restart Claude Code
```

Then in Claude Code, just ask in Korean (or any language):

> "Sample 5 office workers in their 30s living in Seoul"
> ("30대 서울 거주 직장인 5명 뽑아줘")

Claude calls `persona_sample({ filters: { province: "서울", age_range: [30, 39] }, n: 5 })` and returns realistic Korean personas — complete with occupation-specific narratives, cultural context, hobbies, and career goals.

---

## Why

Grounding LLM responses in a "specific Korean perspective" usually means writing ad-hoc prompts ("You are a 30-something office worker in Seoul…"), which is:

- **Biased** — regresses to the stereotyped distribution the model was trained on
- **Non-reproducible** — same input, different outputs
- **Low-diversity** — fails to reflect the actual distribution across 17 provinces and 252 districts

`paldo-mcp` solves this by exposing the 1M records NVIDIA aligned to KOSIS statistics directly as Claude tool calls.

---

## Tools

| Tool | Purpose | Sample call |
|---|---|---|
| `persona_sample` | Random sample with filters | `{ filters: { province: "서울" }, n: 5 }` |
| `persona_get` | Single lookup by UUID | `{ uuid: "03b4f36a..." }` |
| `persona_panel` | Stratified sampling for diversity | `{ n: 17, stratify_by: "province" }` |
| `persona_search` *(v0.2)* | Embedding-based semantic search | `{ query: "환경에 관심 많은", n: 5 }` |
| `persona_stats` *(v0.3)* | GROUP BY aggregation (distribution, population size) | `{ group_by: "province" }` |
| `persona_describe_schema` | Discover available filters and values | `{}` |

`persona_search` requires an **opt-in index build** (embeds the 1.8GB dataset once). If you skip the build, the other tools still work.

- **Model**: `Xenova/multilingual-e5-small` (384-dim, ~120MB ONNX, strong on Korean)
- **Storage**: `~/.paldo/index/embeddings.parquet` (~1.5GB)
- **Build time (Apple Silicon CPU)**: 16–20 hours (~16 rows/sec). Checkpoints are saved every 5,000 rows, so re-running the same command resumes from where it stopped.
- **GPU/CUDA**: much faster, but transformers.js's CUDA backend needs separate setup (TODO v0.4+)

```bash
paldo-mcp init --with-search                       # full 1M (long, auto-resumes)
paldo-mcp init --with-search --search-limit 50000  # 50K subset (~50 min, quick try)
paldo-mcp init --with-search --search-limit 2000   # 2K subset (~2 min, demo/test)
```

### Filter keys (summary)

| Key | Type | Example values |
|---|---|---|
| `province` | categorical (17) | `"서울"`, `["서울","경기","인천"]` |
| `district` | categorical (252) | `"광주-서구"` |
| `sex` | enum | `"남자"` (male), `"여자"` (female) |
| `age_range` | `[int, int]` | `[30, 39]` |
| `marital_status` | enum | `"미혼"` (single), `"배우자있음"` (married), `"이혼"` (divorced), `"사별"` (widowed) |
| `education_level` | categorical (7) | `"대학교"` (university), `"대학원(석사)"` (master's) |
| `housing_type` | categorical (6) | `"아파트"` (apartment) |
| `family_type` | categorical (39) | `"배우자와 거주"` (lives with spouse) |
| `occupation_contains` | freetext (ILIKE) | `"개발"` (development), `"교사"` (teacher) |

> Filter values are kept in Korean to match the upstream dataset's KOSIS-aligned vocabulary. Call `persona_describe_schema` from Claude Code to discover the full schema dynamically.

---

## Examples

- [examples/01-basic-sampling.md](examples/01-basic-sampling.md) — Demographic filter basics
- [examples/02-regional-panel.md](examples/02-regional-panel.md) — Nationwide 17-province panel
- [examples/03-reaction-simulation.md](examples/03-reaction-simulation.md) — Patterns for simulating N-person reactions to text
- [examples/04-semantic-search.md](examples/04-semantic-search.md) — Semantic search (v0.2): queries that don't fit filters, like "introverted" or "environmentally conscious"

> Example docs are currently written in Korean. Translations welcome via PR.

---

## CLI

`init` is **idempotent** — it skips the download if data exists and only registers, or auto-fetches if missing. Already-registered scopes are a no-op. Safe to run multiple times.

```bash
# Most common path — first-time user, available across all projects
paldo-mcp init                          # data (downloads if missing) + user-scope registration

# Expose to an additional project only (share .mcp.json with team)
cd my-project
paldo-mcp init --scope project          # data skip (already present) + ./.mcp.json registration

# Just for you, in a specific project
paldo-mcp init --scope local            # ./.claude/settings.local.json registration

# Partial operations
paldo-mcp init --skip-register          # data only, no registration (CI cache warm-up)
paldo-mcp init --skip-data --scope project   # registration only (data shared from elsewhere)
paldo-mcp init --force                  # re-download parquet / rebuild index

# Semantic search index build (opt-in, enables persona_search)
paldo-mcp init --with-search                       # full (~17h on CPU, +1.5GB, resumable)
paldo-mcp init --with-search --search-limit 50000  # 50K subset (~50 min)
paldo-mcp init --with-search --search-limit 2000   # 2K subset (~2 min, demo)

# Unregister (data kept)
paldo-mcp deinit --scope project        # remove only from current dir's .mcp.json
paldo-mcp deinit                        # remove from default user scope

# Status / complete removal
paldo-mcp status                        # show data + registration across all 3 scopes
paldo-mcp uninstall                     # unregister from all scopes + delete data
paldo-mcp uninstall --keep-data         # unregister from all scopes, keep data

# Version
paldo-mcp --version                     # bare version number (for scripts)
paldo-mcp version                       # version + Node + platform + data dir (for bug reports)
```

### Scope cheat sheet

| `--scope` | File location | Effective range |
|---|---|---|
| `user` (default) | `~/.claude.json` | All Claude Code sessions (personal, global) |
| `project` | `<cwd>/.mcp.json` | This project, **shareable with team** (git check-in) |
| `local` | `<cwd>/.claude/settings.local.json` | This project, you only |

Data always lives at `~/.paldo/data/*.parquet` (or `PALDO_DATA_DIR` env var). The 1.8GB is downloaded once per user.

---

## Development

```bash
git clone https://github.com/jung-jin-lee/paldo-mcp
cd paldo-mcp
bun install
bun run typecheck
bun run build
```

Workspace structure:

```
packages/
  core/        paldo-core   — DuckDB query layer (sample/get/panel), reusable lib
  paldo-mcp/   paldo-mcp    — CLI + MCP server, single binary `paldo-mcp` with subcommands
```

- `paldo-mcp init`/`deinit`/`status`/`uninstall`/`version` — install/manage (see CLI section)
- `paldo-mcp server` — MCP stdio mode (invoked by Claude Code, not by humans)

---

## Data attribution

This MCP server distributes neither code nor data from NVIDIA — it downloads the upstream dataset on first run.

> [`nvidia/Nemotron-Personas-Korea`](https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea) — © NVIDIA, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
> Built with NVIDIA NeMo Data Designer, grounded in KOSIS, the Supreme Court name registry, NHIS, and KREI statistics.

When using this server in published work, please cite NVIDIA's dataset.

## License

Code: MIT. Dataset: CC BY 4.0 (NVIDIA).
