import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeSqliteDatabase, openSqliteDatabase } from "@/infrastructure/sqlite/database";
import { applySchema } from "@/infrastructure/sqlite/schema";
import { SqliteRepository } from "@/infrastructure/sqlite/repository";
import { withImmediateTransaction } from "@/infrastructure/sqlite/transaction";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function setupDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-mini-"));
  tempDirs.push(dir);
  const dbPath = path.join(dir, "test.sqlite");
  const db = openSqliteDatabase(dbPath);
  applySchema(db);
  return { db, dbPath };
}

describe("sqlite schema", () => {
  it("enables FK and enforces constraints", () => {
    const { db } = setupDb();

    expect(() =>
      db
        .prepare(
          `INSERT INTO messages (id, session_id, turn_id, role, content, metadata, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run("01HW8K4X4X5N9F3D1E7Q2R6M8P", "sess_missing", "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M", "user", "hi", "{}", "2026-03-07T10:00:00.000Z")
    ).toThrowError();

    closeSqliteDatabase(db);
  });

  it("creates required indexes", () => {
    const { db } = setupDb();

    const indexes = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' ORDER BY name`)
      .all() as Array<{ name: string }>;

    const names = indexes.map((i) => i.name);
    expect(names).toContain("idx_messages_session_created_at");
    expect(names).toContain("idx_tool_exec_session_turn");
    expect(names).toContain("idx_tool_exec_tool_call_id");
    expect(names).toContain("idx_trace_session_created_turn");

    closeSqliteDatabase(db);
  });

  it("creates session+master_context in one transaction", async () => {
    const { db } = setupDb();
    const repo = new SqliteRepository(db);

    await repo.createSession({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      masterContext: "과제 맥락",
      masterContextSummary: "요약",
      createdAt: "2026-03-07T10:00:00.000Z"
    });

    const sessionCount = (db.prepare(`SELECT COUNT(*) AS c FROM sessions`).get() as { c: number }).c;
    const contextCount = (db.prepare(`SELECT COUNT(*) AS c FROM master_contexts`).get() as { c: number }).c;
    expect(sessionCount).toBe(1);
    expect(contextCount).toBe(1);

    closeSqliteDatabase(db);
  });

  it("rolls back finalizeTurn atomically on failure", async () => {
    const { db } = setupDb();
    const repo = new SqliteRepository(db);

    await repo.createSession({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      masterContext: "과제 맥락",
      masterContextSummary: "요약",
      createdAt: "2026-03-07T10:00:00.000Z"
    });

    expect(() =>
      repo.finalizeTurn({
        sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
        turnId: "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M",
        userMessage: {
          id: "01HW8K6K8C8Q4A9R9N4V2N7Q3M",
          content: "user",
          createdAt: "2026-03-07T10:00:01.000Z"
        },
        toolExecutions: [
          {
            id: "01HW8K6M2K4VQX3D4N0Y7AZ9HS",
            sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
            turnId: "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M",
            toolCallId: "tool_01HW8K6M2K4VQX3D4N0Y7AZ9HS",
            toolName: "search",
            args: { query: "a" },
            result: { ok: true },
            ok: true,
            latencyMs: 10,
            createdAt: "2026-03-07T10:00:01.000Z"
          },
          {
            id: "01HW8K6M2K4VQX3D4N0Y7AZ9HT",
            sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
            turnId: "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M",
            toolCallId: "tool_01HW8K6M2K4VQX3D4N0Y7AZ9HS",
            toolName: "search",
            args: { query: "b" },
            result: { ok: true },
            ok: true,
            latencyMs: 20,
            createdAt: "2026-03-07T10:00:01.000Z"
          }
        ],
        decisionTrace: {
          id: "01HW8KAA7S9P3Y2D4Q6N1M8R5T",
          sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
          turnId: "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M",
          nextAction: "CALL_TOOL",
          reasonSummary: "요약",
          allowedTools: ["search"],
          createdAt: "2026-03-07T10:00:01.000Z"
        }
      })
    ).toThrowError();

    const messageCount = (db.prepare(`SELECT COUNT(*) AS c FROM messages`).get() as { c: number }).c;
    const toolCount = (db.prepare(`SELECT COUNT(*) AS c FROM tool_executions`).get() as { c: number }).c;
    const traceCount = (db.prepare(`SELECT COUNT(*) AS c FROM decision_traces`).get() as { c: number }).c;

    expect(messageCount).toBe(0);
    expect(toolCount).toBe(0);
    expect(traceCount).toBe(0);

    closeSqliteDatabase(db);
  });

  it("stores user+tool only for done.ok=false style finalize turn", async () => {
    const { db } = setupDb();
    const repo = new SqliteRepository(db);

    await repo.createSession({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      masterContext: "과제 맥락",
      masterContextSummary: "요약",
      createdAt: "2026-03-07T10:00:00.000Z"
    });

    repo.finalizeTurn({
      sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
      turnId: "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3Z",
      userMessage: {
        id: "01HW8K6K8C8Q4A9R9N4V2N7Q3Z0",
        content: "user",
        createdAt: "2026-03-07T10:00:01.000Z"
      },
      toolExecutions: [
        {
          id: "01HW8K6M2K4VQX3D4N0Y7AZ9HZ",
          sessionId: "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
          turnId: "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3Z",
          toolCallId: "tool_01HW8K6M2K4VQX3D4N0Y7AZ9HZ",
          toolName: "search",
          args: { query: "a" },
          result: { errorCode: "TOOL_EXECUTION_ERROR", message: "fail" },
          ok: false,
          latencyMs: 10,
          createdAt: "2026-03-07T10:00:01.000Z"
        }
      ]
    });

    const userCount = (
      db.prepare(`SELECT COUNT(*) AS c FROM messages WHERE turn_id = ? AND role = 'user'`).get(
        "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3Z"
      ) as { c: number }
    ).c;
    const aiCount = (
      db.prepare(`SELECT COUNT(*) AS c FROM messages WHERE turn_id = ? AND role = 'ai'`).get(
        "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3Z"
      ) as { c: number }
    ).c;
    const toolCount = (
      db.prepare(`SELECT COUNT(*) AS c FROM tool_executions WHERE turn_id = ?`).get(
        "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3Z"
      ) as { c: number }
    ).c;
    const traceCount = (
      db.prepare(`SELECT COUNT(*) AS c FROM decision_traces WHERE turn_id = ?`).get(
        "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3Z"
      ) as { c: number }
    ).c;

    expect(userCount).toBe(1);
    expect(aiCount).toBe(0);
    expect(toolCount).toBe(1);
    expect(traceCount).toBe(0);

    closeSqliteDatabase(db);
  });

  it("withImmediateTransaction uses BEGIN IMMEDIATE and rolls back on error", () => {
    const statements: string[] = [];
    const fakeDb = {
      exec(sql: string) {
        statements.push(sql);
      }
    };

    expect(() =>
      withImmediateTransaction(fakeDb as never, () => {
        throw new Error("boom");
      })
    ).toThrowError();

    expect(statements).toEqual(["BEGIN IMMEDIATE", "ROLLBACK"]);
  });
});
