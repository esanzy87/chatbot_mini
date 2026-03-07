import { getContainer } from "@/composition/container";
import { resolveRequestId } from "@/core/http/requestId";
import { jsonErrorWithRequestId, jsonWithRequestId, safeParseJson } from "@/presentation/http/response";
import { validateStringLength } from "@/presentation/http/validation";

export const runtime = "nodejs";

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
  const masterContext = validateStringLength({
    value: input.masterContext,
    path: "masterContext",
    min: 20,
    max: 4000
  });

  if (!masterContext.ok) {
    return jsonErrorWithRequestId({
      code: "VALIDATION_ERROR",
      message: "요청 파라미터가 올바르지 않습니다.",
      requestId,
      details: { fields: [masterContext.field] }
    });
  }

  try {
    const container = getContainer();
    const result = await container.useCases.createSession.execute({
      masterContext: masterContext.value
    });

    return jsonWithRequestId(result, 200, requestId);
  } catch {
    return jsonErrorWithRequestId({
      code: "INTERNAL_SERVER_ERROR",
      message: "세션 생성 중 내부 오류가 발생했습니다.",
      requestId
    });
  }
}
