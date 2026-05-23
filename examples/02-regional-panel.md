# Example 2: 전국 17개 시도 패널

## 시나리오

"전국에 골고루 분포된 17명을 뽑고 싶어. 시도별로 1명씩."

## Why stratified sampling

`persona_sample`로 `n: 17`을 요청하면 인구가 많은 수도권(서울/경기)에서 대부분이 뽑힙니다. 전국 분포를 균등하게 가져가려면 **층화 샘플링**(stratified sampling)이 필요합니다.

## Claude Code 대화

```
You: 전국 시도가 골고루 들어간 17명 패널 만들어줘.

Claude: persona_panel을 사용하겠습니다. stratify_by='province'로 17개 시도에서 균등 샘플링합니다.
        ↳ persona_panel({ n: 17, stratify_by: "province" })

[17명, 시도별 1명씩 반환]
```

## 도구 인자

```json
{
  "n": 17,
  "stratify_by": "province"
}
```

## 필터와 결합

20대 30대만으로 17개 시도 패널:

```json
{
  "filters": { "age_range": [20, 39] },
  "n": 17,
  "stratify_by": "province"
}
```

## 다른 층화 차원

- `stratify_by: "age_decade"` — 10대 단위로 분산 (20대/30대/40대/...)
- `stratify_by: "education_level"` — 학력별 균등
- `stratify_by: "sex"` — 남녀 균등
