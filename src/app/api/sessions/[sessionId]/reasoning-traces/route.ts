import { getContainer } from "@/composition/container";
import { isSessionId } from "@/core/id/ids";
import { resolveRequestId } from "@/core/http/requestId";
import { jsonErrorWithRequestId, jsonWithRequestId } from "@/presentation/http/response";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const requestId = resolveRequestId();
  const { sessionId } = await context.params;

  if (!isSessionId(sessionId)) {
    return jsonErrorWithRequestId({
      code: "VALIDATION_ERROR",
      message: "요청 파라미터가 올바르지 않습니다.",
      requestId,
      details: { fields: [{ path: "sessionId", reason: "format" }] }
    });
  }

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  const cursorParam = url.searchParams.get("cursor");
  if (cursorParam !== null && cursorParam.length === 0) {
    return jsonErrorWithRequestId({
      code: "INVALID_CURSOR",
      message: "cursor 형식이 올바르지 않습니다.",
      requestId,
      details: { cursor: cursorParam }
    });
  }
  const cursorRaw = cursorParam ?? undefined;

  const limit = limitRaw === null ? 20 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return jsonErrorWithRequestId({
      code: "VALIDATION_ERROR",
      message: "요청 파라미터가 올바르지 않습니다.",
      requestId,
      details: { fields: [{ path: "limit", reason: "range" }] }
    });
  }

  try {
    const container = getContainer();
    const session = await container.useCases.getSession.execute({ sessionId });
    if (!session) {
      return jsonErrorWithRequestId({
        code: "SESSION_NOT_FOUND",
        message: "세션을 찾을 수 없습니다.",
        requestId
      });
    }

    const result = await container.useCases.getReasoningTrace.execute({
      sessionId,
      limit,
      ...(cursorRaw !== undefined ? { cursor: cursorRaw } : {})
    });

    return jsonWithRequestId(result, 200, requestId);
  } catch (error) {
    if (error instanceof Error && error.message.includes("INVALID_CURSOR")) {
      return jsonErrorWithRequestId({
        code: "INVALID_CURSOR",
        message: "cursor 형식이 올바르지 않습니다.",
        requestId,
        ...(cursorRaw !== undefined ? { details: { cursor: cursorRaw } } : {})
      });
    }

    return jsonErrorWithRequestId({
      code: "INTERNAL_SERVER_ERROR",
      message: "trace 조회 중 오류가 발생했습니다.",
      requestId
    });
  }
}
