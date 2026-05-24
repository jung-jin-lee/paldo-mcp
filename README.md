# paldo-mcp

**한국어** | [English](README.en.md)

> _Paldo_ (팔도, 八道) — "한국의 여덟 도(道)." 전국 단면을 담은 목소리 모음.

**NVIDIA Nemotron-Personas-Korea** (KOSIS 통계 기반, 1M 합성 페르소나) 데이터셋을 Claude Code를 비롯한 모든 MCP 클라이언트에서 호출할 수 있게 해주는 MCP 서버입니다.

```bash
npm install -g paldo-mcp
paldo-mcp init        # 최초 1회: 데이터셋 다운로드 (~1.7GB) + Claude Code 등록
# Claude Code 재시작
```

이제 Claude Code에서 한국어(또는 어떤 언어로든) 그냥 물어보면 됩니다:

> "30대 서울 거주 직장인 5명 뽑아줘"

Claude가 `persona_sample({ filters: { province: "서울", age_range: [30, 39] }, n: 5 })` 를 호출해 직업별 서사·문화적 맥락·취미·커리어 목표까지 갖춘 사실적인 한국인 페르소나를 반환합니다.

---

## 왜 필요한가

LLM 응답을 "특정 한국인 관점"으로 grounding하려면 보통 ad-hoc 프롬프트("당신은 30대 서울 직장인…")로 채우게 되는데, 이렇게 하면:

- **편향됨** — 모델이 학습한 stereotyped 분포로 회귀
- **재현 불가** — 같은 입력에도 결과가 흔들림
- **다양성 부족** — 17개 시도, 252개 시군구의 실제 분포를 반영하지 못함

`paldo-mcp`는 NVIDIA가 KOSIS 통계에 정렬해 만든 1M 레코드를 Claude의 도구 호출로 직접 노출해, 위 문제를 한 번에 해결합니다.

---

## 제공 도구

| 도구 | 용도 | 호출 예시 |
|---|---|---|
| `persona_sample` | 필터 기반 무작위 샘플 | `{ filters: { province: "서울" }, n: 5 }` |
| `persona_get` | UUID로 단일 조회 | `{ uuid: "03b4f36a..." }` |
| `persona_panel` | 층화 샘플링으로 다양성 보장 | `{ n: 17, stratify_by: "province" }` |
| `persona_search` *(v0.2)* | 임베딩 기반 의미 검색 | `{ query: "환경에 관심 많은", n: 5 }` |
| `persona_stats` *(v0.3)* | GROUP BY 집계 (분포·모집단 크기) | `{ group_by: "province" }` |
| `persona_describe_schema` | 사용 가능한 필터·값 확인 | `{}` |

`persona_search`는 **opt-in 인덱스 빌드**가 필요합니다 (1.8GB 데이터를 한 번 임베딩). 빌드하지 않으면 다른 도구만 작동합니다.

- **모델**: `Xenova/multilingual-e5-small` (384차원, 약 120MB ONNX, 한국어 강함)
- **저장 위치**: `~/.paldo/index/embeddings.parquet` (~1.5GB)
- **소요 시간 (Apple Silicon CPU 기준)**: 16-20시간 (~16 rows/sec). 빌드 도중 중단되어도 5,000행마다 체크포인트가 저장되므로 같은 명령을 다시 실행하면 이어서 진행합니다.
- **GPU/CUDA 환경**: 훨씬 빠르지만 transformers.js의 CUDA 백엔드는 별도 셋업 필요 (TODO v0.4+)

```bash
paldo-mcp init --with-search                       # 1M 전체 (시간 소요, 자동 resume)
paldo-mcp init --with-search --search-limit 50000  # 50K subset (~50분, 빠른 시도)
paldo-mcp init --with-search --search-limit 2000   # 2K subset (~2분, 시연/테스트)
```

### 필터 키 (요약)

| 키 | 타입 | 예시 값 |
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

전체 스키마는 Claude Code에서 `persona_describe_schema`를 호출하면 동적으로 확인할 수 있습니다.

---

## 예제

- [examples/01-basic-sampling.md](examples/01-basic-sampling.md) — 인구통계 필터 기본
- [examples/02-regional-panel.md](examples/02-regional-panel.md) — 전국 17개 시도 패널
- [examples/03-reaction-simulation.md](examples/03-reaction-simulation.md) — 텍스트에 대한 N명 반응 시뮬레이션 패턴
- [examples/04-semantic-search.md](examples/04-semantic-search.md) — 의미 검색 (v0.2): "내성적인", "환경에 관심 많은" 같이 필터로 표현 어려운 쿼리

---

## CLI

`init`은 **idempotent**합니다 — 데이터가 있으면 다운로드를 건너뛰고 등록만 하고, 없으면 자동으로 받아옵니다. 같은 scope에 이미 등록돼 있으면 noop. 안심하고 여러 번 실행해도 됩니다.

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
paldo-mcp init --with-search                       # 전체 (~17h on CPU, +1.5GB, resumable)
paldo-mcp init --with-search --search-limit 50000  # 50K subset (~50분)
paldo-mcp init --with-search --search-limit 2000   # 2K subset (~2분, 시연용)

# 등록 해제 (데이터는 유지)
paldo-mcp deinit --scope project        # 현재 디렉토리 .mcp.json에서만 제거
paldo-mcp deinit                        # 디폴트 user scope에서 제거

# 상태 확인 / 완전 제거
paldo-mcp status                        # 데이터 + 3개 scope 등록 상태 모두 표시
paldo-mcp uninstall                     # 모든 scope에서 해제 + 데이터 삭제
paldo-mcp uninstall --keep-data         # 모든 scope 해제만, 데이터는 유지

# 버전 확인
paldo-mcp --version                     # 버전 번호만 (스크립트용)
paldo-mcp version                       # 버전 + Node + 플랫폼 + 데이터 경로 (버그 리포트용)
```

### Scope 치트시트

| `--scope` | 파일 위치 | 영향 범위 |
|---|---|---|
| `user` (디폴트) | `~/.claude.json` | 모든 Claude Code 세션 (개인 전역) |
| `project` | `<cwd>/.mcp.json` | 해당 프로젝트, **팀과 공유 가능** (git 체크인) |
| `local` | `<cwd>/.claude/settings.local.json` | 해당 프로젝트, 본인만 |

데이터 위치는 항상 `~/.paldo/data/*.parquet` (또는 `PALDO_DATA_DIR` 환경변수). 1.8GB를 사용자당 한 번만 받습니다.

---

## 개발

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
  core/        paldo-core   — DuckDB 쿼리 레이어 (sample/get/panel), 재사용 가능한 lib
  paldo-mcp/   paldo-mcp    — CLI + MCP 서버, 단일 바이너리 `paldo-mcp` (서브커맨드 방식)
```

- `paldo-mcp init`/`deinit`/`status`/`uninstall`/`version` — 설치·관리 (위 CLI 섹션 참조)
- `paldo-mcp server` — MCP stdio 모드 (Claude Code가 호출, 사용자가 직접 실행할 일은 없음)

---

## 데이터 출처

이 MCP 서버는 NVIDIA의 코드나 데이터를 직접 배포하지 않습니다 — 최초 실행 시 원본 데이터셋을 다운로드합니다.

> [`nvidia/Nemotron-Personas-Korea`](https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea) — © NVIDIA, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
> NVIDIA NeMo Data Designer로 구축, KOSIS·대법원 인명부·NHIS·KREI 통계에 grounding됨.

본 서버를 사용해 출판물을 작성하실 때는 NVIDIA의 원본 데이터셋을 인용해 주세요.

## 라이선스

코드: MIT. 데이터셋: CC BY 4.0 (NVIDIA).
