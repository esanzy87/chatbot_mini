import { maskPii } from "@/core/logging/piiMask";

export type MinimalLog = {
  requestId: string;
  sessionId?: string;
  nextAction?: string;
  toolName?: string;
  ok: boolean;
  latencyMs: number;
};

function serializeLog(record: Record<string, unknown>): string {
  return maskPii(JSON.stringify(record));
}

export function logInfo(record: MinimalLog & Record<string, unknown>): void {
  console.info(serializeLog(record));
}

export function logError(record: MinimalLog & Record<string, unknown>): void {
  console.error(serializeLog(record));
}
