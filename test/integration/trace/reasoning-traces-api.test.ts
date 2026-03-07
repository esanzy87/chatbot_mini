import { beforeEach, describe, expect, it } from "vitest";
import { resetContainerForTest, getContainer } from "@/composition/container";
import { GET as listTraces } from "@/app/api/sessions/[sessionId]/reasoning-traces/route";
import { createEntityId } from "@/core/id/ids";

beforeEach(() => {
  resetContainerForTest();
});

async function seedSessionAndTraces() {
  const container = getContainer();
  const repo = container.sqliteRepository;

  await repo.createSession({
    sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
    masterContext: "context",
    masterContextSummary: "summary",
    createdAt: "2026-03-07T10:00:00.000Z"
  });

  await repo.appendDecisionTrace({
    sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
    turnId: "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3P",
    nextAction: "CALL_TOOL",
    reasonSummary: "r1",
    allowedTools: ["search"],
    createdAt: "2026-03-07T10:10:00.000Z"
  });

  await repo.appendToolExecutions({
    sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
    turnId: "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3P",
    items: [
      {
        id: createEntityId(),
        toolCallId: "tool_01HW8K6M2K4VQX3D4N0Y7AZ9HA",
        toolName: "search",
        args: {},
        result: {},
        ok: true,
        latencyMs: 10,
        createdAt: "2026-03-07T10:10:00.100Z"
      },
      {
        id: createEntityId(),
        toolCallId: "tool_01HW8K6M2K4VQX3D4N0Y7AZ9HB",
        toolName: "search",
        args: {},
        result: {},
        ok: true,
        latencyMs: 20,
        createdAt: "2026-03-07T10:10:00.000Z"
      }
    ]
  });

  await repo.appendDecisionTrace({
    sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
    turnId: "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3Q",
    nextAction: "DIRECT_ANSWER",
    reasonSummary: "r2",
    allowedTools: [],
    createdAt: "2026-03-07T10:10:00.000Z"
  });
}

describe("GET /api/sessions/{sessionId}/reasoning-traces", () => {
  it("returns 404 for non-existing session", async () => {
    const res = await listTraces(
      new Request("http://localhost/api/sessions/sess_01HW8K4X4X5N9F3D1E7Q2R6M8P/reasoning-traces"),
      { params: Promise.resolve({ sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P" }) }
    );

    const body = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(404);
    expect(body.error.code).toBe("SESSION_NOT_FOUND");
  });

  it("returns validation error for invalid limit", async () => {
    await seedSessionAndTraces();

    const res = await listTraces(
      new Request("http://localhost/api/sessions/sess_01HW8K4X4X5N9F3D1E7Q2R6M8P/reasoning-traces?limit=0"),
      { params: Promise.resolve({ sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P" }) }
    );

    expect(res.status).toBe(422);
  });

  it("returns INVALID_CURSOR for malformed cursor", async () => {
    await seedSessionAndTraces();

    const res = await listTraces(
      new Request(
        "http://localhost/api/sessions/sess_01HW8K4X4X5N9F3D1E7Q2R6M8P/reasoning-traces?cursor=invalid=cursor"
      ),
      { params: Promise.resolve({ sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P" }) }
    );

    const body = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("INVALID_CURSOR");
  });

  it("supports tie-break ordering and cursor pagination", async () => {
    await seedSessionAndTraces();

    const firstRes = await listTraces(
      new Request("http://localhost/api/sessions/sess_01HW8K4X4X5N9F3D1E7Q2R6M8P/reasoning-traces?limit=1"),
      { params: Promise.resolve({ sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P" }) }
    );

    const firstBody = (await firstRes.json()) as {
      nextCursor: string | null;
      items: Array<{ turnId: string; toolExecutions: Array<{ toolCallId: string }> }>;
    };

    expect(firstRes.status).toBe(200);
    expect(firstBody.items).toHaveLength(1);
    expect(firstBody.nextCursor).not.toBeNull();
    expect(firstBody.items[0]?.turnId).toBe("turn_01HW8K6K8C8Q4A9R9N4V2N7Q3Q");
    expect("reason" in (firstBody.items[0] as Record<string, unknown>)).toBe(false);

    const secondRes = await listTraces(
      new Request(
        `http://localhost/api/sessions/sess_01HW8K4X4X5N9F3D1E7Q2R6M8P/reasoning-traces?limit=1&cursor=${firstBody.nextCursor}`
      ),
      { params: Promise.resolve({ sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P" }) }
    );

    const secondBody = (await secondRes.json()) as {
      nextCursor: string | null;
      items: Array<{ turnId: string; toolExecutions: Array<{ toolCallId: string }> }>;
    };

    expect(secondRes.status).toBe(200);
    expect(secondBody.items[0]?.turnId).toBe("turn_01HW8K6K8C8Q4A9R9N4V2N7Q3P");
    expect(secondBody.items[0]?.toolExecutions[0]?.toolCallId).toBe("tool_01HW8K6M2K4VQX3D4N0Y7AZ9HB");
  });

  it("returns empty items with nextCursor null", async () => {
    const container = getContainer();
    await container.sqliteRepository.createSession({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      masterContext: "context",
      masterContextSummary: "summary",
      createdAt: "2026-03-07T10:00:00.000Z"
    });

    const res = await listTraces(
      new Request("http://localhost/api/sessions/sess_01HW8K4X4X5N9F3D1E7Q2R6M8P/reasoning-traces"),
      { params: Promise.resolve({ sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P" }) }
    );

    const body = (await res.json()) as { nextCursor: string | null; items: unknown[] };
    expect(res.status).toBe(200);
    expect(body.items).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });
});
