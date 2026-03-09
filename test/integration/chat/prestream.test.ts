import { beforeEach, describe, expect, it, vi } from "vitest";
import { getContainer, resetContainerForTest } from "@/composition/container";
import { POST as createSession } from "@/app/api/sessions/route";
import { POST as chatRoute } from "@/app/api/chat/route";
import {
  isSessionInFlight,
  resetInFlightForTest,
  tryAcquireSession
} from "@/presentation/chat/sessionInFlight";

beforeEach(() => {
  resetContainerForTest();
  resetInFlightForTest();
});

function parseSseEvents(raw: string): Array<{ event: string; data: unknown }> {
  return raw
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const event = lines.find((line) => line.startsWith("event: "))?.replace("event: ", "") ?? "";
      const dataLine = lines.find((line) => line.startsWith("data: "))?.replace("data: ", "") ?? "null";
      return {
        event,
        data: JSON.parse(dataLine)
      };
    });
}

async function createTestSession(): Promise<string> {
  const req = new Request("http://localhost/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      masterContext: "이번 과제는 AI 오케스트레이션 MVP 구현이며, 과정 중심으로 작성해야 한다."
    })
  });

  const res = await createSession(req);
  const body = (await res.json()) as { sessionId: string };
  return body.sessionId;
}

describe("POST /api/chat pre-stream validations", () => {
  it("returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{"
    });

    const res = await chatRoute(req);
    const body = (await res.json()) as { error: { code: string; requestId: string } };

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("JSON_PARSE_ERROR");
    expect(body.error.requestId).toMatch(/^req_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(res.headers.get("x-request-id")).toBe(body.error.requestId);
  });

  it("returns 422 for missing sessionId", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "안녕" })
    });

    const res = await chatRoute(req);
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 for invalid clientOptions type", async () => {
    const sessionId = await createTestSession();
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "안녕",
        clientOptions: "invalid"
      })
    });

    const res = await chatRoute(req);
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 for invalid sessionId format", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess_invalid",
        message: "안녕"
      })
    });

    const res = await chatRoute(req);
    expect(res.status).toBe(422);
  });

  it("returns 404 for non-existing session", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
        message: "안녕"
      })
    });

    const res = await chatRoute(req);
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("SESSION_NOT_FOUND");
  });

  it("returns SSE response on valid request", async () => {
    const sessionId = await createTestSession();
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "개념 설명해줘"
      })
    });

    const res = await chatRoute(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-request-id")).toMatch(/^req_[0-9A-HJKMNP-TV-Z]{26}$/);

    const text = await res.text();
    expect(text).toContain("event: message");
    expect(text).toContain("event: done");
    expect(isSessionInFlight(sessionId)).toBe(false);
  });

  it("returns 409 when same session is already in-flight", async () => {
    const sessionId = await createTestSession();
    expect(tryAcquireSession(sessionId)).toBe(true);

    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "안녕"
      })
    });

    const res = await chatRoute(req);
    const body = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(409);
    expect(body.error.code).toBe("SESSION_BUSY");
  });

  it("uses ASK_CLARIFY fallback when needsSources=true and no valid sources", async () => {
    const sessionId = await createTestSession();
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "출처 __NO_SOURCE__ 찾아줘",
        clientOptions: { needsSources: true }
      })
    });

    const events = parseSseEvents(await (await chatRoute(req)).text());
    const messageEvent = events.find((event) => event.event === "message");
    const payload = (messageEvent?.data ?? {}) as { nextAction?: string; sources?: unknown[] };

    expect(payload.nextAction).toBe("ASK_CLARIFY");
    expect(payload.sources).toBeUndefined();
  });

  it("prioritizes forced search attempt even when model confidence is low", async () => {
    const sessionId = await createTestSession();
    const container = getContainer();
    const originalPlan = container.llmPort.planNextAction.bind(container.llmPort);

    container.llmPort.planNextAction = async () => ({
      nextAction: "DIRECT_ANSWER",
      allowedTools: [],
      confidence: 0.1,
      reason: "낮은 신뢰도"
    });

    try {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: "출처 포함 최신 통계를 알려줘",
          clientOptions: { needsSources: true }
        })
      });

      const events = parseSseEvents(await (await chatRoute(req)).text());
      const toolStart = events.find(
        (event) => event.event === "tool" && (event.data as { phase?: string }).phase === "start"
      );
      const messagePayload = (events.find((event) => event.event === "message")?.data ??
        {}) as { nextAction?: string; sources?: unknown[] };

      expect((toolStart?.data as { toolName?: string }).toolName).toBe("search");
      expect(messagePayload.nextAction).toBe("CALL_TOOL");
      expect(Array.isArray(messagePayload.sources)).toBe(true);
      expect((messagePayload.sources ?? []).length).toBeGreaterThan(0);
    } finally {
      container.llmPort.planNextAction = originalPlan;
    }
  });

  it("overrides forced-source ASK_CLARIFY plan to search tool first", async () => {
    const sessionId = await createTestSession();
    const container = getContainer();
    const originalPlan = container.llmPort.planNextAction.bind(container.llmPort);

    container.llmPort.planNextAction = async () => ({
      nextAction: "ASK_CLARIFY",
      allowedTools: [],
      clarifyQuestion: "질문을 더 구체화해 주세요.",
      confidence: 0.2,
      reason: "입력이 모호함"
    });

    try {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: "출처가 있는 최신 통계 근거를 알려줘",
          clientOptions: { needsSources: true }
        })
      });

      const events = parseSseEvents(await (await chatRoute(req)).text());
      const toolStart = events.find(
        (event) => event.event === "tool" && (event.data as { phase?: string }).phase === "start"
      );
      const messagePayload = (events.find((event) => event.event === "message")?.data ??
        {}) as { nextAction?: string; sources?: unknown[] };

      expect((toolStart?.data as { toolName?: string }).toolName).toBe("search");
      expect(messagePayload.nextAction).toBe("CALL_TOOL");
      expect(Array.isArray(messagePayload.sources)).toBe(true);
      expect((messagePayload.sources ?? []).length).toBeGreaterThan(0);
    } finally {
      container.llmPort.planNextAction = originalPlan;
    }
  });

  it("omits sources when needsSources=false and normalized sources are empty", async () => {
    const sessionId = await createTestSession();
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "검색 __NO_SOURCE__ 해줘",
        clientOptions: { needsSources: false }
      })
    });

    const events = parseSseEvents(await (await chatRoute(req)).text());
    const messageEvent = events.find((event) => event.event === "message");
    const payload = (messageEvent?.data ?? {}) as { sources?: unknown[] };

    expect(payload.sources).toBeUndefined();
  });

  it("uses rewritten search query when planner returns a valid query", async () => {
    const sessionId = await createTestSession();
    const container = getContainer();
    const originalPlanner = container.llmPort.planSearchQuery.bind(container.llmPort);
    const searchSpy = vi.spyOn(container.searchPort, "search");

    container.llmPort.planSearchQuery = async () => ({
      searchIntent: "공식 최신 통계 확인",
      searchQueries: ["site:example.com rewritten latest stats"],
      mustInclude: [],
      mustExclude: [],
      answerShape: "latest",
      reason: "재작성 검색어 사용"
    });

    try {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: "최신 통계 알려줘"
        })
      });

      await (await chatRoute(req)).text();

      expect(searchSpy).toHaveBeenCalled();
      expect(searchSpy.mock.calls[0]?.[0]).toMatchObject({
        query: "site:example.com rewritten latest stats"
      });
    } finally {
      container.llmPort.planSearchQuery = originalPlanner;
      searchSpy.mockRestore();
    }
  });

  it("falls back to original message query when planner returns an empty query list", async () => {
    const sessionId = await createTestSession();
    const container = getContainer();
    const originalPlanner = container.llmPort.planSearchQuery.bind(container.llmPort);
    const searchSpy = vi.spyOn(container.searchPort, "search");

    container.llmPort.planSearchQuery = async () => ({
      searchIntent: "검색 실패 fallback",
      searchQueries: [],
      mustInclude: [],
      mustExclude: [],
      answerShape: "latest",
      reason: "빈 쿼리"
    });

    try {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: "관련 논문 찾아줘"
        })
      });

      await (await chatRoute(req)).text();

      expect(searchSpy).toHaveBeenCalled();
      expect(searchSpy.mock.calls[0]?.[0]).toMatchObject({
        query: "관련 논문 찾아줘"
      });
    } finally {
      container.llmPort.planSearchQuery = originalPlanner;
      searchSpy.mockRestore();
    }
  });

  it("emits error + done(ok=false) on unrecoverable tool failure", async () => {
    const sessionId = await createTestSession();
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "__UNRECOVERABLE__ 검색해줘"
      })
    });

    const events = parseSseEvents(await (await chatRoute(req)).text());
    const errorEvent = events.find((event) => event.event === "error");
    const doneEvent = events.find((event) => event.event === "done");
    const messageEvent = events.find((event) => event.event === "message");

    expect(messageEvent).toBeUndefined();
    expect((errorEvent?.data as { code?: string }).code).toBe("TOOL_EXECUTION_ERROR");
    expect((doneEvent?.data as { ok?: boolean; errorCode?: string }).ok).toBe(false);
    expect((doneEvent?.data as { errorCode?: string }).errorCode).toBe("TOOL_EXECUTION_ERROR");
  });

  it("covers four nextAction routes in stub mode", async () => {
    const sessionId = await createTestSession();
    const cases = [
      { message: "개념 설명해줘", expected: "DIRECT_ANSWER" },
      { message: "관련 논문 찾아줘", expected: "CALL_TOOL" },
      { message: "발표 대본으로 변환", expected: "ASK_CLARIFY" },
      { message: "숙제 대신 해줘", expected: "REFUSE" }
    ] as const;

    for (const item of cases) {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: item.message
        })
      });

      const events = parseSseEvents(await (await chatRoute(req)).text());
      const messageEvent = events.find((event) => event.event === "message");
      expect((messageEvent?.data as { nextAction?: string }).nextAction).toBe(item.expected);
    }
  });

  it("handles recoverable timeout with tool error and done.ok=true", async () => {
    const sessionId = await createTestSession();
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "__TIMEOUT__ 검색해줘"
      })
    });

    const res = await chatRoute(req);
    const events = parseSseEvents(await res.text());
    const errorEvents = events.filter((event) => event.event === "error");
    const toolError = events.find(
      (event) =>
        event.event === "tool" && (event.data as { phase?: string; errorCode?: string }).phase === "error"
    );
    const messageEvent = events.find((event) => event.event === "message");
    const doneEvent = events.find((event) => event.event === "done");

    expect(res.status).toBe(200);
    expect(errorEvents).toHaveLength(0);
    expect((toolError?.data as { errorCode?: string }).errorCode).toBe("TOOL_TIMEOUT");
    expect(messageEvent).toBeDefined();
    expect((doneEvent?.data as { ok?: boolean }).ok).toBe(true);
  });

  it("maps model provider failures to event:error(code=MODEL_PROVIDER_ERROR)", async () => {
    const sessionId = await createTestSession();
    const container = getContainer();
    const originalGenerate = container.llmPort.generateDirectAnswer.bind(container.llmPort);
    const db = (container.sqliteRepository as unknown as {
      db: {
        prepare: (
          sql: string
        ) => {
          all: (turnId: string) => Array<{ role: string }>;
          get: (turnId: string) => { c: number };
        };
      };
    }).db;

    container.llmPort.generateDirectAnswer = async () => {
      throw new Error("MODEL_PROVIDER_ERROR");
    };

    try {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: "개념 설명해줘"
        })
      });

      const events = parseSseEvents(await (await chatRoute(req)).text());
      const errorEvent = events.find((event) => event.event === "error");
      const doneEvent = events.find((event) => event.event === "done");
      const donePayload = (doneEvent?.data ?? {}) as { ok?: boolean; errorCode?: string; turnId?: string };

      expect((errorEvent?.data as { code?: string }).code).toBe("MODEL_PROVIDER_ERROR");
      expect(donePayload.ok).toBe(false);
      expect(donePayload.errorCode).toBe("MODEL_PROVIDER_ERROR");

      const turnId = donePayload.turnId ?? "";
      const messageRows = db
        .prepare(`SELECT role FROM messages WHERE turn_id = ? ORDER BY role ASC`)
        .all(turnId) as Array<{ role: string }>;
      const traceCount = db.prepare(`SELECT COUNT(*) AS c FROM decision_traces WHERE turn_id = ?`).get(turnId).c;

      expect(messageRows.map((row) => row.role)).toEqual(["user"]);
      expect(traceCount).toBe(0);
    } finally {
      container.llmPort.generateDirectAnswer = originalGenerate;
    }
  });

  it("treats tool args schema validation failure as recoverable tool error", async () => {
    const sessionId = await createTestSession();
    const container = getContainer();
    const originalPlan = container.llmPort.planNextAction.bind(container.llmPort);

    container.llmPort.planNextAction = async () => ({
      nextAction: "CALL_TOOL",
      allowedTools: ["search"],
      confidence: 0.95,
      reason: "테스트: 강제 search"
    });

    try {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: "a"
        })
      });

      const events = parseSseEvents(await (await chatRoute(req)).text());
      const toolError = events.find(
        (event) =>
          event.event === "tool" && (event.data as { phase?: string }).phase === "error"
      );
      const errorEvents = events.filter((event) => event.event === "error");
      const doneEvent = events.find((event) => event.event === "done");
      const messageEvent = events.find((event) => event.event === "message");

      expect((toolError?.data as { errorCode?: string }).errorCode).toBe("TOOL_EXECUTION_ERROR");
      expect(errorEvents).toHaveLength(0);
      expect(messageEvent).toBeDefined();
      expect((doneEvent?.data as { ok?: boolean }).ok).toBe(true);
    } finally {
      container.llmPort.planNextAction = originalPlan;
    }
  });

  it("sends error+done without message when finalize transaction fails", async () => {
    const sessionId = await createTestSession();
    const container = getContainer();
    const original = container.sqliteRepository.finalizeTurn.bind(container.sqliteRepository);

    container.sqliteRepository.finalizeTurn = () => {
      throw new Error("DB_COMMIT_FAILURE");
    };

    try {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: "개념 설명해줘"
        })
      });

      const events = parseSseEvents(await (await chatRoute(req)).text());
      expect(events.some((event) => event.event === "message")).toBe(false);
      expect(events.some((event) => event.event === "error")).toBe(true);
      expect(
        events.some((event) => event.event === "done" && (event.data as { ok?: boolean }).ok === false)
      ).toBe(true);
    } finally {
      container.sqliteRepository.finalizeTurn = original;
    }
  });

  it("keeps strict payload fields for message/done events", async () => {
    const sessionId = await createTestSession();
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "개념 설명해줘",
        clientOptions: { debug: true }
      })
    });

    const res = await chatRoute(req);
    const requestId = res.headers.get("x-request-id");
    const events = parseSseEvents(await res.text());
    const messageEvent = events.find((event) => event.event === "message");
    const doneEvent = events.find((event) => event.event === "done");

    expect(Object.keys((messageEvent?.data ?? {}) as Record<string, unknown>).sort()).toEqual(
      ["debug", "nextAction", "text", "turnId"].sort()
    );
    expect(Object.keys((doneEvent?.data ?? {}) as Record<string, unknown>).sort()).toEqual(
      ["latencyMs", "ok", "turnId"].sort()
    );
    expect(((messageEvent?.data ?? {}) as { debug?: { requestId?: string } }).debug?.requestId).toMatch(
      /^req_[0-9A-HJKMNP-TV-Z]{26}$/
    );
    expect(requestId).toMatch(/^req_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("enforces SSE cardinality for a successful request", async () => {
    const sessionId = await createTestSession();
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "관련 논문 찾아줘"
      })
    });

    const events = parseSseEvents(await (await chatRoute(req)).text());
    const messageEvents = events.filter((event) => event.event === "message");
    const doneEvents = events.filter((event) => event.event === "done");
    const errorEvents = events.filter((event) => event.event === "error");
    const toolStarts = events.filter(
      (event) => event.event === "tool" && (event.data as { phase?: string }).phase === "start"
    );
    const toolEnds = events.filter(
      (event) =>
        event.event === "tool" &&
        ["success", "error"].includes((event.data as { phase?: string }).phase ?? "")
    );

    expect(messageEvents).toHaveLength(1);
    expect(doneEvents).toHaveLength(1);
    expect(errorEvents).toHaveLength(0);
    expect(toolStarts.length).toBeGreaterThanOrEqual(1);
    expect(toolEnds).toHaveLength(toolStarts.length);
  });

  it("keeps strict payload fields for tool/error events", async () => {
    const sessionId = await createTestSession();

    const timeoutReq = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "__TIMEOUT__ 검색해줘"
      })
    });
    const timeoutEvents = parseSseEvents(await (await chatRoute(timeoutReq)).text());
    const toolStart = timeoutEvents.find(
      (event) => event.event === "tool" && (event.data as { phase?: string }).phase === "start"
    )?.data as Record<string, unknown>;
    const toolError = timeoutEvents.find(
      (event) => event.event === "tool" && (event.data as { phase?: string }).phase === "error"
    )?.data as Record<string, unknown>;

    expect(Object.keys(toolStart).sort()).toEqual(["phase", "toolCallId", "toolName", "turnId"].sort());
    expect(Object.keys(toolError).sort()).toEqual(
      ["errorCode", "message", "phase", "toolCallId", "toolName", "turnId"].sort()
    );

    const unrecoverableReq = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "__UNRECOVERABLE__ 검색해줘"
      })
    });
    const unrecoverableEvents = parseSseEvents(await (await chatRoute(unrecoverableReq)).text());
    const errorPayload = unrecoverableEvents.find((event) => event.event === "error")
      ?.data as Record<string, unknown>;

    expect(Object.keys(errorPayload).sort()).toEqual(["code", "message", "turnId"].sort());
  });

  it("releases in-flight lock when request is aborted", async () => {
    const sessionId = await createTestSession();
    const controller = new AbortController();
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "__TIMEOUT__ 검색해줘"
      }),
      signal: controller.signal
    });

    const resPromise = chatRoute(req);
    controller.abort();
    const res = await resPromise;
    await res.text();

    expect(isSessionInFlight(sessionId)).toBe(false);
  });

  it("does not persist turn rows when request is aborted", async () => {
    const sessionId = await createTestSession();
    const container = getContainer();
    const db = (container.sqliteRepository as unknown as {
      db: { prepare: (sql: string) => { get: (sessionId: string) => { c: number } } };
    }).db;

    const countRows = () => {
      const messageCount = db
        .prepare(`SELECT COUNT(*) AS c FROM messages WHERE session_id = ?`)
        .get(sessionId).c;
      const toolCount = db
        .prepare(`SELECT COUNT(*) AS c FROM tool_executions WHERE session_id = ?`)
        .get(sessionId).c;
      const traceCount = db
        .prepare(`SELECT COUNT(*) AS c FROM decision_traces WHERE session_id = ?`)
        .get(sessionId).c;
      return { messageCount, toolCount, traceCount };
    };

    expect(countRows()).toEqual({
      messageCount: 0,
      toolCount: 0,
      traceCount: 0
    });

    const controller = new AbortController();
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "__TIMEOUT__ 검색해줘"
      }),
      signal: controller.signal
    });

    const resPromise = chatRoute(req);
    controller.abort();
    const res = await resPromise;
    await res.text();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(countRows()).toEqual({
      messageCount: 0,
      toolCount: 0,
      traceCount: 0
    });
  });

  it("persists, caps, and resets consecutiveToolFailureTurns across turns", async () => {
    const sessionId = await createTestSession();

    const failReq1 = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "__TIMEOUT__ 검색해줘"
      })
    });
    await (await chatRoute(failReq1)).text();

    const container = getContainer();
    const afterFail1 = await container.sqliteRepository.getSession(sessionId);
    expect(afterFail1?.consecutiveToolFailureTurns).toBe(1);

    const failReq2 = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "__TIMEOUT__ 검색해줘"
      })
    });
    await (await chatRoute(failReq2)).text();

    const afterFail2 = await container.sqliteRepository.getSession(sessionId);
    expect(afterFail2?.consecutiveToolFailureTurns).toBe(0);

    const failReq3 = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "__TIMEOUT__ 검색해줘"
      })
    });
    await (await chatRoute(failReq3)).text();

    const afterFail3 = await container.sqliteRepository.getSession(sessionId);
    expect(afterFail3?.consecutiveToolFailureTurns).toBe(1);

    const successReq = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "개념 설명해줘"
      })
    });
    await (await chatRoute(successReq)).text();

    const afterSuccess = await container.sqliteRepository.getSession(sessionId);
    expect(afterSuccess?.consecutiveToolFailureTurns).toBe(0);
  });

  it("enforces turn storage cardinality by done status", async () => {
    const sessionId = await createTestSession();
    const container = getContainer();
    const db = (container.sqliteRepository as unknown as {
      db: { prepare: (sql: string) => { all: (sessionId: string) => Array<{ turn_id: string; role?: string }>; get: (turnId: string) => { c: number } } };
    }).db;

    const okReq = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "개념 설명해줘"
      })
    });
    const okEvents = parseSseEvents(await (await chatRoute(okReq)).text());
    const okTurnId = (okEvents.find((event) => event.event === "done")?.data as { turnId?: string }).turnId ?? "";

    const badReq = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "__UNRECOVERABLE__ 검색해줘"
      })
    });
    const badEvents = parseSseEvents(await (await chatRoute(badReq)).text());
    const badTurnId = (badEvents.find((event) => event.event === "done")?.data as { turnId?: string }).turnId ?? "";

    const okMessages = db
      .prepare(`SELECT role, turn_id FROM messages WHERE turn_id = ? ORDER BY role ASC`)
      .all(okTurnId) as Array<{ role: string; turn_id: string }>;
    const okTraces = db.prepare(`SELECT COUNT(*) AS c FROM decision_traces WHERE turn_id = ?`).get(okTurnId).c;

    const badMessages = db
      .prepare(`SELECT role, turn_id FROM messages WHERE turn_id = ? ORDER BY role ASC`)
      .all(badTurnId) as Array<{ role: string; turn_id: string }>;
    const badTraces = db.prepare(`SELECT COUNT(*) AS c FROM decision_traces WHERE turn_id = ?`).get(badTurnId).c;

    expect(okMessages.map((row) => row.role).sort()).toEqual(["ai", "user"]);
    expect(okTraces).toBe(1);

    expect(badMessages.map((row) => row.role)).toEqual(["user"]);
    expect(badTraces).toBe(0);
  });

  it("stores tool_executions rows only for started calls with ok/result/latency rules", async () => {
    const sessionId = await createTestSession();
    const container = getContainer();
    const db = (container.sqliteRepository as unknown as {
      db: { prepare: (sql: string) => { all: (turnId: string) => Array<Record<string, unknown>> } };
    }).db;

    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: "__TIMEOUT__ 검색해줘"
      })
    });

    const events = parseSseEvents(await (await chatRoute(req)).text());
    const turnId = (events.find((event) => event.event === "done")?.data as { turnId?: string }).turnId ?? "";
    const startedIds = new Set(
      events
        .filter((event) => event.event === "tool" && (event.data as { phase?: string }).phase === "start")
        .map((event) => (event.data as { toolCallId: string }).toolCallId)
    );

    const rows = db
      .prepare(
        `SELECT tool_call_id, ok, latency_ms, result
         FROM tool_executions
         WHERE turn_id = ?
         ORDER BY created_at ASC, tool_call_id ASC`
      )
      .all(turnId) as Array<{ tool_call_id: string; ok: number; latency_ms: number; result: string }>;

    expect(rows.map((row) => row.tool_call_id).every((id) => startedIds.has(id))).toBe(true);
    expect(rows.every((row) => row.ok === 0)).toBe(true);
    expect(rows.every((row) => row.latency_ms >= 0)).toBe(true);

    const parsedResults = rows.map((row) => JSON.parse(row.result) as { errorCode?: string; message?: string });
    expect(parsedResults.every((item) => item.errorCode && item.message)).toBe(true);
  });
});
