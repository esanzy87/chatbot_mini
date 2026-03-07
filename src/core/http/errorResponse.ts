import type { AppErrorCode } from "@/core/errors/errorCodes";
import { HTTP_STATUS_BY_CODE } from "@/core/errors/errorCodes";

export type ValidationFieldDetail = {
  path: string;
  reason: string;
};

export type ErrorDetailsInput = {
  fields?: ValidationFieldDetail[];
  cursor?: string;
};

export type ErrorBody = {
  error: {
    code: AppErrorCode;
    message: string;
    requestId: string;
    details?: {
      fields?: ValidationFieldDetail[];
      cursor?: string;
    };
  };
};

function normalizeErrorDetails(code: AppErrorCode, details?: ErrorDetailsInput): ErrorBody["error"]["details"] | undefined {
  if (!details) {
    return undefined;
  }

  if (code === "VALIDATION_ERROR") {
    if (!details.fields || details.fields.length === 0) {
      return undefined;
    }
    return { fields: details.fields };
  }

  if (code === "INVALID_CURSOR") {
    if (!details.cursor) {
      return undefined;
    }
    const cursor = [...details.cursor].slice(0, 120).join("");
    return { cursor };
  }

  return undefined;
}

export function statusFromErrorCode(code: AppErrorCode): number {
  return HTTP_STATUS_BY_CODE[code];
}

export function createErrorBody(params: {
  code: AppErrorCode;
  message: string;
  requestId: string;
  details?: ErrorDetailsInput;
}): ErrorBody {
  const normalizedDetails = normalizeErrorDetails(params.code, params.details);

  return {
    error: {
      code: params.code,
      message: params.message,
      requestId: params.requestId,
      ...(normalizedDetails ? { details: normalizedDetails } : {})
    }
  };
}
