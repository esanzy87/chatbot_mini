export type NextAction = "DIRECT_ANSWER" | "CALL_TOOL" | "ASK_CLARIFY" | "REFUSE";

export type AllowedTool = "search" | "transform";

export type RouteDecision = {
  nextAction: NextAction;
  allowedTools: AllowedTool[];
  clarifyQuestion?: string | null;
  refuseReason?: string | null;
  confidence: number;
  reason: string; // runtime-only
};

export type ForceSourceMode = "FORCED" | "NOT_FORCED";

export type ConversationState = {
  sessionId: string;
  messages: Array<{ role: string; content: string }>;
  masterContext: string;
  forceSourceMode: ForceSourceMode;
  consecutiveToolFailureTurns: number;
  routeDecision?: RouteDecision;
  allowedTools: string[];
  debug?: {
    traceId?: string;
    latencyMs?: number;
    toolCalls?: number;
  };
};

export type ReasoningTrace = {
  turnId: string;
  nextAction: NextAction;
  reasonSummary: string;
  allowedTools: string[];
  toolExecutions: Array<{
    toolCallId: string;
    toolName: string;
    ok: boolean;
    latencyMs: number;
  }>;
  createdAt: string;
};

export type SourceItem = {
  title: string;
  url: string;
  source: string;
};

export type SearchQueryPlan = {
  searchIntent: string;
  searchQueries: string[];
  mustInclude: string[];
  mustExclude: string[];
  answerShape: "definition" | "comparison" | "latest" | "process" | "recommendation";
  reason: string;
};

export type SearchReflection = {
  decision: "ANSWER" | "REFINE_SEARCH" | "ASK_CLARIFY";
  followupQuery: string | null;
  clarifyQuestion: string | null;
  reason: string;
};
