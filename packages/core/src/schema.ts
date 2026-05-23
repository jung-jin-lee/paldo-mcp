import type { SchemaInfo } from "./types.js";

export const DATASET_NAME = "nvidia/Nemotron-Personas-Korea";
export const DATASET_VERSION = "2026-04";
export const DATASET_CITATION =
  "NVIDIA Nemotron-Personas-Korea (CC BY 4.0) — https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea";
export const TOTAL_RECORDS = 1_000_000;

export const SEX_VALUES = ["남자", "여자"] as const;

export const MARITAL_STATUS_VALUES = [
  "미혼",
  "배우자있음",
  "이혼",
  "사별",
] as const;

export const MILITARY_STATUS_VALUES = ["현역", "비현역"] as const;

export const HOUSING_TYPE_VALUES = [
  "아파트",
  "단독주택",
  "다세대주택",
  "연립주택",
  "오피스텔",
  "기타",
] as const;

export const EDUCATION_LEVEL_VALUES = [
  "초등학교",
  "중학교",
  "고등학교",
  "전문대학",
  "대학교",
  "대학원(석사)",
  "대학원(박사)",
] as const;

export const SCHEMA: SchemaInfo = {
  filterable_columns: [
    {
      name: "province",
      type: "categorical",
      description: "시도 (17개). 예: 서울, 경기, 광주",
      cardinality: 17,
    },
    {
      name: "district",
      type: "categorical",
      description: "시군구 (252개). '<province>-<gu>' 형식. 예: 광주-서구",
      cardinality: 252,
    },
    {
      name: "sex",
      type: "categorical",
      description: "성별",
      allowed_values: SEX_VALUES,
    },
    {
      name: "age",
      type: "range",
      description: "나이. age_range: [min, max] 형식으로 필터.",
      range: [19, 99],
    },
    {
      name: "marital_status",
      type: "categorical",
      description: "혼인 상태",
      allowed_values: MARITAL_STATUS_VALUES,
    },
    {
      name: "education_level",
      type: "categorical",
      description: "최종 학력",
      allowed_values: EDUCATION_LEVEL_VALUES,
    },
    {
      name: "housing_type",
      type: "categorical",
      description: "주택 유형",
      allowed_values: HOUSING_TYPE_VALUES,
    },
    {
      name: "family_type",
      type: "categorical",
      description: "가구 유형 (39종). 예: '배우자와 거주', '부부+미혼자녀'",
      cardinality: 39,
    },
    {
      name: "occupation",
      type: "freetext",
      description: "직업명 (자유 텍스트). occupation_contains: 부분 일치 검색.",
    },
  ],
  total_records: TOTAL_RECORDS,
  data_version: DATASET_VERSION,
  citation: DATASET_CITATION,
};
