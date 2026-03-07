import { beforeEach, describe, expect, it } from "vitest";
import { resetContainerForTest } from "@/composition/container";
import { POST as createSession } from "@/app/api/sessions/route";
import { GET as getSession } from "@/app/api/sessions/[sessionId]/route";
import { POST as chatRoute } from "@/app/api/chat/route";

beforeEach(() => {
  resetContainerForTest();
});

describe("x-request-id propagation", () => {
  it("sets server-generated request id on success and ignores client-provided header", async () => {
    const req = new Request("http://localhost/api/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req_01BADCLIENTIDBADCLIENTID123"
      },
      body: JSON.stringify({
        masterContext: "이번 과제는 AI 오케스트레이션 MVP 구현이며, 과정 중심으로 작성해야 한다."
      })
    });

    const res = await createSession(req);
    const headerRequestId = res.headers.get("x-request-id");

    expect(res.status).toBe(200);
    expect(headerRequestId).toMatch(/^req_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(headerRequestId).not.toBe("req_01BADCLIENTIDBADCLIENTID123");
  });

  it("keeps error.requestId equal to x-request-id header on JSON errors", async () => {
    const res = await getSession(new Request("http://localhost/api/sessions/bad"), {
      params: Promise.resolve({ sessionId: "sess_invalid" })
    });
    const body = (await res.json()) as { error: { requestId: string } };

    expect(res.status).toBe(422);
    expect(body.error.requestId).toMatch(/^req_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(res.headers.get("x-request-id")).toBe(body.error.requestId);
  });

  it("matches SSE handshake x-request-id with message.debug.requestId when debug=true", async () => {
    const createReq = new Request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        masterContext: "이번 과제는 AI 오케스트레이션 MVP 구현이며, 과정 중심으로 작성해야 한다."
      })
    });
    const createRes = await createSession(createReq);
    const createBody = (await createRes.json()) as { sessionId: string };

    const chatReq = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: createBody.sessionId,
        message: "개념 설명해줘",
        clientOptions: { debug: true }
      })
    });

    const chatRes = await chatRoute(chatReq);
    const handshakeRequestId = chatRes.headers.get("x-request-id");
    const raw = await chatRes.text();
    const blocks = raw
      .trim()
      .split("\n\n")
      .filter(Boolean);
    const messageBlock = blocks.find((block) => block.startsWith("event: message"));
    const dataLine = messageBlock?.split("\n").find((line) => line.startsWith("data: "));
    const payload = JSON.parse((dataLine ?? "data: {}").replace("data: ", "")) as {
      debug?: { requestId?: string };
    };

    expect(handshakeRequestId).toMatch(/^req_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(payload.debug?.requestId).toBe(handshakeRequestId);
  });
});
