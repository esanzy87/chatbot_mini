import type { AllowedTool, ForceSourceMode, RouteDecision } from "@/domain/models";

const ALLOWED_TOOLS: AllowedTool[] = ["search", "transform"];

export function validateRouteDecision(input: RouteDecision): RouteDecision {
  if (input.nextAction === "CALL_TOOL") {
    if (input.allowedTools.length < 1) {
      throw new Error("CALL_TOOL requires at least one allowed tool.");
    }

    for (const tool of input.allowedTools) {
      if (!ALLOWED_TOOLS.includes(tool)) {
        throw new Error(`Invalid allowed tool: ${tool}`);
      }
    }
  }

  if (input.nextAction !== "CALL_TOOL" && input.allowedTools.length !== 0) {
    throw new Error(`${input.nextAction} requires empty allowedTools.`);
  }

  if (input.nextAction === "ASK_CLARIFY") {
    const question = (input.clarifyQuestion ?? "").trim();
    if (question.length < 1 || question.length > 300) {
      throw new Error("ASK_CLARIFY requires clarifyQuestion length 1..300.");
    }
  }

  if (input.nextAction === "REFUSE") {
    const refuseReason = (input.refuseReason ?? "").trim();
    if (refuseReason.length < 1 || refuseReason.length > 200) {
      throw new Error("REFUSE requires refuseReason length 1..200.");
    }
  }

  if (input.confidence < 0 || input.confidence > 1) {
    throw new Error("confidence must be within 0..1.");
  }

  return input;
}

export function applyConfidenceFallback(input: RouteDecision): RouteDecision {
  if (input.confidence >= 0.55) {
    return input;
  }

  return {
    nextAction: "ASK_CLARIFY",
    allowedTools: [],
    clarifyQuestion: "질문 의도를 더 구체적으로 알려주세요.",
    confidence: input.confidence,
    reason: input.reason
  };
}

export function enforceForcedSearchRouteDecision(params: {
  routeDecision: RouteDecision;
  forceSourceMode: ForceSourceMode;
}): RouteDecision {
  const { routeDecision, forceSourceMode } = params;
  if (forceSourceMode !== "FORCED") {
    return routeDecision;
  }

  if (routeDecision.nextAction === "REFUSE") {
    return routeDecision;
  }

  if (routeDecision.nextAction === "CALL_TOOL" && routeDecision.allowedTools.includes("search")) {
    return routeDecision;
  }

  return {
    ...routeDecision,
    nextAction: "CALL_TOOL",
    allowedTools: ["search"],
    clarifyQuestion: null,
    refuseReason: null,
    reason: `${routeDecision.reason} | 출처 강제 정책으로 search 우선`
  };
}

export function applyConfidenceFallbackWithSourcePolicy(params: {
  routeDecision: RouteDecision;
  forceSourceMode: ForceSourceMode;
}): RouteDecision {
  const { routeDecision, forceSourceMode } = params;

  if (
    forceSourceMode === "FORCED" &&
    routeDecision.nextAction === "CALL_TOOL" &&
    routeDecision.allowedTools.includes("search")
  ) {
    return routeDecision;
  }

  return applyConfidenceFallback(routeDecision);
}
