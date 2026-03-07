import { beforeEach, describe, expect, it } from "vitest";
import { getContainer, resetContainerForTest } from "@/composition/container";
import { POST as createSession } from "@/app/api/sessions/route";
import { GET as getSession } from "@/app/api/sessions/[sessionId]/route";
import { POST as searchTool } from "@/app/api/tools/search/route";
import { POST as transformTool } from "@/app/api/tools/transform/route";

beforeEach(() => {
  resetContainerForTest();
});

async function createSessionForTools(): Promise<string> {
  const createReq = new Request("http://localhost/api/sessions", {
    method: "POST",
    body: JSON.stringify({
      masterContext: "이번 과제는 AI 오케스트레이션 MVP 구현이며, 과정 중심으로 작성해야 한다."
    }),
    headers: { "content-type": "application/json" }
  });
  const createRes = await createSession(createReq);
  const createBody = (await createRes.json()) as { sessionId: string };
  return createBody.sessionId;
}

describe("/api/sessions", () => {
  it("creates a session and retrieves it", async () => {
    const createReq = new Request("http://localhost/api/sessions", {
      method: "POST",
      body: JSON.stringify({
        masterContext: "이번 과제는 AI 오케스트레이션 MVP 구현이며, 과정 중심으로 작성해야 한다."
      }),
      headers: { "content-type": "application/json" }
    });

    const createRes = await createSession(createReq);
    const createBody = (await createRes.json()) as {
      sessionId: string;
      masterContextSummary: string;
      createdAt: string;
    };

    expect(createRes.status).toBe(200);
    expect(createBody.sessionId.startsWith("sess_")).toBe(true);
    expect(createRes.headers.get("x-request-id")).toMatch(/^req_[0-9A-HJKMNP-TV-Z]{26}$/);

    const getRes = await getSession(new Request("http://localhost/api/sessions/id"), {
      params: Promise.resolve({ sessionId: createBody.sessionId })
    });
    const getBody = (await getRes.json()) as {
      sessionId: string;
      masterContext: string;
      masterContextSummary: string;
      createdAt: string;
    };

    expect(getRes.status).toBe(200);
    expect(getBody.sessionId).toBe(createBody.sessionId);
    expect(getBody.masterContextSummary.length).toBeGreaterThan(0);
  });

  it("returns validation error for short masterContext", async () => {
    const req = new Request("http://localhost/api/sessions", {
      method: "POST",
      body: JSON.stringify({ masterContext: "짧음" }),
      headers: { "content-type": "application/json" }
    });

    const res = await createSession(req);
    const body = (await res.json()) as {
      error: { code: string; requestId: string; details?: { fields?: Array<{ path: string; reason: string }> } };
    };

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details?.fields?.[0]?.path).toBe("masterContext");
    expect(res.headers.get("x-request-id")).toBe(body.error.requestId);
  });

  it("returns 422 for invalid session id format", async () => {
    const res = await getSession(new Request("http://localhost/api/sessions/id"), {
      params: Promise.resolve({ sessionId: "sess_invalid" })
    });

    expect(res.status).toBe(422);
  });

  it("returns 404 for unknown session id", async () => {
    const res = await getSession(new Request("http://localhost/api/sessions/id"), {
      params: Promise.resolve({ sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P" })
    });
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("SESSION_NOT_FOUND");
  });

  it("returns 500 and does not create data when create transaction fails", async () => {
    const container = getContainer();
    const original = container.sqliteRepository.createSession.bind(container.sqliteRepository);
    container.sqliteRepository.createSession = async () => {
      throw new Error("FORCED_CREATE_SESSION_FAILURE");
    };

    try {
      const req = new Request("http://localhost/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          masterContext: "이번 과제는 AI 오케스트레이션 MVP 구현이며, 과정 중심으로 작성해야 한다."
        }),
        headers: { "content-type": "application/json" }
      });
      const res = await createSession(req);
      const body = (await res.json()) as { error: { code: string } };

      expect(res.status).toBe(500);
      expect(body.error.code).toBe("INTERNAL_SERVER_ERROR");

      const db = (container.sqliteRepository as unknown as { db: { prepare: (sql: string) => { get: () => { c: number } } } }).db;
      const sessionCount = db.prepare(`SELECT COUNT(*) AS c FROM sessions`).get().c;
      const contextCount = db.prepare(`SELECT COUNT(*) AS c FROM master_contexts`).get().c;
      expect(sessionCount).toBe(0);
      expect(contextCount).toBe(0);
    } finally {
      container.sqliteRepository.createSession = original;
    }
  });
});

describe("/api/tools/*", () => {
  it("returns 401 before body validation when token is missing", async () => {
    const req = new Request("http://localhost/api/tools/search", {
      method: "POST",
      body: JSON.stringify({ sessionId: "invalid", query: "x" }),
      headers: { "content-type": "application/json" }
    });

    const res = await searchTool(req);
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED_INTERNAL_ACCESS");
  });

  it("returns 422 for invalid body with valid token", async () => {
    const req = new Request("http://localhost/api/tools/search", {
      method: "POST",
      body: JSON.stringify({ sessionId: "invalid", query: "x" }),
      headers: {
        "content-type": "application/json",
        "x-internal-tool-token": "test-internal-token"
      }
    });

    const res = await searchTool(req);
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when session does not exist", async () => {
    const req = new Request("http://localhost/api/tools/search", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
        query: "langgraph",
        topK: 3
      }),
      headers: {
        "content-type": "application/json",
        "x-internal-tool-token": "test-internal-token"
      }
    });

    const res = await searchTool(req);
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("SESSION_NOT_FOUND");
  });

  it("executes search and transform with valid token and existing session", async () => {
    const sessionId = await createSessionForTools();

    const searchReq = new Request("http://localhost/api/tools/search", {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        query: "langgraph",
        topK: 2
      }),
      headers: {
        "content-type": "application/json",
        "x-internal-tool-token": "test-internal-token"
      }
    });

    const searchRes = await searchTool(searchReq);
    const searchBody = (await searchRes.json()) as {
      items: Array<{ source: string; snippet: string }>;
    };
    expect(searchRes.status).toBe(200);
    expect(searchBody.items).toHaveLength(2);
    expect(typeof searchBody.items[0]?.snippet).toBe("string");

    const transformReq = new Request("http://localhost/api/tools/transform", {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        text: "원문 텍스트",
        targetFormat: "summary"
      }),
      headers: {
        "content-type": "application/json",
        "x-internal-tool-token": "test-internal-token"
      }
    });

    const transformRes = await transformTool(transformReq);
    const transformBody = (await transformRes.json()) as { resultText: string };
    expect(transformRes.status).toBe(200);
    expect(transformBody.resultText.length).toBeGreaterThan(0);
  });

  it("returns 401 before body validation in transform route", async () => {
    const req = new Request("http://localhost/api/tools/transform", {
      method: "POST",
      body: JSON.stringify({ sessionId: "invalid", text: "", targetFormat: "bad" }),
      headers: { "content-type": "application/json" }
    });

    const res = await transformTool(req);
    const body = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED_INTERNAL_ACCESS");
  });

  it("returns 422 for invalid transform body with valid token", async () => {
    const req = new Request("http://localhost/api/tools/transform", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
        text: "",
        targetFormat: "bad"
      }),
      headers: {
        "content-type": "application/json",
        "x-internal-tool-token": "test-internal-token"
      }
    });

    const res = await transformTool(req);
    const body = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when transform session does not exist", async () => {
    const req = new Request("http://localhost/api/tools/transform", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
        text: "원문 텍스트",
        targetFormat: "outline"
      }),
      headers: {
        "content-type": "application/json",
        "x-internal-tool-token": "test-internal-token"
      }
    });

    const res = await transformTool(req);
    const body = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(404);
    expect(body.error.code).toBe("SESSION_NOT_FOUND");
  });
});
