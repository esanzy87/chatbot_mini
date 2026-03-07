import type { ForceSourceMode, NextAction } from "@/domain/models";

export type ToolFailureKind =
  | "TIMEOUT"
  | "PROVIDER_5XX"
  | "NETWORK"
  | "SCHEMA_INVALID"
  | "NODE_EXCEPTION"
  | "STATE_CORRUPTION";

export type ToolFailureSignal = {
  toolCallId?: string;
  kind: ToolFailureKind;
  graphCanContinue: boolean;
};

export type ToolFailureClass = "recoverable" | "unrecoverable";

export function classifyToolFailure(signal: ToolFailureSignal): ToolFailureClass {
  const attributable = typeof signal.toolCallId === "string" && signal.toolCallId.length > 0;
  const recoverableKinds: ToolFailureKind[] = ["TIMEOUT", "PROVIDER_5XX", "NETWORK", "SCHEMA_INVALID"];

  if (attributable && recoverableKinds.includes(signal.kind) && signal.graphCanContinue) {
    return "recoverable";
  }

  return "unrecoverable";
}

export type CounterOutcome =
  | "TOOL_FAILURE_ASK_CLARIFY"
  | "TOOL_SUCCESS"
  | "NON_CALL_TOOL_NORMAL"
  | "SECOND_FALLBACK_DIRECT_ANSWER"
  | "UNRECOVERABLE_ERROR"
  | "ABORTED";

export function nextConsecutiveToolFailureTurns(previous: number, outcome: CounterOutcome): number {
  if (outcome === "TOOL_FAILURE_ASK_CLARIFY") {
    return Math.min(previous + 1, 2);
  }

  if (outcome === "SECOND_FALLBACK_DIRECT_ANSWER") {
    return 0;
  }

  if (outcome === "UNRECOVERABLE_ERROR" || outcome === "ABORTED") {
    return previous;
  }

  return 0;
}

export function resolveToolFailureFallback(params: {
  needsSources: boolean;
  forceSourceMode: ForceSourceMode;
  hasValidSources: boolean;
  consecutiveToolFailureTurns: number;
}): NextAction {
  const forcedSourceRequest = params.needsSources && params.forceSourceMode === "FORCED";

  if (forcedSourceRequest && !params.hasValidSources) {
    return "ASK_CLARIFY";
  }

  return params.consecutiveToolFailureTurns >= 1 ? "DIRECT_ANSWER" : "ASK_CLARIFY";
}
