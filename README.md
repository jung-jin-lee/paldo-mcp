# paldo-mcp

> _Paldo_ (팔도, 八道) — "the eight provinces of Korea." A nation-wide cross-section of voices.

MCP server exposing **NVIDIA Nemotron-Personas-Korea** (7M Korean synthetic personas, grounded in KOSIS statistics) to Claude Code and any MCP-compatible client.

```bash
npm install -g paldo-mcp
paldo-mcp init        # one-time: download dataset (~1.7GB) + register with Claude Code
# restart Claude Code
```

Then in Claude Code, just ask in Korean (or any language):

> "30대 서울 거주 직장인 5명 뽑아줘"

Claude calls `persona_sample({ filters: { province: "서울", age_range: [30, 39] }, n: 5 })` and returns realistic Korean personas — complete with occupation-specific narratives, cultural context, hobbies, and career goals.

---

## Why

LLM 응답을 "특정 한국인 관점"으로 grounding하려면 보통 ad-hoc 프롬프트("당신은 30대 서울 직장인…")로 채우게 되는데, 이건:

- **편향됨** — 모델이 학습한 stereotyped 분포로 회귀
- **재현 불가** — 같은 입력에도 결과가 흔들림
- **다양성 부족** — 17개 시도, 252개 시군구의 실제 분포를 반영하지 못함

`paldo-mcp`는 NVIDIA가 KOSIS 통계에 정렬해 만든 1M 레코드를 Claude의 도구 호출로 직접 노출해, 위 문제를 한 번에 해결합니다.

---

## Tools

| Tool | Purpose | Sample call |
|---|---|---|
| `persona_sample` | 필터 기반 무작위 샘플 | `{ filters: { province: "서울" }, n: 5 }` |
| `persona_get` | UUID로 단일 조회 | `{ uuid: "03b4f36a..." }` |
| `persona_panel` | 층화 샘플링으로 다양성 보장 | `{ n: 17, stratify_by: "province" }` |
| `persona_search` *(v0.2)* | 임베딩 기반 의미 검색 | `{ query: "환경에 관심 많은", n: 5 }` |
| `persona_describe_schema` | 사용 가능한 필터·값 확인 | `{}` |

`persona_search`는 **opt-in 인덱스 빌드**가 필요합니다 (1.8GB 데이터를 한 번 임베딩, 1-3시간 + 1.5GB 디스크). 빌드하지 않으면 다른 도구만 작동합니다.

```bash
paldo-mcp init --with-search                       # 1M 전체 인덱스 (1-3h)
paldo-mcp init --with-search --search-limit 10000  # 10K subset (수 분, 시연용)
```

### 필터 키 (요약)

| Key | Type | 예시 값 |
|---|---|---|
| `province` | categorical (17) | `"서울"`, `["서울","경기","인천"]` |
| `district` | categorical (252) | `"광주-서구"` |
| `sex` | enum | `"남자"`, `"여자"` |
| `age_range` | `[int, int]` | `[30, 39]` |
| `marital_status` | enum | `"미혼"`, `"배우자있음"`, `"이혼"`, `"사별"` |
| `education_level` | categorical (7) | `"대학교"`, `"대학원(석사)"` |
| `housing_type` | categorical (6) | `"아파트"` |
| `family_type` | categorical (39) | `"배우자와 거주"` |
| `occupation_contains` | freetext (ILIKE) | `"개발"`, `"교사"` |

전체 스키마는 Claude Code에서 `persona_describe_schema` 호출하면 동적으로 확인 가능.

---

## Examples

- [examples/01-basic-sampling.md](examples/01-basic-sampling.md) — 인구통계 필터 기본
- [examples/02-regional-panel.md](examples/02-regional-panel.md) — 전국 17개 시도 패널
- [examples/03-reaction-simulation.md](examples/03-reaction-simulation.md) — 텍스트에 대한 N명 반응 시뮬레이션 패턴
- [examples/04-semantic-search.md](examples/04-semantic-search.md) — 의미 검색 (v0.2): "내성적인", "환경에 관심 많은" 같이 필터로 표현 어려운 쿼리

---

## CLI

`init`은 **idempotent**입니다 — 데이터가 있으면 다운로드를 skip하고 등록만, 없으면 자동으로 받아옵니다. 같은 scope에 이미 등록돼 있으면 noop. 안심하고 여러 번 실행해도 됩니다.

```bash
# 가장 흔한 경로 — 첫 사용자, 모든 프로젝트에서 사용
paldo-mcp init                          # 데이터 (없으면 다운로드) + user scope 등록

# 추가 프로젝트에만 노출 (팀과 .mcp.json 공유)
cd my-project
paldo-mcp init --scope project          # 데이터 skip (이미 있음) + ./.mcp.json 등록

# 본인만, 특정 프로젝트에서
paldo-mcp init --scope local            # ./.claude/settings.local.json 등록

# 부분 동작
paldo-mcp init --skip-register          # 데이터만 받고 등록은 안 함 (CI 캐시 워밍업)
paldo-mcp init --skip-data --scope project   # 등록만 (다른 환경에서 데이터 공유 중)
paldo-mcp init --force                  # parquet 재다운로드 / 인덱스 재빌드

# 의미 검색 인덱스 빌드 (opt-in, persona_search 활성화)
paldo-mcp init --with-search                       # 전체 (1-3h, +1.5GB)
paldo-mcp init --with-search --search-limit 10000  # subset (수 분, 시연용)

# 등록 해제 (데이터는 유지)
paldo-mcp deinit --scope project        # 현재 디렉토리 .mcp.json에서만 제거
paldo-mcp deinit                        # 디폴트 user scope에서 제거

# 상태 / 완전 제거
paldo-mcp status                        # 데이터 + 3개 scope 등록 상태 모두 표시
paldo-mcp uninstall                     # 모든 scope에서 해제 + 데이터 삭제
paldo-mcp uninstall --keep-data         # 모든 scope 해제만, 데이터 유지
```

### Scope cheat sheet

| `--scope` | 파일 위치 | 영향 범위 |
|---|---|---|
| `user` (디폴트) | `~/.claude.json` | 모든 Claude Code 세션 (개인 전역) |
| `project` | `<cwd>/.mcp.json` | 해당 프로젝트, **팀과 공유 가능** (git 체크인) |
| `local` | `<cwd>/.claude/settings.local.json` | 해당 프로젝트, 본인만 |

데이터 위치는 항상 `~/.paldo/data/*.parquet` (또는 `PALDO_DATA_DIR` 환경변수). 1.8GB를 사용자당 한 번만 받습니다.

---

## Development

```bash
git clone https://github.com/jung-jin-lee/paldo-mcp
cd paldo-mcp
bun install
bun run typecheck
bun run build
```

워크스페이스 구조:

```
packages/
  core/        paldo-core   — DuckDB query layer (sample/get/panel), reusable lib
  paldo-mcp/   paldo-mcp    — CLI + MCP server, single binary `paldo-mcp` with subcommands
```

- `paldo-mcp init`/`deinit`/`status`/`uninstall` — install/manage (see CLI section)
- `paldo-mcp server` — MCP stdio mode (invoked by Claude Code, not by humans)

---

## Data attribution

This MCP server distributes neither code nor data from NVIDIA — it downloads the upstream dataset on first run.

> [`nvidia/Nemotron-Personas-Korea`](https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea) — © NVIDIA, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
> Built with NVIDIA NeMo Data Designer, grounded in KOSIS, the Supreme Court name registry, NHIS, and KREI statistics.

When using this server in published work, please cite NVIDIA's dataset.

## License

Code: MIT. Dataset: CC BY 4.0 (NVIDIA).
