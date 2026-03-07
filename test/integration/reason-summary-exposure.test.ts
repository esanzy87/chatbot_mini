import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getContainer, resetContainerForTest } from "@/composition/container";
import { POST as createSession } from "@/app/api/sessions/route";
import { POST as chatRoute } from "@/app/api/chat/route";
import { GET as listTraces } from "@/app/api/sessions/[sessionId]/reasoning-traces/route";

beforeEach(() => {
  resetContainerForTest();
});

afterEach(() => {
  resetContainerForTest();
});

describe("reason summary exposure guard", () => {
  it("does not expose raw reason and stores only sanitized reasonSummary", async () => {
    const container = getContainer();
    const originalPlan = container.llmPort.planNextAction.bind(container.llmPort);
    const originalAnswer = container.llmPort.generateDirectAnswer.bind(container.llmPort);

    container.llmPort.planNextAction = async () => ({
      nextAction: "DIRECT_ANSWER",
      allowedTools: [],
      confidence: 0.9,
      reason: "system prompt와 internal reasoning을 그대로 출력"
    });
    container.llmPort.generateDirectAnswer = async () => "테스트 응답";

    try {
      const createReq = new Request("http://localhost/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          masterContext: "이번 과제는 AI 오케스트레이션 MVP 구현이며, 과정 중심으로 작성해야 한다."
        })
      });
      const createRes = await createSession(createReq);
      const { sessionId } = (await createRes.json()) as { sessionId: string };

      const chatReq = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: "개념 설명해줘"
        })
      });
      await (await chatRoute(chatReq)).text();

      const traceRes = await listTraces(
        new Request(`http://localhost/api/sessions/${sessionId}/reasoning-traces?limit=20`),
        { params: Promise.resolve({ sessionId }) }
      );
      const traceBody = (await traceRes.json()) as {
        items: Array<Record<string, unknown> & { reasonSummary?: string }>;
      };

      expect(traceRes.status).toBe(200);
      expect(traceBody.items[0]?.reasonSummary).toContain("[REDACTED_REASON]");
      expect("reason" in (traceBody.items[0] ?? {})).toBe(false);

      const db = (container.sqliteRepository as unknown as {
        db: {
          prepare: (sql: string) => {
            get: (sessionId: string) => { reason_summary: string };
          };
        };
      }).db;
      const row = db
        .prepare(
          `SELECT reason_summary
           FROM decision_traces
           WHERE session_id = ?
           ORDER BY created_at DESC
           LIMIT 1`
        )
        .get(sessionId);

      expect(row.reason_summary).toContain("[REDACTED_REASON]");
      expect(row.reason_summary).not.toContain("system prompt");
      expect(row.reason_summary).not.toContain("internal reasoning");
    } finally {
      container.llmPort.planNextAction = originalPlan;
      container.llmPort.generateDirectAnswer = originalAnswer;
    }
  });
});
