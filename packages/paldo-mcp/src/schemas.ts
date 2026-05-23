import { z } from "zod";

const StringOrArray = z.union([z.string(), z.array(z.string()).min(1)]);

export const SampleFiltersSchema = z
  .object({
    province: StringOrArray.optional()
      .describe("시도. 단일 문자열 또는 배열. 예: '서울' 또는 ['서울','경기']"),
    district: StringOrArray.optional()
      .describe("시군구. '<province>-<gu>' 형식. 예: '광주-서구'"),
    sex: z.enum(["남자", "여자"]).optional(),
    age_range: z
      .tuple([z.number().int().min(19), z.number().int().max(99)])
      .optional()
      .describe("[min, max] 나이 범위"),
    education_level: StringOrArray.optional(),
    occupation_contains: z
      .string()
      .optional()
      .describe("직업명 부분 일치 (대소문자 무시)"),
    marital_status: StringOrArray.optional(),
    family_type: StringOrArray.optional(),
    housing_type: StringOrArray.optional(),
  })
  .strict();

export const SampleInputSchema = z.object({
  filters: SampleFiltersSchema.optional(),
  n: z
    .number()
    .int()
    .min(1)
    .max(20)
    .describe("샘플링할 페르소나 수 (1-20)"),
  seed: z.number().int().optional().describe("재현성을 위한 시드"),
});

export const GetInputSchema = z.object({
  uuid: z.string().describe("페르소나 UUID (32자 hex)"),
});

export const PanelInputSchema = z.object({
  filters: SampleFiltersSchema.optional(),
  n: z.number().int().min(1).max(20),
  stratify_by: z
    .enum(["province", "age_decade", "education_level", "sex"])
    .optional()
    .describe(
      "층화 차원: 이 컬럼의 값에서 균등하게 샘플링해 다양성 보장",
    ),
  seed: z.number().int().optional(),
});

export const SearchInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "자연어 쿼리. persona/hobbies/career_goals 필드와 의미적으로 매칭. " +
        "한국어 권장. 예: '내성적이고 책 좋아하는 사람', '아이 키우는 워킹맘 중 환경에 관심 많은'",
    ),
  n: z
    .number()
    .int()
    .min(1)
    .max(20)
    .describe("반환할 페르소나 수 (1-20)"),
  filters: SampleFiltersSchema.optional().describe(
    "검색 결과에 후처리 인구통계 필터 적용 (예: province, age_range)",
  ),
});

export const DescribeSchemaInputSchema = z.object({});
