import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { StubLlmAdapter } from "@/infrastructure/llm/stubLlmAdapter";
import { GeminiLlmAdapter } from "@/infrastructure/llm/geminiLlmAdapter";
import { StubSearchAdapter } from "@/infrastructure/search/stubSearchAdapter";
import { RuleTransformAdapter } from "@/infrastructure/tools/ruleTransformAdapter";
import { withToolTimeout } from "@/infrastructure/tools/withToolTimeout";
import { mapExternalToolError } from "@/infrastructure/tools/toolErrorMapper";
import { createLlmAdapter, createSearchAdapter } from "@/infrastructure/factory/createAdapters";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("StubLlmAdapter", () => {
  it("returns deterministic decisions by fixture message", async () => {
    const adapter = new StubLlmAdapter();

    const direct = await adapter.planNextAction({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      message: "개념 설명해줘",
      masterContext: "context",
      forceSourceMode: "NOT_FORCED",
      history: []
    });
    const callTool = await adapter.planNextAction({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      message: "관련 논문 찾아줘",
      masterContext: "context",
      forceSourceMode: "FORCED",
      history: []
    });
    const askClarify = await adapter.planNextAction({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      message: "발표 대본으로 변환",
      masterContext: "context",
      forceSourceMode: "NOT_FORCED",
      history: []
    });
    const refuse = await adapter.planNextAction({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      message: "숙제 대신 해줘",
      masterContext: "context",
      forceSourceMode: "NOT_FORCED",
      history: []
    });

    expect(direct.nextAction).toBe("DIRECT_ANSWER");
    expect(callTool.nextAction).toBe("CALL_TOOL");
    expect(askClarify.nextAction).toBe("ASK_CLARIFY");
    expect(refuse.nextAction).toBe("REFUSE");
  });
});

describe("GeminiLlmAdapter", () => {
  it("falls back to ASK_CLARIFY on parse error", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "not-json" }] } }]
      })
    });

    const adapter = new GeminiLlmAdapter("key");
    const decision = await adapter.planNextAction({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      message: "질문",
      masterContext: "context",
      forceSourceMode: "NOT_FORCED",
      history: []
    });

    expect(decision.nextAction).toBe("ASK_CLARIFY");
  });
});

describe("search/transform adapters", () => {
  it("returns stub search results deterministically", async () => {
    const adapter = new StubSearchAdapter();
    const result = await adapter.search({ query: "langgraph", topK: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.source).toBe("stub-search");
    expect(typeof result.items[0]?.snippet).toBe("string");
  });

  it("returns empty items for no-source fixture query", async () => {
    const adapter = new StubSearchAdapter();
    const result = await adapter.search({ query: "__NO_SOURCE__", topK: 2 });
    expect(result.items).toHaveLength(0);
  });

  it("throws node exception fixture for unrecoverable path", async () => {
    const adapter = new StubSearchAdapter();
    await expect(adapter.search({ query: "__UNRECOVERABLE__", topK: 2 })).rejects.toThrowError(/NODE_EXCEPTION/);
  });

  it("throws timeout fixture for recoverable timeout path", async () => {
    const adapter = new StubSearchAdapter();
    await expect(adapter.search({ query: "__TIMEOUT__", topK: 2 })).rejects.toThrowError(/TOOL_TIMEOUT/);
  });

  it("applies rule-based transform for all formats", async () => {
    const adapter = new RuleTransformAdapter();

    const summary = await adapter.transform({ text: "a".repeat(300), targetFormat: "summary" });
    const outline = await adapter.transform({ text: "한줄\n두줄", targetFormat: "outline" });
    const script = await adapter.transform({ text: "핵심 내용", targetFormat: "presentation_script" });

    expect(summary.resultText.length).toBeLessThanOrEqual(240);
    expect(outline.resultText).toContain("1. 한줄");
    expect(script.resultText).toContain("안녕하세요.");
  });
});

describe("tool helpers", () => {
  it("maps external errors", () => {
    expect(mapExternalToolError("TIMEOUT")).toEqual({ recoverable: true, code: "TOOL_TIMEOUT" });
    expect(mapExternalToolError("NETWORK")).toEqual({ recoverable: true, code: "TOOL_EXECUTION_ERROR" });
    expect(mapExternalToolError("UNKNOWN")).toEqual({ recoverable: false, code: "TOOL_EXECUTION_ERROR" });
  });

  it("enforces timeout wrapper", async () => {
    await expect(withToolTimeout(new Promise((resolve) => setTimeout(() => resolve("ok"), 20)), 1)).rejects.toThrowError(
      /TOOL_TIMEOUT/
    );
  });
});

describe("adapter factory", () => {
  it("creates adapters by mode", () => {
    const llmStub = createLlmAdapter({
      llmMode: "stub",
      searchMode: "stub",
      internalToolToken: "token",
      nodeEnv: "test"
    });
    const toolStub = createSearchAdapter({
      llmMode: "stub",
      searchMode: "stub",
      internalToolToken: "token",
      nodeEnv: "test"
    });

    expect(llmStub).toBeInstanceOf(StubLlmAdapter);
    expect(typeof toolStub.search).toBe("function");
    expect(typeof toolStub.transform).toBe("function");
  });
});
