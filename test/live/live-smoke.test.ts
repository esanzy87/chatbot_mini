import { describe, expect, it } from "vitest";
import { parseAppConfig } from "@/config/env";
import { GeminiLlmAdapter } from "@/infrastructure/llm/geminiLlmAdapter";
import { TavilySearchAdapter } from "@/infrastructure/search/tavilySearchAdapter";

describe("integration:live smoke", () => {
  const hasGeminiKey = typeof process.env.GEMINI_API_KEY === "string" && process.env.GEMINI_API_KEY.length > 0;
  const hasTavilyKey = typeof process.env.TAVILY_API_KEY === "string" && process.env.TAVILY_API_KEY.length > 0;

  const geminiIt = hasGeminiKey ? it : it.skip;
  geminiIt("integration:live Gemini adapter call succeeds when key exists", async () => {
    const adapter = new GeminiLlmAdapter(process.env.GEMINI_API_KEY as string);
    const route = await adapter.planNextAction({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      message: "최신 통계 찾아줘",
      masterContext: "학습 코치형 응답",
      forceSourceMode: "FORCED",
      history: []
    });

    expect(["DIRECT_ANSWER", "CALL_TOOL", "ASK_CLARIFY", "REFUSE"]).toContain(route.nextAction);
  }, 30_000);

  const tavilyIt = hasTavilyKey ? it : it.skip;
  tavilyIt("integration:live Tavily adapter call succeeds when key exists", async () => {
    const adapter = new TavilySearchAdapter(process.env.TAVILY_API_KEY as string);
    const result = await adapter.search({
      query: "LangGraph overview",
      topK: 3
    });

    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);
  }, 30_000);

  it("integration:live fails fast when live mode key is missing", () => {
    expect(() =>
      parseAppConfig({
        NODE_ENV: "production",
        APP_LLM_MODE: "live",
        APP_SEARCH_MODE: "stub",
        INTERNAL_TOOL_TOKEN: "token"
      })
    ).toThrowError();

    expect(() =>
      parseAppConfig({
        NODE_ENV: "production",
        APP_LLM_MODE: "stub",
        APP_SEARCH_MODE: "live",
        INTERNAL_TOOL_TOKEN: "token"
      })
    ).toThrowError();
  });
});
