# Example 1: 기본 인구통계 샘플링

## 시나리오

"30대 서울 거주 여성 직장인 5명의 페르소나가 필요해."

## Claude Code 대화

```
You: 30대 서울 거주 여성 직장인 5명 뽑아줘. 직업은 다양하게.

Claude: persona_sample을 호출하겠습니다.
        ↳ persona_sample({
            filters: {
              province: "서울",
              sex: "여자",
              age_range: [30, 39]
            },
            n: 5
          })

[5명의 페르소나 반환]

Claude: 다음 5명을 받았습니다:
        1. [a2f4...] 33세 / 서울 강남구 / 디지털 마케팅 전문가
        2. [c8b1...] 37세 / 서울 마포구 / 초등학교 교사
        ...
```

## 직접 호출 (도구 인자)

```json
{
  "filters": {
    "province": "서울",
    "sex": "여자",
    "age_range": [30, 39]
  },
  "n": 5
}
```

## 변형

- **여러 시도**: `province: ["서울", "경기", "인천"]`
- **특정 직업군**: `occupation_contains: "교사"`
- **재현 가능**: `seed: 42` 추가
