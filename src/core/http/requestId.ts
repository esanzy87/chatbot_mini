import { createRequestId } from "@/core/id/ids";

export const REQUEST_ID_HEADER = "x-request-id";

export function resolveRequestId(): string {
  // Spec: Ignore client-provided request id and always use server-generated id.
  return createRequestId();
}

export function applyRequestIdHeader(headers: Headers, requestId: string): void {
  headers.set(REQUEST_ID_HEADER, requestId);
}
