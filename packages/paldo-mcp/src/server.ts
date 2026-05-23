import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  DatasetMissingError,
  describeSchema,
  getByUuid,
  panel,
  sample,
} from "paldo-core";
import { search } from "./embeddings/search.js";
import { error, ok } from "./format.js";
import {
  DescribeSchemaInputSchema,
  GetInputSchema,
  PanelInputSchema,
  SampleInputSchema,
  SearchInputSchema,
} from "./schemas.js";

function buildServer(): McpServer {
  const server = new McpServer({
    name: "paldo-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "persona_sample",
    {
      title: "페르소나 무작위 샘플링",
      description:
        "인구통계 필터로 N명(1-20)의 한국인 합성 페르소나를 무작위 샘플링합니다. " +
        "필터를 비우면 전체 1M 모집단에서 균일 샘플링. " +
        "사용 가능한 필터 키와 값은 persona_describe_schema로 확인.",
      inputSchema: SampleInputSchema.shape,
    },
    async (args) => {
      try {
        const personas = await sample(args);
        return ok(personas);
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "persona_get",
    {
      title: "UUID로 페르소나 조회",
      description: "UUID로 단일 페르소나의 모든 필드를 반환합니다.",
      inputSchema: GetInputSchema.shape,
    },
    async ({ uuid }) => {
      try {
        const persona = await getByUuid(uuid);
        return persona
          ? ok(persona)
          : error(`No persona found with uuid=${uuid}`);
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "persona_panel",
    {
      title: "다양성 보장 패널 구성 (층화 샘플링)",
      description:
        "stratify_by 차원의 값에서 골고루 샘플링해 다양성이 보장된 패널을 구성. " +
        "예: stratify_by='province'로 N명 요청 시 시도가 최대한 분산됩니다. " +
        "stratify_by를 생략하면 persona_sample과 동일.",
      inputSchema: PanelInputSchema.shape,
    },
    async (args) => {
      try {
        const personas = await panel(args);
        return ok(personas);
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "persona_search",
    {
      title: "의미 검색 (임베딩 기반)",
      description:
        "자연어 쿼리로 페르소나 N명(1-20) 검색. persona/hobbies/career_goals 필드와 의미적으로 매칭. " +
        "카테고리컬 필터로는 표현 어려운 미묘한 인격/관심사/포부를 잡아낼 때 사용 " +
        "(예: '내성적이고 책 좋아하는', '환경에 관심 많은 30대'). " +
        "filters는 검색 결과에 추가 인구통계 제약을 적용. " +
        "사전 인덱스 빌드 필요: paldo-mcp init --with-search",
      inputSchema: SearchInputSchema.shape,
    },
    async (args) => {
      try {
        const results = await search(args);
        return ok(results);
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "persona_describe_schema",
    {
      title: "사용 가능한 필터 스키마 조회",
      description:
        "필터링 가능한 컬럼 목록, 카테고리 값, 데이터셋 메타데이터를 반환. " +
        "어떤 필터를 쓸 수 있는지 모를 때 먼저 호출하세요.",
      inputSchema: DescribeSchemaInputSchema.shape,
    },
    async () => ok(describeSchema()),
  );

  return server;
}

export async function runServer(): Promise<void> {
  try {
    const server = buildServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (err) {
    if (err instanceof DatasetMissingError) {
      console.error(err.message);
    } else {
      console.error("paldo-mcp server failed to start:", err);
    }
    process.exit(1);
  }
}
