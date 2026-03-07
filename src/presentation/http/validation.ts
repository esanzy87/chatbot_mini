import { trimAndValidateLength } from "@/core/validation/text";

export type ValidationField = {
  path: string;
  reason: string;
};

export function validateStringLength(params: {
  value: unknown;
  path: string;
  min: number;
  max: number;
}): { ok: true; value: string } | { ok: false; field: ValidationField } {
  if (typeof params.value !== "string") {
    return {
      ok: false,
      field: {
        path: params.path,
        reason: "type"
      }
    };
  }

  try {
    const { trimmed } = trimAndValidateLength(params.value, {
      min: params.min,
      max: params.max
    });
    return { ok: true, value: trimmed };
  } catch {
    return {
      ok: false,
      field: {
        path: params.path,
        reason: "length"
      }
    };
  }
}
