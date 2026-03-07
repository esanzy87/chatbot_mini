import type { RouteDecision } from "@/domain/models";

export type PlanNextActionInput = {
  sessionId: string;
  message: string;
  masterContext: string;
  forceSourceMode: "FORCED" | "NOT_FORCED";
  history: Array<{ role: string; content: string }>;
};

export interface LlmPort {
  planNextAction(input: PlanNextActionInput): Promise<RouteDecision>;
  generateDirectAnswer(input: {
    message: string;
    masterContext: string;
    history: Array<{ role: string; content: string }>;
  }): Promise<string>;
}
