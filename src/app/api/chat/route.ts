import { getContainer } from "@/composition/container";
import { runChatGraph } from "@/application/graph/chatGraph";
import { createTurnId, isSessionId } from "@/core/id/ids";
import { resolveRequestId } from "@/core/http/requestId";
import { trimAndValidateLength } from "@/core/validation/text";
import { logError, logInfo } from "@/core/logging/logger";
import { jsonErrorWithRequestId, safeParseJson } from "@/presentation/http/response";
import {
  createSseResponse,
  encodeSseEvent,
  SseEventTracker,
  validateSsePayload
} from "@/presentation/chat/sse";
import { releaseSession, tryAcquireSession } from "@/presentation/chat/sessionInFlight";

export const runtime = "nodejs";

type StreamFatalErrorCode = "MODEL_PROVIDER_ERROR" | "INTERNAL_SERVER_ERROR" | "TOOL_EXECUTION_ERROR";

function mapStreamFatalErrorCode(error: unknown): StreamFatalErrorCode {
  if (error instanceof Error) {
    if (error.message.includes("MODEL_PROVIDER_ERROR")) {
      return "MODEL_PROVIDER_ERROR";
    }
    if (error.message.includes("TOOL_EXECUTION_ERROR")) {
      return "TOOL_EXECUTION_ERROR";
    }
  }

  return "INTERNAL_SERVER_ERROR";
}

export async function POST(request: Request): Promise<Response> {
  const requestId = resolveRequestId();
  const parsed = await safeParseJson(request);

  if (!parsed.ok) {
    return jsonErrorWithRequestId({
      code: "JSON_PARSE_ERROR",
      message: "요청 본문 JSON 파싱에 실패했습니다.",
      requestId
    });
  }

  if (!parsed.value || typeof parsed.value !== "object") {
    return jsonErrorWithRequestId({
      code: "VALIDATION_ERROR",
      message: "요청 파라미터가 올바르지 않습니다.",
      requestId,
      details: { fields: [{ path: "body", reason: "type" }] }
    });
  }

  const input = parsed.value as Record<string, unknown>;
  const sessionIdRaw = input.sessionId;
  const messageRaw = input.message;
  const clientOptionsRaw = input.clientOptions;

  if (
    clientOptionsRaw !== undefined &&
    (typeof clientOptionsRaw !== "object" || clientOptionsRaw === null || Array.isArray(clientOptionsRaw))
  ) {
    return jsonErrorWithRequestId({
      code: "VALIDATION_ERROR",
      message: "요청 파라미터가 올바르지 않습니다.",
      requestId,
      details: { fields: [{ path: "clientOptions", reason: "type" }] }
    });
  }

  const clientOptions = (clientOptionsRaw ?? {}) as {
    needsSources?: unknown;
    debug?: unknown;
  };

  if (typeof sessionIdRaw !== "string" || sessionIdRaw.trim() === "" || !isSessionId(sessionIdRaw)) {
    return jsonErrorWithRequestId({
      code: "VALIDATION_ERROR",
      message: "요청 파라미터가 올바르지 않습니다.",
      requestId,
      details: { fields: [{ path: "sessionId", reason: "format" }] }
    });
  }

  if (typeof messageRaw !== "string") {
    return jsonErrorWithRequestId({
      code: "VALIDATION_ERROR",
      message: "요청 파라미터가 올바르지 않습니다.",
      requestId,
      details: { fields: [{ path: "message", reason: "type" }] }
    });
  }

  let message: string;
  try {
    message = trimAndValidateLength(messageRaw, { min: 1, max: 2000 }).trimmed;
  } catch {
    return jsonErrorWithRequestId({
      code: "VALIDATION_ERROR",
      message: "요청 파라미터가 올바르지 않습니다.",
      requestId,
      details: { fields: [{ path: "message", reason: "length" }] }
    });
  }

  if (clientOptions.needsSources !== undefined && typeof clientOptions.needsSources !== "boolean") {
    return jsonErrorWithRequestId({
      code: "VALIDATION_ERROR",
      message: "요청 파라미터가 올바르지 않습니다.",
      requestId,
      details: { fields: [{ path: "clientOptions.needsSources", reason: "type" }] }
    });
  }

  if (clientOptions.debug !== undefined && typeof clientOptions.debug !== "boolean") {
    return jsonErrorWithRequestId({
      code: "VALIDATION_ERROR",
      message: "요청 파라미터가 올바르지 않습니다.",
      requestId,
      details: { fields: [{ path: "clientOptions.debug", reason: "type" }] }
    });
  }

  const needsSources = (clientOptions.needsSources as boolean | undefined) ?? false;
  const debug = (clientOptions.debug as boolean | undefined) ?? false;

  const container = getContainer();
  const session = await container.useCases.getSession.execute({ sessionId: sessionIdRaw });
  if (!session) {
    return jsonErrorWithRequestId({
      code: "SESSION_NOT_FOUND",
      message: "세션을 찾을 수 없습니다.",
      requestId
    });
  }

  if (!tryAcquireSession(sessionIdRaw)) {
    return jsonErrorWithRequestId({
      code: "SESSION_BUSY",
      message: "동일 세션에 처리 중인 요청이 있습니다.",
      requestId
    });
  }

  const turnId = createTurnId();

  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      const encoder = new TextEncoder();
      let closed = false;
      const t0 = Date.now();
      const tracker = new SseEventTracker();

      const write = (eventName: "token" | "tool" | "message" | "error" | "done", payload: unknown) => {
        if (closed) {
          return;
        }
        validateSsePayload(eventName, payload, debug);
        tracker.register(eventName, payload);
        controller.enqueue(encoder.encode(encodeSseEvent(eventName, payload)));
      };

      const close = () => {
        if (!closed) {
          closed = true;
          controller.close();
          releaseSession(sessionIdRaw);
        }
      };

      const abortHandler = () => {
        closed = true;
        releaseSession(sessionIdRaw);
        try {
          controller.close();
        } catch {
          // no-op
        }
      };

      request.signal.addEventListener("abort", abortHandler, { once: true });

      (async () => {
        try {
          const result = await runChatGraph(
            {
              llmPort: container.llmPort,
              searchPort: container.searchPort,
              repository: container.chatTurnRepository,
              abortSignal: request.signal,
              isAborted: () => request.signal.aborted,
              now: () => Date.now(),
              emitToolEvent: (payload) => {
                write("tool", payload);
                if (payload.phase === "success") {
                  logInfo({
                    requestId,
                    sessionId: sessionIdRaw,
                    toolName: payload.toolName,
                    ok: true,
                    latencyMs: payload.latencyMs ?? 0
                  });
                } else if (payload.phase === "error") {
                  logError({
                    requestId,
                    sessionId: sessionIdRaw,
                    toolName: payload.toolName,
                    ok: false,
                    latencyMs: 0
                  });
                }
              }
            },
            {
              sessionId: sessionIdRaw,
              requestId,
              turnId,
              userMessage: message,
              needsSources,
              debug
            }
          );

          if (request.signal.aborted || closed) {
            close();
            return;
          }

          if (!result.doneOk) {
            write("error", {
              turnId,
              code: result.errorCode ?? "INTERNAL_SERVER_ERROR",
              message: "요청 처리 중 오류가 발생했습니다."
            });
            logError({
              requestId,
              sessionId: sessionIdRaw,
              nextAction: result.finalNextAction,
              ok: false,
              latencyMs: Math.max(0, Math.floor(Date.now() - t0))
            });
            write("done", {
              turnId,
              ok: false,
              errorCode: result.errorCode ?? "INTERNAL_SERVER_ERROR",
              latencyMs: Math.max(0, Math.floor(Date.now() - t0))
            });
            close();
            return;
          }

          if (result.finalText.length > 0) {
            write("token", {
              turnId,
              delta: result.finalText
            });
          }

          write("message", {
            turnId,
            text: result.finalText,
            nextAction: result.finalNextAction,
            ...(result.sources.length > 0 ? { sources: result.sources } : {}),
            ...(debug
              ? {
                  debug: {
                    requestId,
                    reasonSummary: result.reasonSummary
                  }
                }
              : {})
          });

          write("done", {
            turnId,
            ok: true,
            latencyMs: Math.max(0, Math.floor(Date.now() - t0))
          });
          logInfo({
            requestId,
            sessionId: sessionIdRaw,
            nextAction: result.finalNextAction,
            ok: true,
            latencyMs: Math.max(0, Math.floor(Date.now() - t0))
          });

          close();
        } catch (error) {
          if (request.signal.aborted || closed) {
            close();
            return;
          }

          const code = mapStreamFatalErrorCode(error);
          write("error", {
            turnId,
            code,
            message: "요청 처리 중 오류가 발생했습니다."
          });

          write("done", {
            turnId,
            ok: false,
            errorCode: code,
            latencyMs: Math.max(0, Math.floor(Date.now() - t0))
          });
          logError({
            requestId,
            sessionId: sessionIdRaw,
            ok: false,
            latencyMs: Math.max(0, Math.floor(Date.now() - t0))
          });

          close();
        } finally {
          request.signal.removeEventListener("abort", abortHandler);
        }
      })();
    },
    cancel: () => {
      releaseSession(sessionIdRaw);
    }
  });

  return createSseResponse(stream, requestId);
}
