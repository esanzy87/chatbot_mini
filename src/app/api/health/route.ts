import { getContainer } from "@/composition/container";
import { resolveRequestId } from "@/core/http/requestId";
import { jsonWithRequestId } from "@/presentation/http/response";

export async function GET(): Promise<Response> {
  const requestId = resolveRequestId();
  const container = getContainer();
  return jsonWithRequestId(
    {
      ok: true,
      llmMode: container.config.llmMode,
      searchMode: container.config.searchMode
    },
    200,
    requestId
  );
}
