# Example 4: 의미 검색 (semantic search, v0.2+)

## 시나리오

"환경에 관심 많고 자기계발 의지가 강한 30대를 찾고 싶어. 인구통계 필터로는 표현이 안 돼."

## 필터 vs 검색

`persona_sample` 같은 도구는 *카테고리컬 컬럼*(province, age_range, education_level 등)에서만 좁힐 수 있어서 "환경에 관심 많은"이나 "내성적인" 같은 *비정형 텍스트 안의 의미*는 잡지 못합니다.

`persona_search`는 페르소나 내러티브(persona, hobbies_and_interests, career_goals_and_ambitions)에 대한 **임베딩 기반 의미 매칭**으로 이 한계를 해소합니다.

## 사전 준비

의미 검색은 **opt-in**이라 인덱스를 따로 빌드해야 합니다 (한 번만):

```bash
paldo-mcp init --with-search           # 1M 전체: 약 1–3시간, +1.5 GB 디스크
paldo-mcp init --with-search --search-limit 10000   # subset (수 분, 시연/테스트용)
```

## Claude Code 대화

```
You: 환경에 관심 많고 자기계발 의지 강한 사람 3명 뽑아줘.

Claude: persona_search를 호출하겠습니다.
        ↳ persona_search({
            query: "환경에 관심 많고 자기계발 의지 강한",
            n: 3
          })

[3명의 페르소나 + cosine score 반환]

Claude: 다음 3명을 찾았습니다.
        1. [score 0.882] 31세 여성 / 서울 광진구 / 환경 검사원
           "안정적인 일상과 소소한 취향을 통해 삶의 균형을 찾는..."
        2. [score 0.879] 32세 남성 / 서울 도봉구
           "공학적 분석력을 가졌지만 안정과 평온을 추구하며..."
        3. [score 0.876] 28세 여성 / 충청남 아산시 / 지방행정 사무원
           "수영과 인디 음악으로 스트레스를 해소..."
```

## 도구 인자

```json
{
  "query": "환경에 관심 많고 자기계발 의지 강한",
  "n": 3
}
```

## 필터와 결합

여성만, 30대로 좁혀서:

```json
{
  "query": "환경에 관심 많은",
  "n": 5,
  "filters": {
    "sex": "여자",
    "age_range": [30, 39]
  }
}
```

내부적으로는: 의미 매칭으로 top-50을 over-fetch → SQL 필터로 좁힘 → top-5 반환.

## 주의사항

- **사전 인덱스 필수**: 인덱스 없이 `persona_search` 호출 시 *IndexMissingError* + 안내 메시지가 반환됩니다.
- **score는 cosine similarity** (벡터 정규화 후 내적). 1.0이 완벽 일치, 0.7-0.9가 일반적 매칭 범위.
- **쿼리는 한국어 권장**: 데이터셋이 한국어라 의미 거리가 가장 작음. 영어 쿼리도 multilingual-e5가 일정 수준 매칭하지만 한국어가 더 강력.
- **첫 호출 ~1초, 이후 즉시**: 인덱스가 메모리에 캐시됩니다 (MCP server 재시작 전까지 유지).

## 언제 검색 vs 필터?

| 상황 | 추천 도구 |
|---|---|
| "서울 30대 여성" | `persona_sample` (모두 카테고리컬) |
| "교사 직업" | `persona_sample` + `occupation_contains:"교사"` |
| "전국 17개 시도 패널" | `persona_panel` (stratified) |
| "내성적인 사람", "환경에 관심 많은" | `persona_search` |
| "스타트업 종사자", "워킹맘 중 자기계발 의지" | `persona_search` (의미적) |
| "30대 직장인 여성 중 환경에 관심 많은" | `persona_search` + `filters` |
