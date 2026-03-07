import { ulid } from "ulid";

const ULID_PATTERN = "[0-9A-HJKMNP-TV-Z]{26}";
export const BARE_ULID_REGEX = new RegExp(`^${ULID_PATTERN}$`);

const sessionIdRegex = new RegExp(`^sess_${ULID_PATTERN}$`);
const turnIdRegex = new RegExp(`^turn_${ULID_PATTERN}$`);
const toolCallIdRegex = new RegExp(`^tool_${ULID_PATTERN}$`);
const requestIdRegex = new RegExp(`^req_${ULID_PATTERN}$`);

function createId(prefix: "sess" | "turn" | "tool" | "req"): string {
  return `${prefix}_${ulid().toUpperCase()}`;
}

export function createEntityId(): string {
  return ulid().toUpperCase();
}

export function createSessionId(): string {
  return createId("sess");
}

export function createTurnId(): string {
  return createId("turn");
}

export function createToolCallId(): string {
  return createId("tool");
}

export function createRequestId(): string {
  return createId("req");
}

export function isSessionId(value: string): boolean {
  return sessionIdRegex.test(value);
}

export function isTurnId(value: string): boolean {
  return turnIdRegex.test(value);
}

export function isToolCallId(value: string): boolean {
  return toolCallIdRegex.test(value);
}

export function isRequestId(value: string): boolean {
  return requestIdRegex.test(value);
}

export const ID_PATTERNS = {
  sessionIdRegex,
  turnIdRegex,
  toolCallIdRegex,
  requestIdRegex
};
