import type { NextAction, ReasoningTrace } from "@/domain/models";

export type SessionRecord = {
  sessionId: string;
  masterContext: string;
  masterContextSummary: string;
  createdAt: string;
  consecutiveToolFailureTurns: number;
};

export interface SessionRepository {
  createSession(params: {
    sessionId: string;
    masterContext: string;
    masterContextSummary: string;
    createdAt: string;
  }): Promise<void>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  updateConsecutiveToolFailureTurns(params: {
    sessionId: string;
    consecutiveToolFailureTurns: number;
    updatedAt: string;
  }): Promise<void>;
  updateMasterContext(params: {
    sessionId: string;
    masterContext: string;
    masterContextSummary: string;
    updatedAt: string;
  }): Promise<void>;
}

export interface MessageRepository {
  listMessages(sessionId: string): Promise<Array<{ role: string; content: string }>>;
  appendMessages(params: {
    sessionId: string;
    turnId: string;
    messages: Array<{ role: "user" | "ai"; content: string; metadata?: Record<string, unknown> }>;
    createdAt: string;
  }): Promise<void>;
}

export interface TraceRepository {
  appendDecisionTrace(params: {
    sessionId: string;
    turnId: string;
    nextAction: NextAction;
    reasonSummary: string;
    allowedTools: string[];
    createdAt: string;
  }): Promise<void>;
  listReasoningTraces(params: {
    sessionId: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: ReasoningTrace[]; nextCursor: string | null }>;
}

export interface ToolExecutionRepository {
  appendToolExecutions(params: {
    sessionId: string;
    turnId: string;
    items: Array<{
      id: string;
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      result: Record<string, unknown>;
      ok: boolean;
      latencyMs: number;
      createdAt: string;
    }>;
  }): Promise<void>;
}

export type TurnMessageWrite = {
  id: string;
  content: string;
  createdAt: string;
};

export type TurnToolExecutionWrite = {
  id: string;
  sessionId: string;
  turnId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  ok: boolean;
  latencyMs: number;
  createdAt: string;
};

export type TurnDecisionTraceWrite = {
  id: string;
  sessionId: string;
  turnId: string;
  nextAction: NextAction;
  reasonSummary: string;
  allowedTools: string[];
  createdAt: string;
};

export type FinalizeTurnInput = {
  sessionId: string;
  turnId: string;
  userMessage?: TurnMessageWrite;
  aiMessage?: TurnMessageWrite;
  toolExecutions: TurnToolExecutionWrite[];
  decisionTrace?: TurnDecisionTraceWrite;
  nextConsecutiveToolFailureTurns?: number;
  sessionUpdatedAt?: string;
  masterContextUpdate?: {
    content: string;
    summary: string;
  };
  shouldPersist?: () => boolean;
};

export interface ChatTurnRepository {
  getSession(sessionId: string): Promise<SessionRecord | null>;
  listMessages(sessionId: string): Promise<Array<{ role: string; content: string }>>;
  finalizeTurn(input: FinalizeTurnInput): void;
}
