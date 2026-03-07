import { NextResponse } from "next/server";
import type { AppErrorCode } from "@/core/errors/errorCodes";
import { createErrorBody, type ErrorDetailsInput, statusFromErrorCode } from "@/core/http/errorResponse";
import { applyRequestIdHeader } from "@/core/http/requestId";

export function jsonWithRequestId(body: unknown, status: number, requestId: string): Response {
  const response = NextResponse.json(body, { status });
  applyRequestIdHeader(response.headers, requestId);
  return response;
}

export function jsonErrorWithRequestId(params: {
  code: AppErrorCode;
  message: string;
  requestId: string;
  details?: ErrorDetailsInput;
  statusOverride?: number;
}): Response {
  const body = createErrorBody({
    code: params.code,
    message: params.message,
    requestId: params.requestId,
    ...(params.details ? { details: params.details } : {})
  });

  const response = NextResponse.json(body, {
    status: params.statusOverride ?? statusFromErrorCode(params.code)
  });

  applyRequestIdHeader(response.headers, params.requestId);
  return response;
}

export async function safeParseJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false };
  }
}
