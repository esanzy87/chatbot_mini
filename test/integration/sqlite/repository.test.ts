import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeSqliteDatabase, openSqliteDatabase } from "@/infrastructure/sqlite/database";
import { applySchema } from "@/infrastructure/sqlite/schema";
import { SqliteRepository } from "@/infrastructure/sqlite/repository";
import { createEntityId } from "@/core/id/ids";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function setupRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-mini-repo-"));
  tempDirs.push(dir);
  const db = openSqliteDatabase(path.join(dir, "test.sqlite"));
  applySchema(db);
  const repo = new SqliteRepository(db);
  return { db, repo };
}

describe("sqlite repository", () => {
  it("creates, loads and updates session counter", async () => {
    const { db, repo } = setupRepo();

    await repo.createSession({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      masterContext: "context",
      masterContextSummary: "summary",
      createdAt: "2026-03-07T10:00:00.000Z"
    });

    const loaded = await repo.getSession("sess_01HW8K4X4X5N9F3D1E7Q2R6M8P");
    expect(loaded?.masterContext).toBe("context");

    await repo.updateConsecutiveToolFailureTurns({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      consecutiveToolFailureTurns: 2,
      updatedAt: "2026-03-07T10:01:00.000Z"
    });

    const updated = await repo.getSession("sess_01HW8K4X4X5N9F3D1E7Q2R6M8P");
    expect(updated?.consecutiveToolFailureTurns).toBe(2);

    closeSqliteDatabase(db);
  });

  it("stores user+ai messages for a turn", async () => {
    const { db, repo } = setupRepo();

    await repo.createSession({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      masterContext: "context",
      masterContextSummary: "summary",
      createdAt: "2026-03-07T10:00:00.000Z"
    });

    await repo.appendMessages({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      turnId: "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M",
      createdAt: "2026-03-07T10:00:01.000Z",
      messages: [
        { role: "user", content: "질문" },
        { role: "ai", content: "응답" }
      ]
    });

    const messages = await repo.listMessages("sess_01HW8K4X4X5N9F3D1E7Q2R6M8P");
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("user");
    expect(messages[1]?.role).toBe("ai");

    closeSqliteDatabase(db);
  });

  it("stores tool executions one row per toolCallId", async () => {
    const { db, repo } = setupRepo();

    await repo.createSession({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      masterContext: "context",
      masterContextSummary: "summary",
      createdAt: "2026-03-07T10:00:00.000Z"
    });

    await repo.appendToolExecutions({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      turnId: "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M",
      items: [
        {
          id: createEntityId(),
          toolCallId: "tool_01HW8K6M2K4VQX3D4N0Y7AZ9HS",
          toolName: "search",
          args: { query: "a" },
          result: { ok: true },
          ok: true,
          latencyMs: 10,
          createdAt: "2026-03-07T10:00:01.000Z"
        }
      ]
    });

    const count = (
      db.prepare(`SELECT COUNT(*) AS c FROM tool_executions WHERE turn_id = ?`).get("turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M") as {
        c: number;
      }
    ).c;
    expect(count).toBe(1);

    closeSqliteDatabase(db);
  });

  it("lists reasoning traces with cursor and tool execution ordering", async () => {
    const { db, repo } = setupRepo();

    await repo.createSession({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      masterContext: "context",
      masterContextSummary: "summary",
      createdAt: "2026-03-07T10:00:00.000Z"
    });

    await repo.appendDecisionTrace({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      turnId: "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M",
      nextAction: "CALL_TOOL",
      reasonSummary: "rs1",
      allowedTools: ["search"],
      createdAt: "2026-03-07T10:10:00.000Z"
    });

    await repo.appendToolExecutions({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      turnId: "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M",
      items: [
        {
          id: createEntityId(),
          toolCallId: "tool_01HW8K6M2K4VQX3D4N0Y7AZ9HZ",
          toolName: "search",
          args: {},
          result: {},
          ok: true,
          latencyMs: 30,
          createdAt: "2026-03-07T10:10:01.000Z"
        },
        {
          id: createEntityId(),
          toolCallId: "tool_01HW8K6M2K4VQX3D4N0Y7AZ9HY",
          toolName: "search",
          args: {},
          result: {},
          ok: true,
          latencyMs: 20,
          createdAt: "2026-03-07T10:10:00.500Z"
        }
      ]
    });

    await repo.appendDecisionTrace({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      turnId: "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3N",
      nextAction: "DIRECT_ANSWER",
      reasonSummary: "rs2",
      allowedTools: [],
      createdAt: "2026-03-07T10:09:00.000Z"
    });

    const first = await repo.listReasoningTraces({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      limit: 1
    });

    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    expect(first.items[0]?.turnId).toBe("turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M");
    expect(first.items[0]?.toolExecutions[0]?.toolCallId).toBe("tool_01HW8K6M2K4VQX3D4N0Y7AZ9HY");

    const second = await repo.listReasoningTraces({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      limit: 1,
      ...(first.nextCursor ? { cursor: first.nextCursor } : {})
    });

    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.turnId).toBe("turn_01HW8K6K8C8Q4A9R9N4V2N7Q3N");

    closeSqliteDatabase(db);
  });

  it("propagates JSON serialization failure", async () => {
    const { db, repo } = setupRepo();

    await repo.createSession({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      masterContext: "context",
      masterContextSummary: "summary",
      createdAt: "2026-03-07T10:00:00.000Z"
    });

    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await expect(
      repo.appendMessages({
        sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
        turnId: "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M",
        createdAt: "2026-03-07T10:00:01.000Z",
        messages: [{ role: "user", content: "질문", metadata: circular }]
      })
    ).rejects.toThrowError();

    closeSqliteDatabase(db);
  });
});
