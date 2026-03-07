import { describe, expect, it, vi } from "vitest";
import { CreateSessionUseCase } from "@/application/usecases/createSession";
import { HandleChatTurnUseCase } from "@/application/usecases/handleChatTurn";
import { RunToolUseCase } from "@/application/usecases/runTool";
import { GetReasoningTraceUseCase } from "@/application/usecases/getReasoningTrace";
import { createRequestContext } from "@/application/context/requestContext";

describe("CreateSessionUseCase", () => {
  it("validates input and stores session", async () => {
    const sessionRepository = {
      createSession: vi.fn(async () => undefined)
    };

    const useCase = new CreateSessionUseCase(sessionRepository as never);
    const out = await useCase.execute({
      masterContext: "이번 과제는 AI 오케스트레이션 MVP 구현이며 과정 중심으로 작성해야 한다."
    });

    expect(out.sessionId.startsWith("sess_")).toBe(true);
    expect(out.masterContextSummary.length).toBeGreaterThan(0);
    expect(sessionRepository.createSession).toHaveBeenCalledTimes(1);
  });
});

describe("HandleChatTurnUseCase", () => {
  it("loads context, computes force source mode, and plans next action", async () => {
    const llmPort = {
      planNextAction: vi.fn(async () => ({
        nextAction: "CALL_TOOL",
        allowedTools: ["search"],
        confidence: 0.8,
        reason: "검색이 필요"
      }))
    };

    const sessionRepository = {
      getSession: vi.fn(async () => ({
        sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
        masterContext: "master",
        masterContextSummary: "summary",
        createdAt: "2026-03-07T10:00:00.000Z",
        consecutiveToolFailureTurns: 0
      }))
    };

    const messageRepository = {
      listMessages: vi.fn(async () => [])
    };

    const useCase = new HandleChatTurnUseCase(llmPort as never, sessionRepository as never, messageRepository as never);
    const out = await useCase.execute({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      message: "최신 통계 알려줘",
      needsSources: true
    });

    expect(out.forceSourceMode).toBe("FORCED");
    expect(out.routeDecision.nextAction).toBe("CALL_TOOL");
  });
});

describe("RunToolUseCase", () => {
  it("enforces allowlist and executes search", async () => {
    const searchPort = {
      search: vi.fn(async () => ({ items: [] })),
      transform: vi.fn(async () => ({ resultText: "ok", appliedRules: [] }))
    };

    const useCase = new RunToolUseCase(searchPort);
    const out = await useCase.execute({
      toolName: "search",
      allowedTools: ["search"],
      args: {
        query: "langgraph",
        topK: 5
      },
      timeoutMs: 100
    });

    expect(out).toEqual({ items: [] });
    expect(searchPort.search).toHaveBeenCalledTimes(1);
  });

  it("executes transform when allowed", async () => {
    const searchPort = {
      search: vi.fn(async () => ({ items: [] })),
      transform: vi.fn(async () => ({ resultText: "요약 결과", appliedRules: ["summary"] }))
    };

    const useCase = new RunToolUseCase(searchPort);
    const out = await useCase.execute({
      toolName: "transform",
      allowedTools: ["transform"],
      args: {
        text: "원문 텍스트",
        targetFormat: "summary"
      },
      timeoutMs: 100
    });

    expect(out).toEqual({ resultText: "요약 결과", appliedRules: ["summary"] });
    expect(searchPort.transform).toHaveBeenCalledTimes(1);
  });

  it("rejects disallowed tool", async () => {
    const searchPort = {
      search: vi.fn(async () => ({ items: [] })),
      transform: vi.fn(async () => ({ resultText: "ok", appliedRules: [] }))
    };

    const useCase = new RunToolUseCase(searchPort);
    await expect(
      useCase.execute({
        toolName: "search",
        allowedTools: ["transform"],
        args: {
          query: "langgraph",
          topK: 5
        },
        timeoutMs: 100
      })
    ).rejects.toThrowError(/TOOL_NOT_ALLOWED/);
  });

  it("rejects invalid transform args", async () => {
    const searchPort = {
      search: vi.fn(async () => ({ items: [] })),
      transform: vi.fn(async () => ({ resultText: "ok", appliedRules: [] }))
    };

    const useCase = new RunToolUseCase(searchPort);
    await expect(
      useCase.execute({
        toolName: "transform",
        allowedTools: ["transform"],
        args: {
          text: "",
          targetFormat: "summary"
        },
        timeoutMs: 100
      })
    ).rejects.toThrowError(/VALIDATION_ERROR/);
  });

  it("throws timeout error", async () => {
    const searchPort = {
      search: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { items: [] };
      }),
      transform: vi.fn(async () => ({ resultText: "ok", appliedRules: [] }))
    };

    const useCase = new RunToolUseCase(searchPort);
    await expect(
      useCase.execute({
        toolName: "search",
        allowedTools: ["search"],
        args: {
          query: "langgraph",
          topK: 5
        },
        timeoutMs: 1
      })
    ).rejects.toThrowError(/TOOL_TIMEOUT/);
  });
});

describe("GetReasoningTraceUseCase", () => {
  it("delegates cursor pagination query", async () => {
    const traceRepository = {
      listReasoningTraces: vi.fn(async () => ({ items: [], nextCursor: null }))
    };

    const useCase = new GetReasoningTraceUseCase(traceRepository as never);
    const out = await useCase.execute({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      limit: 20
    });

    expect(out).toEqual({ items: [], nextCursor: null });
  });

  it("rejects invalid limit", async () => {
    const traceRepository = {
      listReasoningTraces: vi.fn(async () => ({ items: [], nextCursor: null }))
    };

    const useCase = new GetReasoningTraceUseCase(traceRepository as never);
    await expect(
      useCase.execute({
        sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
        limit: 0
      })
    ).rejects.toThrowError(/VALIDATION_ERROR/);
  });
});

describe("RequestContext", () => {
  it("creates request-scoped context object", () => {
    const ctx = createRequestContext({
      requestId: "req_01HW8KAA7S9P3Y2D4Q6N1M8R5T",
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      turnId: "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M",
      debug: true
    });

    expect(ctx.requestId).toContain("req_");
    expect(ctx.sessionId).toContain("sess_");
    expect(ctx.turnId).toContain("turn_");
    expect(ctx.debug).toBe(true);
  });

  it("defaults debug=false and omits optional ids when undefined", () => {
    const ctx = createRequestContext({
      requestId: "req_01HW8KAA7S9P3Y2D4Q6N1M8R5T"
    });

    expect(ctx.requestId).toContain("req_");
    expect(ctx.debug).toBe(false);
    expect("sessionId" in ctx).toBe(false);
    expect("turnId" in ctx).toBe(false);
  });
});
