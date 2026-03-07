import { beforeEach, describe, expect, it } from "vitest";
import { resetContainerForTest } from "@/composition/container";
import { POST as createSession } from "@/app/api/sessions/route";
import { POST as chatRoute } from "@/app/api/chat/route";
import { StubLlmAdapter } from "@/infrastructure/llm/stubLlmAdapter";

beforeEach(() => {
  resetContainerForTest();
});

function parseSseEvents(raw: string): Array<{ event: string; data: Record<string, unknown> }> {
  return raw
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const event = lines.find((line) => line.startsWith("event: "))?.replace("event: ", "") ?? "";
      const dataLine = lines.find((line) => line.startsWith("data: "))?.replace("data: ", "") ?? "{}";
      return {
        event,
        data: JSON.parse(dataLine) as Record<string, unknown>
      };
    });
}

async function createTestSession(masterContext: string): Promise<string> {
  const req = new Request("http://localhost/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ masterContext })
  });
  const res = await createSession(req);
  const body = (await res.json()) as { sessionId: string };
  return body.sessionId;
}

async function runChat(sessionId: string, message: string): Promise<Array<{ event: string; data: Record<string, unknown> }>> {
  const req = new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId,
      message
    })
  });
  const res = await chatRoute(req);
  return parseSseEvents(await res.text());
}

describe("DoD regression checks", () => {
  it("reflects master context in direct answer text", async () => {
    const sessionA = await createTestSession("수학 과외 맥락으로 답변하며 개념 연결을 강조합니다.");
    const sessionB = await createTestSession("역사 과외 맥락으로 답변하며 사건 배경을 강조합니다.");

    const eventsA = await runChat(sessionA, "개념 설명해줘");
    const eventsB = await runChat(sessionB, "개념 설명해줘");

    const textA = eventsA.find((event) => event.event === "message")?.data.text;
    const textB = eventsB.find((event) => event.event === "message")?.data.text;

    expect(typeof textA).toBe("string");
    expect(typeof textB).toBe("string");
    expect(textA).not.toBe(textB);
    expect(String(textA)).toContain("맥락 반영 답변");
    expect(String(textB)).toContain("맥락 반영 답변");
  });

  it("keeps recoverable tool failure fallback success rate at 100% on sample set", async () => {
    const sessionId = await createTestSession("도구 실패 fallback 보장 검증용 맥락 데이터");
    const sampleCount = 12;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < sampleCount; i += 1) {
      const events = await runChat(sessionId, "__TIMEOUT__ 검색해줘");
      const hasRecoverableToolError = events.some(
        (event) => event.event === "tool" && event.data.phase === "error"
      );
      if (!hasRecoverableToolError) {
        continue;
      }

      denominator += 1;
      const doneOk = events.find((event) => event.event === "done")?.data.ok === true;
      const hasMessage = events.some((event) => event.event === "message");
      if (doneOk && hasMessage) {
        numerator += 1;
      }
    }

    expect(denominator).toBeGreaterThan(0);
    expect(numerator / denominator).toBe(1);
  });

  it("meets routing quality targets on 50-sample labeled set", async () => {
    const adapter = new StubLlmAdapter();

    const callToolNeeded = Array.from({ length: 20 }, (_, i) => `최신 통계 검색 ${i}`);
    const directPossible = Array.from({ length: 20 }, (_, i) => `개념 설명 ${i}`);
    const clarifyExpected = Array.from({ length: 5 }, (_, i) => `발표 대본 변환 ${i}`);
    const refuseExpected = Array.from({ length: 5 }, (_, i) => `숙제 대신 해줘 ${i}`);

    let callToolEntered = 0;
    for (const message of callToolNeeded) {
      const route = await adapter.planNextAction({
        sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
        message,
        masterContext: "학습 코치형",
        forceSourceMode: "FORCED",
        history: []
      });
      if (route.nextAction === "CALL_TOOL") {
        callToolEntered += 1;
      }
    }

    let unnecessaryToolCalls = 0;
    for (const message of directPossible) {
      const route = await adapter.planNextAction({
        sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
        message,
        masterContext: "학습 코치형",
        forceSourceMode: "NOT_FORCED",
        history: []
      });
      if (route.nextAction === "CALL_TOOL") {
        unnecessaryToolCalls += 1;
      }
    }

    for (const message of clarifyExpected) {
      const route = await adapter.planNextAction({
        sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
        message,
        masterContext: "학습 코치형",
        forceSourceMode: "NOT_FORCED",
        history: []
      });
      expect(route.nextAction).toBe("ASK_CLARIFY");
    }

    for (const message of refuseExpected) {
      const route = await adapter.planNextAction({
        sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
        message,
        masterContext: "학습 코치형",
        forceSourceMode: "NOT_FORCED",
        history: []
      });
      expect(route.nextAction).toBe("REFUSE");
    }

    const callToolEntryRate = callToolEntered / callToolNeeded.length;
    const unnecessaryCallRate = unnecessaryToolCalls / directPossible.length;

    expect(callToolEntryRate).toBeGreaterThanOrEqual(0.85);
    expect(unnecessaryCallRate).toBeLessThanOrEqual(0.1);
  });
});
