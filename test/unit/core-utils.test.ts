import { describe, expect, it } from "vitest";
import {
  BARE_ULID_REGEX,
  createEntityId,
  createRequestId,
  createSessionId,
  createToolCallId,
  createTurnId,
  ID_PATTERNS,
  isRequestId,
  isSessionId,
  isToolCallId,
  isTurnId
} from "@/core/id/ids";
import { nowUtcIso } from "@/core/time/time";
import { codePointLength, trimAndValidateLength } from "@/core/validation/text";
import { applyRequestIdHeader, REQUEST_ID_HEADER, resolveRequestId } from "@/core/http/requestId";
import { createErrorBody, statusFromErrorCode } from "@/core/http/errorResponse";
import { maskPii } from "@/core/logging/piiMask";
import { FALLBACK_REASON_SUMMARY, normalizeReasonSummary } from "@/core/text/reasonSummary";

describe("core/id", () => {
  it("generates uppercase prefixed IDs", () => {
    const sessionId = createSessionId();
    const turnId = createTurnId();
    const toolCallId = createToolCallId();
    const requestId = createRequestId();

    expect(ID_PATTERNS.sessionIdRegex.test(sessionId)).toBe(true);
    expect(ID_PATTERNS.turnIdRegex.test(turnId)).toBe(true);
    expect(ID_PATTERNS.toolCallIdRegex.test(toolCallId)).toBe(true);
    expect(ID_PATTERNS.requestIdRegex.test(requestId)).toBe(true);
  });

  it("rejects lower-case ids", () => {
    expect(isSessionId("sess_01hw8k4x4x5n9f3d1e7q2r6m8p")).toBe(false);
    expect(isTurnId("turn_01hw8k4x4x5n9f3d1e7q2r6m8p")).toBe(false);
    expect(isToolCallId("tool_01hw8k4x4x5n9f3d1e7q2r6m8p")).toBe(false);
    expect(isRequestId("req_01hw8k4x4x5n9f3d1e7q2r6m8p")).toBe(false);
  });

  it("generates bare ULID ids for DB rows", () => {
    const rowId = createEntityId();
    expect(BARE_ULID_REGEX.test(rowId)).toBe(true);
  });
});

describe("core/time", () => {
  it("returns ISO UTC", () => {
    expect(nowUtcIso(new Date("2026-03-07T10:00:00.000Z"))).toBe("2026-03-07T10:00:00.000Z");
  });
});

describe("core/validation/text", () => {
  it("counts unicode code points", () => {
    expect(codePointLength("가나다")).toBe(3);
    expect(codePointLength("🙂a")).toBe(2);
  });

  it("validates trimmed length", () => {
    const result = trimAndValidateLength("  안녕  ", { min: 1, max: 10 });
    expect(result.trimmed).toBe("안녕");
  });

  it("rejects whitespace-only input", () => {
    expect(() => trimAndValidateLength("   ", { min: 1, max: 10 })).toThrowError(/Length validation failed/);
  });
});

describe("core/http/requestId", () => {
  it("always generates server request ids", () => {
    const requestId = resolveRequestId();
    expect(ID_PATTERNS.requestIdRegex.test(requestId)).toBe(true);
  });

  it("applies x-request-id response header", () => {
    const headers = new Headers();
    const requestId = resolveRequestId();

    applyRequestIdHeader(headers, requestId);

    expect(headers.get(REQUEST_ID_HEADER)).toBe(requestId);
  });
});

describe("core/http/errorResponse", () => {
  it("maps code to status", () => {
    expect(statusFromErrorCode("VALIDATION_ERROR")).toBe(422);
    expect(statusFromErrorCode("TOOL_TIMEOUT")).toBe(504);
  });

  it("keeps details.fields only for validation errors", () => {
    const body = createErrorBody({
      code: "VALIDATION_ERROR",
      message: "invalid",
      requestId: resolveRequestId(),
      details: {
        fields: [{ path: "message", reason: "minLength" }],
        cursor: "ignored"
      }
    });

    expect(body.error.details).toEqual({ fields: [{ path: "message", reason: "minLength" }] });
  });

  it("truncates invalid cursor details to 120 chars", () => {
    const longCursor = "x".repeat(200);
    const body = createErrorBody({
      code: "INVALID_CURSOR",
      message: "invalid cursor",
      requestId: resolveRequestId(),
      details: { cursor: longCursor }
    });

    expect(body.error.details?.cursor?.length).toBe(120);
  });

  it("omits details for non-whitelisted error codes", () => {
    const body = createErrorBody({
      code: "SESSION_NOT_FOUND",
      message: "not found",
      requestId: resolveRequestId(),
      details: {
        fields: [{ path: "sessionId", reason: "missing" }]
      }
    });

    expect(body.error.details).toBeUndefined();
  });
});

describe("core/logging/piiMask", () => {
  it("masks email and phone and is idempotent", () => {
    const input = "문의: test@example.com, 연락처 010-1234-5678";
    const once = maskPii(input);
    const twice = maskPii(once);

    expect(once).toContain("[REDACTED_EMAIL]");
    expect(once).toContain("[REDACTED_PHONE]");
    expect(twice).toBe(once);
  });
});

describe("core/text/reasonSummary", () => {
  it("redacts forbidden patterns and normalizes newlines", () => {
    const normalized = normalizeReasonSummary("system prompt\ninternal reasoning");
    expect(normalized).toBe("[REDACTED_REASON] [REDACTED_REASON]");
  });

  it("truncates by code point to max 200", () => {
    const long = "가".repeat(210);
    const normalized = normalizeReasonSummary(long);
    expect(codePointLength(normalized)).toBe(200);
  });

  it("returns fallback for empty result", () => {
    expect(normalizeReasonSummary("   \n   ")).toBe(FALLBACK_REASON_SUMMARY);
  });
});
