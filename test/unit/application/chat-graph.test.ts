import { describe, expect, it, vi } from "vitest";
import { runChatGraph } from "@/application/graph/chatGraph";
import type { RouteDecision, SearchReflection, SearchQueryPlan } from "@/domain/models";
import type { ChatGraphDeps } from "@/application/graph/chatGraph";
import { StubLlmAdapter } from "@/infrastructure/llm/stubLlmAdapter";
import { GeminiLlmAdapter } from "@/infrastructure/llm/geminiLlmAdapter";

function createDeps(overrides?: {
  planSearchQuery?: (input: { message: string }) => Promise<SearchQueryPlan>;
  reflectSearchCoverage?: () => Promise<SearchReflection>;
  search?: (args: { query: string; topK: number }) => Promise<{
    items: Array<{ title: string; snippet: string; source: string; url: string; bodyText: string }>;
  }>;
}): ChatGraphDeps {
  const defaultSearchPlan = async ({ message }: { message: string }): Promise<SearchQueryPlan> => ({
    searchIntent: "검색",
    searchQueries: [`rewritten:${message}`],
    mustInclude: [],
    mustExclude: [],
    answerShape: "definition",
    reason: "재작성"
  });

  const defaultReflection = async (): Promise<SearchReflection> => ({
    decision: "ANSWER",
    followupQuery: null,
    clarifyQuestion: null,
    reason: "답변 가능"
  });

  const searchMock = vi.fn(
    overrides?.search ??
      (async (args: { query: string; topK: number }) => ({
        items: [
          {
            title: `문서:${args.query}`,
            snippet: "요약",
            source: "stub-search",
            url: `https://example.com/${encodeURIComponent(args.query)}`,
            bodyText: `본문:${args.query}`
          }
        ]
      }))
  );

  const baseRouteDecision: RouteDecision = {
    nextAction: "CALL_TOOL",
    allowedTools: ["search"],
    confidence: 0.9,
    reason: "검색 필요"
  };

  return {
    llmPort: {
      planNextAction: vi.fn(async () => baseRouteDecision),
      planSearchQuery: vi.fn(
        overrides?.planSearchQuery ?? defaultSearchPlan
      ),
      reflectSearchCoverage: vi.fn(
        overrides?.reflectSearchCoverage ?? defaultReflection
      ),
      generateDirectAnswer: vi.fn(async () => "direct"),
      generateSearchAnswer: vi.fn(async ({ searchResults }: { searchResults: Array<{ title: string }> }) => {
        return `answer:${searchResults.map((item) => item.title).join(",")}`;
      }),
      suggestMasterContextUpdate: vi.fn(async () => null)
    },
    searchPort: {
      search: searchMock,
      transform: vi.fn(async () => ({ resultText: "transform", appliedRules: [] }))
    },
    repository: {
      getSession: vi.fn(async () => ({
        sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
        masterContext: "master",
        masterContextSummary: "summary",
        createdAt: "2026-03-07T10:00:00.000Z",
        consecutiveToolFailureTurns: 0
      })),
      listMessages: vi.fn(async () => []),
      finalizeTurn: vi.fn(() => undefined)
    },
    emitToolEvent: vi.fn(),
    emitToken: vi.fn(),
    isAborted: () => false,
    now: (() => {
      let current = 0;
      return () => {
        current += 10;
        return current;
      };
    })()
  };
}

describe("runChatGraph", () => {
  it("refines search at most once before answering", async () => {
    const reflectionMock = vi
      .fn()
      .mockResolvedValueOnce({
        decision: "REFINE_SEARCH",
        followupQuery: "refined query",
        clarifyQuestion: null,
        reason: "재검색"
      })
      .mockResolvedValueOnce({
        decision: "ANSWER",
        followupQuery: null,
        clarifyQuestion: null,
        reason: "답변 가능"
      });

    const deps = createDeps({
      reflectSearchCoverage: reflectionMock
    });

    const result = await runChatGraph(deps, {
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      requestId: "req_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      turnId: "turn_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      userMessage: "최신 통계 알려줘",
      needsSources: false,
      debug: false
    });

    expect(deps.searchPort.search).toHaveBeenCalledTimes(2);
    expect(deps.searchPort.search).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ query: "rewritten:최신 통계 알려줘" }),
      expect.anything()
    );
    expect(deps.searchPort.search).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ query: "refined query" }),
      expect.anything()
    );
    expect(result.finalNextAction).toBe("CALL_TOOL");
    expect(result.reasonSummary).toContain("검색");
  });

  it("keeps transform path behavior unchanged", async () => {
    const deps = createDeps();
    (deps.llmPort.planNextAction as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      nextAction: "CALL_TOOL",
      allowedTools: ["transform"],
      confidence: 0.9,
      reason: "변환 필요"
    } satisfies RouteDecision);

    const result = await runChatGraph(deps, {
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      requestId: "req_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      turnId: "turn_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      userMessage: "요약해줘",
      needsSources: false,
      debug: false
    });

    expect(deps.searchPort.transform).toHaveBeenCalledTimes(1);
    expect(deps.searchPort.search).not.toHaveBeenCalled();
    expect(result.finalText).toBe("transform");
  });

  it("keeps sources in graph result for stub llm search path", async () => {
    const stubLlm = new StubLlmAdapter();
    const deps = createDeps();
    deps.llmPort = {
      planSearchQuery: stubLlm.planSearchQuery.bind(stubLlm),
      reflectSearchCoverage: stubLlm.reflectSearchCoverage.bind(stubLlm),
      generateDirectAnswer: stubLlm.generateDirectAnswer.bind(stubLlm),
      generateSearchAnswer: stubLlm.generateSearchAnswer.bind(stubLlm),
      suggestMasterContextUpdate: stubLlm.suggestMasterContextUpdate.bind(stubLlm),
      planNextAction: async () => ({
        nextAction: "CALL_TOOL",
        allowedTools: ["search"],
        confidence: 0.9,
        reason: "검색 필요"
      })
    };

    const result = await runChatGraph(deps, {
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      requestId: "req_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      turnId: "turn_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      userMessage: "관련 논문 찾아줘",
      needsSources: false,
      debug: false
    });

    expect(result.sources.length).toBeGreaterThan(0);
  });

  it("keeps sources in graph result for gemini llm search path", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '{"searchIntent":"검색","searchQueries":["rewritten query"],"mustInclude":[],"mustExclude":[],"answerShape":"definition","reason":"재작성"}'
                  }
                ]
              }
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '{"decision":"ANSWER","followupQuery":null,"clarifyQuestion":null,"reason":"답변 가능"}'
                  }
                ]
              }
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(
              encoder.encode(
                'data: {"candidates":[{"content":{"parts":[{"text":"직접 답변"}]}}]}\n\n'
              )
            );
            controller.close();
          }
        })
      });

    const geminiLlm = new GeminiLlmAdapter("key");
    const deps = createDeps();
    deps.llmPort = {
      planSearchQuery: geminiLlm.planSearchQuery.bind(geminiLlm),
      reflectSearchCoverage: geminiLlm.reflectSearchCoverage.bind(geminiLlm),
      generateDirectAnswer: geminiLlm.generateDirectAnswer.bind(geminiLlm),
      generateSearchAnswer: geminiLlm.generateSearchAnswer.bind(geminiLlm),
      planNextAction: async () => ({
        nextAction: "CALL_TOOL",
        allowedTools: ["search"],
        confidence: 0.9,
        reason: "검색 필요"
      }),
      suggestMasterContextUpdate: async () => null
    };

    const result = await runChatGraph(deps, {
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      requestId: "req_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      turnId: "turn_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      userMessage: "관련 논문 찾아줘",
      needsSources: false,
      debug: false
    });

    expect(result.sources.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });
});
