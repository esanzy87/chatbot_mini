import { z } from "zod";
import { ID_PATTERNS } from "@/core/id/ids";
import { codePointLength } from "@/core/validation/text";

export type SseEventName = "token" | "tool" | "message" | "error" | "done";

const turnIdSchema = z.string().regex(ID_PATTERNS.turnIdRegex);
const toolCallIdSchema = z.string().regex(ID_PATTERNS.toolCallIdRegex);
const requestIdSchema = z.string().regex(ID_PATTERNS.requestIdRegex);

const tokenSchema = z.object({
  turnId: turnIdSchema,
  delta: z.string()
}).strict();

const toolStartSchema = z
  .object({
    turnId: turnIdSchema,
    toolCallId: toolCallIdSchema,
    phase: z.literal("start"),
    toolName: z.enum(["search", "transform"]),
    args: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

const toolSuccessSchema = z
  .object({
    turnId: turnIdSchema,
    toolCallId: toolCallIdSchema,
    phase: z.literal("success"),
    toolName: z.enum(["search", "transform"]),
    latencyMs: z.number().int().min(0)
  })
  .strict();

const toolErrorSchema = z
  .object({
    turnId: turnIdSchema,
    toolCallId: toolCallIdSchema,
    phase: z.literal("error"),
    toolName: z.enum(["search", "transform"]),
    errorCode: z.string(),
    message: z.string()
  })
  .strict();

const sourceSchema = z
  .object({
    title: z.string().refine((value) => {
      const trimmed = value.trim();
      const len = codePointLength(trimmed);
      return len >= 1 && len <= 120;
    }),
    url: z.string().refine((value) => {
      const trimmed = value.trim();
      try {
        const parsed = new URL(trimmed);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    }),
    source: z.string().refine((value) => {
      const trimmed = value.trim();
      return trimmed.length >= 1 && trimmed.length <= 40 && /^[a-z0-9_-]+$/.test(trimmed);
    })
  })
  .strict();

const messageSchema = z
  .object({
    turnId: turnIdSchema,
    text: z.string(),
    nextAction: z.enum(["DIRECT_ANSWER", "CALL_TOOL", "ASK_CLARIFY", "REFUSE"]),
    sources: z.array(sourceSchema).max(5).optional(),
    debug: z
      .object({
        requestId: requestIdSchema,
        traceId: z.string().optional(),
        reasonSummary: z.string().optional()
      })
      .strict()
      .optional()
  })
  .strict();

const errorSchema = z
  .object({
    turnId: turnIdSchema,
    code: z.enum(["MODEL_PROVIDER_ERROR", "INTERNAL_SERVER_ERROR", "TOOL_EXECUTION_ERROR"]),
    message: z.string()
  })
  .strict();

const doneSchema = z
  .object({
    turnId: turnIdSchema,
    ok: z.boolean(),
    latencyMs: z.number().int().min(0),
    errorCode: z.enum(["MODEL_PROVIDER_ERROR", "INTERNAL_SERVER_ERROR", "TOOL_EXECUTION_ERROR"]).optional()
  })
  .strict();

export function validateSsePayload(eventName: SseEventName, payload: unknown, debug: boolean): void {
  if (eventName === "token") {
    tokenSchema.parse(payload);
    return;
  }

  if (eventName === "tool") {
    const phase = (payload as { phase?: string })?.phase;
    if (phase === "start") {
      const parsed = toolStartSchema.parse(payload);
      if (debug && !parsed.args) {
        throw new Error("SSE_TOOL_ARGS_REQUIRED_IN_DEBUG");
      }
      return;
    }

    if (phase === "success") {
      toolSuccessSchema.parse(payload);
      return;
    }

    toolErrorSchema.parse(payload);
    return;
  }

  if (eventName === "message") {
    const parsed = messageSchema.parse(payload);
    if (debug && !parsed.debug) {
      throw new Error("SSE_MESSAGE_DEBUG_REQUIRED");
    }
    return;
  }

  if (eventName === "error") {
    errorSchema.parse(payload);
    return;
  }

  const done = doneSchema.parse(payload);
  if (done.ok && done.errorCode !== undefined) {
    throw new Error("SSE_DONE_OK_MUST_NOT_HAVE_ERROR_CODE");
  }
  if (!done.ok && done.errorCode === undefined) {
    throw new Error("SSE_DONE_FALSE_REQUIRES_ERROR_CODE");
  }
}

export class SseEventTracker {
  private messageCount = 0;
  private errorCount = 0;
  private doneEmitted = false;
  private toolState = new Map<string, "started" | "ended">();

  register(eventName: SseEventName, payload: unknown): void {
    if (this.doneEmitted) {
      throw new Error("SSE_EVENT_AFTER_DONE");
    }

    if (eventName === "message") {
      this.messageCount += 1;
      if (this.messageCount > 1) {
        throw new Error("SSE_MESSAGE_CARDINALITY");
      }
    }

    if (eventName === "error") {
      this.errorCount += 1;
      if (this.errorCount > 1) {
        throw new Error("SSE_ERROR_CARDINALITY");
      }
    }

    if (eventName === "tool") {
      const tool = payload as { toolCallId: string; phase: "start" | "success" | "error" };
      const prev = this.toolState.get(tool.toolCallId);
      if (tool.phase === "start") {
        if (prev) {
          throw new Error("SSE_TOOL_START_DUPLICATED");
        }
        this.toolState.set(tool.toolCallId, "started");
      } else {
        if (!prev || prev !== "started") {
          throw new Error("SSE_TOOL_END_WITHOUT_START");
        }
        this.toolState.set(tool.toolCallId, "ended");
      }
    }

    if (eventName === "done") {
      this.doneEmitted = true;
      const done = payload as { ok: boolean };
      if (done.ok && this.messageCount !== 1) {
        throw new Error("SSE_DONE_OK_REQUIRES_MESSAGE");
      }
      if (!done.ok && this.errorCount !== 1) {
        throw new Error("SSE_DONE_FAIL_REQUIRES_ERROR");
      }

      for (const [toolCallId, state] of this.toolState.entries()) {
        if (state !== "ended") {
          throw new Error(`SSE_TOOL_NOT_CLOSED:${toolCallId}`);
        }
      }
    }
  }
}

export function encodeSseEvent(name: SseEventName, payload: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function createSseResponse(stream: ReadableStream<Uint8Array>, requestId: string): Response {
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-request-id": requestId
    }
  });
}
