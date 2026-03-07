import { getContainer } from "@/composition/container";
import { isSessionId } from "@/core/id/ids";
import { resolveRequestId } from "@/core/http/requestId";
import { jsonErrorWithRequestId, jsonWithRequestId } from "@/presentation/http/response";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
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

  const container = getContainer();
  const session = await container.useCases.getSession.execute({ sessionId });

  if (!session) {
    return jsonErrorWithRequestId({
      code: "SESSION_NOT_FOUND",
      message: "세션을 찾을 수 없습니다.",
      requestId
    });
  }

  return jsonWithRequestId(
    {
      sessionId: session.sessionId,
      masterContext: session.masterContext,
      masterContextSummary: session.masterContextSummary,
      createdAt: session.createdAt
    },
    200,
    requestId
  );
}
