import { getContainer } from "@/composition/container";
import { isSessionId } from "@/core/id/ids";
import { resolveRequestId } from "@/core/http/requestId";
import { jsonErrorWithRequestId, jsonWithRequestId, safeParseJson } from "@/presentation/http/response";
import { validateStringLength } from "@/presentation/http/validation";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const requestId = resolveRequestId();
  const container = getContainer();

  const token = request.headers.get("x-internal-tool-token");
  if (!token || token !== container.config.internalToolToken) {
    return jsonErrorWithRequestId({
      code: "UNAUTHORIZED_INTERNAL_ACCESS",
      message: "내부 도구 접근 권한이 없습니다.",
      requestId
    });
  }

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
  const fields: Array<{ path: string; reason: string }> = [];

  const sessionId = typeof input.sessionId === "string" ? input.sessionId : "";
  if (!isSessionId(sessionId)) {
    fields.push({ path: "sessionId", reason: "format" });
  }

  const query = validateStringLength({
    value: input.query,
    path: "query",
    min: 2,
    max: 300
  });
  if (!query.ok) {
    fields.push(query.field);
  }
  const queryValue = query.ok ? query.value : "";

  const topKRaw = input.topK;
  const topK = topKRaw === undefined ? 5 : topKRaw;
  const topKValue =
    typeof topK === "number" && Number.isInteger(topK) && topK >= 1 && topK <= 10 ? topK : null;
  if (topKValue === null) {
    fields.push({ path: "topK", reason: "range" });
  }

  if (fields.length > 0) {
    return jsonErrorWithRequestId({
      code: "VALIDATION_ERROR",
      message: "요청 파라미터가 올바르지 않습니다.",
      requestId,
      details: { fields }
    });
  }

  const session = await container.useCases.getSession.execute({ sessionId });
  if (!session) {
    return jsonErrorWithRequestId({
      code: "SESSION_NOT_FOUND",
      message: "세션을 찾을 수 없습니다.",
      requestId
    });
  }

  try {
    const result = await container.useCases.runTool.execute({
      toolName: "search",
      allowedTools: ["search"],
      args: {
        query: queryValue,
        topK: topKValue ?? 5
      },
      timeoutMs: 8000
    });

    return jsonWithRequestId(result, 200, requestId);
  } catch (error) {
    const code = error instanceof Error ? error.message : "TOOL_EXECUTION_ERROR";
    if (code.includes("TOOL_TIMEOUT")) {
      return jsonErrorWithRequestId({
        code: "TOOL_TIMEOUT",
        message: "도구 호출 시간이 초과되었습니다.",
        requestId
      });
    }

    if (code.includes("VALIDATION_ERROR")) {
      return jsonErrorWithRequestId({
        code: "VALIDATION_ERROR",
        message: "요청 파라미터가 올바르지 않습니다.",
        requestId
      });
    }

    return jsonErrorWithRequestId({
      code: "TOOL_EXECUTION_ERROR",
      message: "도구 실행 중 오류가 발생했습니다.",
      requestId
    });
  }
}
