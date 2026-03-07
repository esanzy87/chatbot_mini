import {
  BARE_ULID_REGEX,
  createEntityId,
  ID_PATTERNS
} from "@/core/id/ids";
import { toDbIsoUtc } from "@/infrastructure/sqlite/time";
import { withImmediateTransaction } from "@/infrastructure/sqlite/transaction";
import type {
  ChatTurnRepository,
  FinalizeTurnInput,
  MessageRepository,
  SessionRecord,
  SessionRepository,
  ToolExecutionRepository,
  TraceRepository
} from "@/application/ports/repository";
import type { ReasoningTrace } from "@/domain/models";
import type { SqliteDatabase } from "@/infrastructure/sqlite/database";

type CursorPayload = {
  v: 1;
  createdAt: string;
  turnId: string;
};

function serializeJson(value: unknown): string {
  return JSON.stringify(value);
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url").replace(/=/g, "");
}

function decodeCursor(cursor: string): CursorPayload {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor) || cursor.includes("=")) {
    throw new Error("INVALID_CURSOR");
  }

  let parsedJson: unknown;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf-8");
    parsedJson = JSON.parse(decoded);
  } catch {
    throw new Error("INVALID_CURSOR");
  }

  if (!parsedJson || typeof parsedJson !== "object") {
    throw new Error("INVALID_CURSOR");
  }

  const payload = parsedJson as Partial<CursorPayload> & { v?: number };

  if (payload.v !== 1 || typeof payload.createdAt !== "string" || typeof payload.turnId !== "string") {
    throw new Error("INVALID_CURSOR");
  }

  if (!ID_PATTERNS.turnIdRegex.test(payload.turnId)) {
    throw new Error("INVALID_CURSOR");
  }

  const date = new Date(payload.createdAt);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== payload.createdAt) {
    throw new Error("INVALID_CURSOR");
  }

  return {
    v: 1,
    createdAt: payload.createdAt,
    turnId: payload.turnId
  };
}

export class SqliteRepository
  implements SessionRepository, MessageRepository, TraceRepository, ToolExecutionRepository, ChatTurnRepository
{
  constructor(private readonly db: SqliteDatabase) {}

  async createSession(params: {
    sessionId: string;
    masterContext: string;
    masterContextSummary: string;
    createdAt: string;
  }): Promise<void> {
    withImmediateTransaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO sessions (id, consecutive_tool_failure_turns, created_at, updated_at)
           VALUES (?, 0, ?, ?)`
        )
        .run(params.sessionId, toDbIsoUtc(params.createdAt), toDbIsoUtc(params.createdAt));

      this.db
        .prepare(
          `INSERT INTO master_contexts (session_id, content, summary)
           VALUES (?, ?, ?)`
        )
        .run(params.sessionId, params.masterContext, params.masterContextSummary);
    });
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    const row = this.db
      .prepare(
        `SELECT s.id, s.created_at, s.consecutive_tool_failure_turns, m.content, m.summary
         FROM sessions s
         JOIN master_contexts m ON m.session_id = s.id
         WHERE s.id = ?`
      )
      .get(sessionId) as
      | {
          id: string;
          created_at: string;
          consecutive_tool_failure_turns: number;
          content: string;
          summary: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      sessionId: row.id,
      masterContext: row.content,
      masterContextSummary: row.summary,
      createdAt: row.created_at,
      consecutiveToolFailureTurns: row.consecutive_tool_failure_turns
    };
  }

  async updateConsecutiveToolFailureTurns(params: {
    sessionId: string;
    consecutiveToolFailureTurns: number;
    updatedAt: string;
  }): Promise<void> {
    this.db
      .prepare(
        `UPDATE sessions
         SET consecutive_tool_failure_turns = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(params.consecutiveToolFailureTurns, toDbIsoUtc(params.updatedAt), params.sessionId);
  }

  async listMessages(sessionId: string): Promise<Array<{ role: string; content: string }>> {
    const rows = this.db
      .prepare(`SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC`)
      .all(sessionId) as Array<{ role: string; content: string }>;

    return rows;
  }

  async appendMessages(params: {
    sessionId: string;
    turnId: string;
    messages: Array<{ role: "user" | "ai"; content: string; metadata?: Record<string, unknown> }>;
    createdAt: string;
  }): Promise<void> {
    for (const message of params.messages) {
      const metadata = message.metadata ?? {};
      this.db
        .prepare(
          `INSERT INTO messages (id, session_id, turn_id, role, content, metadata, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          createEntityId(),
          params.sessionId,
          params.turnId,
          message.role,
          message.content,
          serializeJson(metadata),
          toDbIsoUtc(params.createdAt)
        );
    }
  }

  async appendToolExecutions(params: {
    sessionId: string;
    turnId: string;
    items: Array<{
      id: string;
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      result: Record<string, unknown>;
      ok: boolean;
      latencyMs: number;
      createdAt: string;
    }>;
  }): Promise<void> {
    for (const item of params.items) {
      if (!BARE_ULID_REGEX.test(item.id)) {
        throw new Error("INVALID_TOOL_EXECUTION_ID");
      }

      this.db
        .prepare(
          `INSERT INTO tool_executions (id, session_id, turn_id, tool_call_id, tool_name, args, result, ok, latency_ms, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          item.id,
          params.sessionId,
          params.turnId,
          item.toolCallId,
          item.toolName,
          serializeJson(item.args),
          serializeJson(item.result),
          item.ok ? 1 : 0,
          Math.max(0, Math.floor(item.latencyMs)),
          toDbIsoUtc(item.createdAt)
        );
    }
  }

  async appendDecisionTrace(params: {
    sessionId: string;
    turnId: string;
    nextAction: string;
    reasonSummary: string;
    allowedTools: string[];
    createdAt: string;
  }): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO decision_traces (id, session_id, turn_id, next_action, reason_summary, allowed_tools, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        createEntityId(),
        params.sessionId,
        params.turnId,
        params.nextAction,
        params.reasonSummary,
        serializeJson(params.allowedTools),
        toDbIsoUtc(params.createdAt)
      );
  }

  async listReasoningTraces(params: {
    sessionId: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: ReasoningTrace[]; nextCursor: string | null }> {
    const limitPlusOne = params.limit + 1;

    let cursorPayload: CursorPayload | null = null;
    if (params.cursor) {
      cursorPayload = decodeCursor(params.cursor);
    }

    const rows = this.db
      .prepare(
        `SELECT turn_id, next_action, reason_summary, allowed_tools, created_at
         FROM decision_traces
         WHERE session_id = ?
           AND (
             ? IS NULL
             OR created_at < ?
             OR (created_at = ? AND turn_id < ?)
           )
         ORDER BY created_at DESC, turn_id DESC
         LIMIT ?`
      )
      .all(
        params.sessionId,
        cursorPayload?.createdAt ?? null,
        cursorPayload?.createdAt ?? null,
        cursorPayload?.createdAt ?? null,
        cursorPayload?.turnId ?? null,
        limitPlusOne
      ) as Array<{
      turn_id: string;
      next_action: "DIRECT_ANSWER" | "CALL_TOOL" | "ASK_CLARIFY" | "REFUSE";
      reason_summary: string;
      allowed_tools: string;
      created_at: string;
    }>;

    const hasNext = rows.length > params.limit;
    const pageRows = hasNext ? rows.slice(0, params.limit) : rows;

    const items: ReasoningTrace[] = pageRows.map((row) => {
      const toolExecutions = this.db
        .prepare(
          `SELECT tool_call_id, tool_name, ok, latency_ms
           FROM tool_executions
           WHERE session_id = ? AND turn_id = ?
           ORDER BY created_at ASC, tool_call_id ASC`
        )
        .all(params.sessionId, row.turn_id) as Array<{
        tool_call_id: string;
        tool_name: string;
        ok: number;
        latency_ms: number;
      }>;

      return {
        turnId: row.turn_id,
        nextAction: row.next_action,
        reasonSummary: row.reason_summary,
        allowedTools: JSON.parse(row.allowed_tools) as string[],
        toolExecutions: toolExecutions.map((tool) => ({
          toolCallId: tool.tool_call_id,
          toolName: tool.tool_name,
          ok: tool.ok === 1,
          latencyMs: tool.latency_ms
        })),
        createdAt: row.created_at
      };
    });

    const last = items.at(-1);
    const nextCursor = hasNext && last ? encodeCursor({ v: 1, createdAt: last.createdAt, turnId: last.turnId }) : null;

    return {
      items,
      nextCursor
    };
  }

  finalizeTurn(input: FinalizeTurnInput): void {
    withImmediateTransaction(this.db, () => {
      if (input.userMessage) {
        this.db
          .prepare(
            `INSERT INTO messages (id, session_id, turn_id, role, content, metadata, created_at)
             VALUES (?, ?, ?, 'user', ?, '{}', ?)`
          )
          .run(
            input.userMessage.id,
            input.sessionId,
            input.turnId,
            input.userMessage.content,
            toDbIsoUtc(input.userMessage.createdAt)
          );
      }

      if (input.aiMessage) {
        this.db
          .prepare(
            `INSERT INTO messages (id, session_id, turn_id, role, content, metadata, created_at)
             VALUES (?, ?, ?, 'ai', ?, '{}', ?)`
          )
          .run(
            input.aiMessage.id,
            input.sessionId,
            input.turnId,
            input.aiMessage.content,
            toDbIsoUtc(input.aiMessage.createdAt)
          );
      }

      for (const tool of input.toolExecutions) {
        this.db
          .prepare(
            `INSERT INTO tool_executions (id, session_id, turn_id, tool_call_id, tool_name, args, result, ok, latency_ms, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            tool.id,
            tool.sessionId,
            tool.turnId,
            tool.toolCallId,
            tool.toolName,
            serializeJson(tool.args),
            serializeJson(tool.result),
            tool.ok ? 1 : 0,
            Math.max(0, Math.floor(tool.latencyMs)),
            toDbIsoUtc(tool.createdAt)
          );
      }

      if (input.decisionTrace) {
        this.db
          .prepare(
            `INSERT INTO decision_traces (id, session_id, turn_id, next_action, reason_summary, allowed_tools, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            input.decisionTrace.id,
            input.decisionTrace.sessionId,
            input.decisionTrace.turnId,
            input.decisionTrace.nextAction,
            input.decisionTrace.reasonSummary,
            serializeJson(input.decisionTrace.allowedTools),
            toDbIsoUtc(input.decisionTrace.createdAt)
          );
      }

      if (input.nextConsecutiveToolFailureTurns !== undefined || input.sessionUpdatedAt !== undefined) {
        const updatedAt = input.sessionUpdatedAt ?? new Date().toISOString();
        this.db
          .prepare(
            `UPDATE sessions
             SET consecutive_tool_failure_turns = COALESCE(?, consecutive_tool_failure_turns),
                 updated_at = ?
             WHERE id = ?`
          )
          .run(input.nextConsecutiveToolFailureTurns ?? null, toDbIsoUtc(updatedAt), input.sessionId);
      }
    });
  }
}
