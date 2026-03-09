import type { NextAction, RouteDecision, SearchQueryPlan } from "@/domain/models";
import type { SearchResultItem } from "@/application/ports/search";

export type TokenStreamCallback = (delta: string) => void;

export type PlanNextActionInput = {
  sessionId: string;
  message: string;
  masterContext: string;
  forceSourceMode: "FORCED" | "NOT_FORCED";
  history: Array<{ role: string; content: string }>;
};

export interface LlmPort {
  planNextAction(input: PlanNextActionInput): Promise<RouteDecision>;
  planSearchQuery(input: {
    message: string;
    masterContext: string;
    history: Array<{ role: string; content: string }>;
  }): Promise<SearchQueryPlan>;
  generateDirectAnswer(input: {
    message: string;
    masterContext: string;
    history: Array<{ role: string; content: string }>;
    onToken?: TokenStreamCallback;
    abortSignal?: AbortSignal;
  }): Promise<string>;
  generateSearchAnswer(input: {
    message: string;
    masterContext: string;
    history: Array<{ role: string; content: string }>;
    searchResults: SearchResultItem[];
    onToken?: TokenStreamCallback;
    abortSignal?: AbortSignal;
  }): Promise<string>;
  suggestMasterContextUpdate(input: {
    masterContext: string;
    history: Array<{ role: string; content: string }>;
    message: string;
    assistantReply: string;
    finalNextAction: NextAction;
  }): Promise<string | null>;
}
