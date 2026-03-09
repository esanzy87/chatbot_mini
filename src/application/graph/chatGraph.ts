import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { createEntityId, createToolCallId } from "@/core/id/ids";
import type { NextAction, RouteDecision, SearchQueryPlan, SourceItem } from "@/domain/models";
import { decideForceSourceMode } from "@/domain/policies/sourceMode";
import {
  applyConfidenceFallbackWithSourcePolicy,
  enforceForcedSearchRouteDecision,
  validateRouteDecision
} from "@/domain/policies/routeDecision";
import { classifyToolFailure, nextConsecutiveToolFailureTurns, resolveToolFailureFallback } from "@/domain/policies/toolFailure";
import { normalizeSources } from "@/domain/policies/sources";
import { toReasonSummary } from "@/domain/policies/reasonSummaryDomain";
import type { LlmPort } from "@/application/ports/llm";
import type { SearchPort, SearchResultItem } from "@/application/ports/search";
import type { ChatTurnRepository } from "@/application/ports/repository";
import { withToolTimeout } from "@/application/utils/withToolTimeout";
import { clampMasterContext, summarizeMasterContext } from "@/application/utils/masterContext";

type ToolEventPayload = {
  turnId: string;
  toolCallId: string;
  phase: "start" | "success" | "error";
  toolName: "search" | "transform";
  latencyMs?: number;
  errorCode?: string;
  message?: string;
  args?: Record<string, unknown>;
};

export type ChatGraphDeps = {
  llmPort: LlmPort;
  searchPort: SearchPort;
  repository: ChatTurnRepository;
  emitToolEvent: (payload: ToolEventPayload) => void;
  emitToken: (payload: { turnId: string; delta: string }) => void;
  abortSignal?: AbortSignal;
  isAborted: () => boolean;
  now: () => number;
};

const ChatState = Annotation.Root({
  sessionId: Annotation<string>(),
  requestId: Annotation<string>(),
  turnId: Annotation<string>(),
  userMessage: Annotation<string>(),
  needsSources: Annotation<boolean>(),
  debug: Annotation<boolean>(),
  masterContext: Annotation<string>(),
  history: Annotation<Array<{ role: string; content: string }>>(),
  routeDecision: Annotation<RouteDecision | null>(),
  searchPlan: Annotation<SearchQueryPlan | null>(),
  forceSourceMode: Annotation<"FORCED" | "NOT_FORCED">(),
  pendingTool: Annotation<null | {
    toolName: "search" | "transform";
    args: Record<string, unknown>;
  }>(),
  toolLoopCount: Annotation<number>(),
  toolExecutions: Annotation<
    Array<{
      id: string;
      toolCallId: string;
      toolName: "search" | "transform";
      args: Record<string, unknown>;
      result: Record<string, unknown>;
      ok: boolean;
      latencyMs: number;
      createdAt: string;
      phaseStarted: boolean;
    }>
  >(),
  shouldRetry: Annotation<boolean>(),
  finalText: Annotation<string>(),
  finalNextAction: Annotation<NextAction>(),
  finalSources: Annotation<SourceItem[]>(),
  unrecoverableErrorCode: Annotation<"MODEL_PROVIDER_ERROR" | "INTERNAL_SERVER_ERROR" | "TOOL_EXECUTION_ERROR" | null>(),
  doneOk: Annotation<boolean>(),
  consecutiveToolFailureTurns: Annotation<number>(),
  transactionCommitted: Annotation<boolean>()
});

type State = typeof ChatState.State;

const CAREER_COUNSELING_KEYWORDS = [
  "진로",
  "전공",
  "학과",
  "세특",
  "학생부",
  "탐구",
  "연구",
  "동아리",
  "입시",
  "유학",
  "버클리",
  "berkeley",
  "지원",
  "활동",
  "로드맵",
  "커리어",
  "의대",
  "생명과학",
  "life science"
];

function mapModelErrorCode(error: unknown): "MODEL_PROVIDER_ERROR" | "INTERNAL_SERVER_ERROR" {
  if (error instanceof Error && error.message.includes("MODEL_PROVIDER_ERROR")) {
    return "MODEL_PROVIDER_ERROR";
  }

  return "INTERNAL_SERVER_ERROR";
}

function assertRouteDecision(routeDecision: RouteDecision | null): RouteDecision {
  if (!routeDecision) {
    throw new Error("ROUTE_DECISION_MISSING");
  }
  return routeDecision;
}

function countUserTurns(history: Array<{ role: string; content: string }>, currentMessage: string): number {
  const priorUserTurns = history.filter((item) => item.role === "user").length;
  return priorUserTurns + (currentMessage.trim().length > 0 ? 1 : 0);
}

function isCareerCounselingTurn(state: State): boolean {
  const corpus = [state.masterContext, state.userMessage, ...state.history.map((item) => item.content)].join(" ").toLowerCase();
  return CAREER_COUNSELING_KEYWORDS.some((keyword) => corpus.includes(keyword.toLowerCase()));
}

function shouldAttemptMasterContextUpdate(state: State): boolean {
  if (state.finalNextAction === "REFUSE") {
    return false;
  }

  return isCareerCounselingTurn(state) && countUserTurns(state.history, state.userMessage) >= 3;
}

function chooseTool(routeDecision: RouteDecision, userMessage: string): State["pendingTool"] {
  if (!routeDecision.allowedTools.includes("search") && !routeDecision.allowedTools.includes("transform")) {
    return null;
  }

  if (routeDecision.allowedTools.includes("search")) {
    return {
      toolName: "search",
      args: {
        query: userMessage,
        topK: 5
      }
    };
  }

  return {
    toolName: "transform",
    args: {
      text: userMessage,
      targetFormat: "summary"
    }
  };
}

function resolveSearchQueryFromPlan(searchPlan: SearchQueryPlan | null, userMessage: string): string {
  const planned = searchPlan?.searchQueries?.[0]?.trim();
  return planned && planned.length > 0 ? planned : userMessage;
}

const searchArgsSchema = z.object({
  query: z.string().trim().min(2).max(300),
  topK: z.number().int().min(1).max(10)
});

const transformArgsSchema = z.object({
  text: z.string().trim().min(1).max(5000),
  targetFormat: z.enum(["summary", "outline", "presentation_script"])
});

function parseSearchToolArgs(args: Record<string, unknown>): { query: string; topK: number } {
  const parsed = searchArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error("TOOL_SCHEMA_INVALID");
  }
  return parsed.data;
}

function parseTransformToolArgs(args: Record<string, unknown>): {
  text: string;
  targetFormat: "summary" | "outline" | "presentation_script";
} {
  const parsed = transformArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error("TOOL_SCHEMA_INVALID");
  }
  return parsed.data;
}

function buildGraph(deps: ChatGraphDeps) {
  const guardAbort = () => {
    if (deps.isAborted()) {
      throw new Error("REQUEST_ABORTED");
    }
  };

  return new StateGraph(ChatState)
    .addNode("loadSessionContext", async (state: State): Promise<Partial<State>> => {
      guardAbort();
      const session = await deps.repository.getSession(state.sessionId);
      if (!session) {
        return {
          unrecoverableErrorCode: "INTERNAL_SERVER_ERROR",
          doneOk: false
        };
      }

      const history = await deps.repository.listMessages(state.sessionId);
      return {
        masterContext: session.masterContext,
        history,
        consecutiveToolFailureTurns: session.consecutiveToolFailureTurns
      };
    })
    .addNode("planNextAction", async (state: State): Promise<Partial<State>> => {
      guardAbort();
      const forceSourceMode = decideForceSourceMode({
        needsSources: state.needsSources,
        message: state.userMessage
      });

      try {
        const planned = await deps.llmPort.planNextAction({
          sessionId: state.sessionId,
          message: state.userMessage,
          masterContext: state.masterContext,
          forceSourceMode,
          history: state.history
        });

        const validated = validateRouteDecision(planned);
        const forcedPolicyApplied = enforceForcedSearchRouteDecision({
          routeDecision: validated,
          forceSourceMode
        });
        const fallbackApplied = applyConfidenceFallbackWithSourcePolicy({
          routeDecision: forcedPolicyApplied,
          forceSourceMode
        });
        const routeDecision = validateRouteDecision(fallbackApplied);

        return {
          forceSourceMode,
          routeDecision,
          finalNextAction: routeDecision.nextAction
        };
      } catch (error) {
        return {
          forceSourceMode,
          doneOk: false,
          unrecoverableErrorCode: mapModelErrorCode(error),
          finalNextAction: "ASK_CLARIFY"
        };
      }
    })
    .addNode("directAnswer", async (state: State): Promise<Partial<State>> => {
      guardAbort();
      try {
        const text = await deps.llmPort.generateDirectAnswer({
          message: state.userMessage,
          masterContext: state.masterContext,
          history: state.history,
          ...(deps.abortSignal ? { abortSignal: deps.abortSignal } : {}),
          onToken: (delta) => {
            if (!deps.isAborted()) {
              deps.emitToken({ turnId: state.turnId, delta });
            }
          }
        });

        return {
          finalText: text,
          finalNextAction: "DIRECT_ANSWER",
          doneOk: true
        };
      } catch (error) {
        return {
          doneOk: false,
          unrecoverableErrorCode: mapModelErrorCode(error),
          finalNextAction: "DIRECT_ANSWER"
        };
      }
    })
    .addNode("askClarify", async (state: State): Promise<Partial<State>> => {
      guardAbort();
      const routeDecision = assertRouteDecision(state.routeDecision);

      return {
        finalText: routeDecision.clarifyQuestion ?? "정확한 답변을 위해 궁금한 내용을 한 문장으로 조금만 더 구체적으로 알려주세요.",
        finalNextAction: "ASK_CLARIFY",
        doneOk: true
      };
    })
    .addNode("refuse", async (state: State): Promise<Partial<State>> => {
      guardAbort();
      const routeDecision = assertRouteDecision(state.routeDecision);
      return {
        finalText: `요청하신 내용은 직접 수행해드릴 수 없습니다. 대신 방향 설정이나 구조 정리는 도와드릴 수 있습니다. (${routeDecision.refuseReason ?? "정책상 거절"})`,
        finalNextAction: "REFUSE",
        doneOk: true
      };
    })
    .addNode("callModelWithTools", async (state: State): Promise<Partial<State>> => {
      guardAbort();
      const routeDecision = assertRouteDecision(state.routeDecision);
      if (state.toolLoopCount >= 2) {
        return {
          finalText: "자료 조회가 반복적으로 실패했습니다. 키워드나 질문 범위를 조금 더 좁혀서 다시 요청해 주세요.",
          finalNextAction: "ASK_CLARIFY",
          doneOk: true,
          shouldRetry: false
        };
      }

      let searchPlan: SearchQueryPlan | null = null;
      if (routeDecision.allowedTools.includes("search")) {
        try {
          searchPlan = await deps.llmPort.planSearchQuery({
            message: state.userMessage,
            masterContext: state.masterContext,
            history: state.history
          });
        } catch {
          searchPlan = null;
        }
      }

      return {
        pendingTool:
          routeDecision.allowedTools.includes("search")
            ? {
                toolName: "search",
                args: {
                  query: resolveSearchQueryFromPlan(searchPlan, state.userMessage),
                  topK: 5
                }
              }
            : chooseTool(routeDecision, state.userMessage),
        searchPlan,
        shouldRetry: false
      };
    })
    .addNode("toolNode", async (state: State): Promise<Partial<State>> => {
      guardAbort();
      if (!state.pendingTool) {
        return {
          doneOk: true,
          finalText: "현재 요청에서 바로 실행할 도구를 결정하기 어렵습니다. 질문을 조금 더 구체적으로 알려주세요.",
          finalNextAction: "ASK_CLARIFY",
          shouldRetry: false
        };
      }

      const startedAt = deps.now();
      const toolCallId = createToolCallId();
      deps.emitToolEvent({
        turnId: state.turnId,
        toolCallId,
        phase: "start",
        toolName: state.pendingTool.toolName,
        ...(state.debug ? { args: state.pendingTool.args } : {})
      });

      try {
        if (state.pendingTool.toolName === "search") {
          const validatedArgs = parseSearchToolArgs(state.pendingTool.args);
          const result = await withToolTimeout(
            (signal) => deps.searchPort.search(validatedArgs, { signal }),
            8000,
            deps.abortSignal
          );

          const latencyMs = Math.max(0, Math.floor(deps.now() - startedAt));
          deps.emitToolEvent({
            turnId: state.turnId,
            toolCallId,
            phase: "success",
            toolName: state.pendingTool.toolName,
            latencyMs
          });

          const execution = {
            id: createEntityId(),
            toolCallId,
            toolName: state.pendingTool.toolName,
            args: validatedArgs,
            result: result as Record<string, unknown>,
            ok: true,
            latencyMs,
            createdAt: new Date().toISOString(),
            phaseStarted: true
          };

          const rawItems = (result.items ?? []) as SearchResultItem[];
          const sources = normalizeSources(
            rawItems.map((item) => ({
              title: item.title,
              url: item.url,
              source: item.source
            }))
          );

          if (state.needsSources && state.forceSourceMode === "FORCED" && sources.length === 0) {
            return {
              toolExecutions: [...state.toolExecutions, execution],
              finalText: "현재 조회 결과만으로는 출처가 충분하지 않습니다. 찾고 싶은 대상이나 조건을 조금 더 구체화해 주세요.",
              finalNextAction: "ASK_CLARIFY",
              finalSources: [],
              doneOk: true,
              shouldRetry: false,
              toolLoopCount: state.toolLoopCount + 1
            };
          }

          let finalText: string;
          if (rawItems.length > 0) {
            try {
              finalText = await deps.llmPort.generateSearchAnswer({
                message: state.userMessage,
                masterContext: state.masterContext,
                history: state.history,
                searchResults: rawItems,
                ...(deps.abortSignal ? { abortSignal: deps.abortSignal } : {}),
                onToken: (delta) => {
                  if (!deps.isAborted()) {
                    deps.emitToken({ turnId: state.turnId, delta });
                  }
                }
              });
            } catch (error) {
              if (error instanceof Error && error.message.includes("MODEL_PROVIDER_ERROR")) {
                finalText = `관련 자료를 확인했습니다. ${sources
                  .map((item) => item.title)
                  .slice(0, 3)
                  .join(", ")}`;
              } else {
                throw error;
              }
            }
          } else {
            finalText = "관련 자료를 찾지 못했습니다. 키워드나 범위를 조금 더 구체적으로 알려주세요.";
          }

          return {
            toolExecutions: [...state.toolExecutions, execution],
            finalText,
            finalNextAction: "CALL_TOOL",
            finalSources: sources,
            doneOk: true,
            shouldRetry: false,
            toolLoopCount: state.toolLoopCount + 1
          };
        }

        const validatedArgs = parseTransformToolArgs(state.pendingTool.args);
        const result = await withToolTimeout(
          (signal) => deps.searchPort.transform(validatedArgs, { signal }),
          8000,
          deps.abortSignal
        );
        const latencyMs = Math.max(0, Math.floor(deps.now() - startedAt));
        deps.emitToolEvent({
          turnId: state.turnId,
          toolCallId,
          phase: "success",
          toolName: state.pendingTool.toolName,
          latencyMs
        });

        const execution = {
          id: createEntityId(),
          toolCallId,
          toolName: state.pendingTool.toolName,
          args: validatedArgs,
          result: result as Record<string, unknown>,
          ok: true,
          latencyMs,
          createdAt: new Date().toISOString(),
          phaseStarted: true
        };

        return {
          toolExecutions: [...state.toolExecutions, execution],
          finalText: result.resultText,
          finalNextAction: "CALL_TOOL",
          doneOk: true,
          shouldRetry: false,
          toolLoopCount: state.toolLoopCount + 1
        };
      } catch (error) {
        const latencyMs = Math.max(0, Math.floor(deps.now() - startedAt));
        const message = error instanceof Error ? error.message : "";
        if (deps.isAborted() || message.includes("REQUEST_ABORTED")) {
          throw new Error("REQUEST_ABORTED");
        }

        const isTimeout = message.includes("TOOL_TIMEOUT");
        const isNodeException = message.includes("NODE_EXCEPTION");
        const isSchemaInvalid = message.includes("TOOL_SCHEMA_INVALID");
        const isNetworkError = message.includes("TOOL_NETWORK_ERROR");
        const code = isTimeout ? "TOOL_TIMEOUT" : "TOOL_EXECUTION_ERROR";

        deps.emitToolEvent({
          turnId: state.turnId,
          toolCallId,
          phase: "error",
          toolName: state.pendingTool.toolName,
          errorCode: code,
          message: "도구 실행 중 오류가 발생했습니다."
        });

        const execution = {
          id: createEntityId(),
          toolCallId,
          toolName: state.pendingTool.toolName,
          args: state.pendingTool.args,
          result: {
            errorCode: code,
            message: "도구 실행 중 오류가 발생했습니다."
          },
          ok: false,
          latencyMs,
          createdAt: new Date().toISOString(),
          phaseStarted: true
        };

        const classification = classifyToolFailure({
          toolCallId,
          kind: isTimeout
            ? "TIMEOUT"
            : isNodeException
              ? "NODE_EXCEPTION"
              : isSchemaInvalid
                ? "SCHEMA_INVALID"
                : isNetworkError
                  ? "NETWORK"
                  : "PROVIDER_5XX",
          graphCanContinue: !isNodeException
        });

        if (classification === "unrecoverable") {
          return {
            toolExecutions: [...state.toolExecutions, execution],
            unrecoverableErrorCode: "TOOL_EXECUTION_ERROR",
            doneOk: false,
            shouldRetry: false,
            toolLoopCount: state.toolLoopCount + 1
          };
        }

        if (state.toolLoopCount === 0) {
          return {
            toolExecutions: [...state.toolExecutions, execution],
            shouldRetry: true,
            toolLoopCount: state.toolLoopCount + 1
          };
        }

        const fallbackAction = resolveToolFailureFallback({
          needsSources: state.needsSources,
          forceSourceMode: state.forceSourceMode,
          hasValidSources: state.finalSources.length > 0,
          consecutiveToolFailureTurns: state.consecutiveToolFailureTurns
        });

        return {
          toolExecutions: [...state.toolExecutions, execution],
          finalNextAction: fallbackAction,
          finalText:
            fallbackAction === "ASK_CLARIFY"
              ? "도구 실행 중 오류가 발생했습니다. 키워드나 범위를 조금 더 구체화해 다시 요청해 주세요."
              : "도구 호출 없이 답변 가능한 범위에서 안내드립니다.",
          doneOk: true,
          shouldRetry: false,
          toolLoopCount: state.toolLoopCount + 1
        };
      }
    })
    .addNode("finalize", async (state: State): Promise<Partial<State>> => {
      guardAbort();
      if (!state.doneOk) {
        deps.repository.finalizeTurn({
          sessionId: state.sessionId,
          turnId: state.turnId,
          userMessage: {
            id: createEntityId(),
            content: state.userMessage,
            createdAt: new Date().toISOString()
          },
          toolExecutions: state.toolExecutions.map((tool) => ({
            id: tool.id,
            sessionId: state.sessionId,
            turnId: state.turnId,
            toolCallId: tool.toolCallId,
            toolName: tool.toolName,
            args: tool.args,
            result: tool.result,
            ok: tool.ok,
            latencyMs: tool.latencyMs,
            createdAt: tool.createdAt
          })),
          sessionUpdatedAt: new Date().toISOString(),
          shouldPersist: () => !deps.isAborted()
        });

        return {
          transactionCommitted: true
        };
      }

      const outcome =
        state.routeDecision?.nextAction === "CALL_TOOL" && state.finalNextAction === "ASK_CLARIFY"
          ? "TOOL_FAILURE_ASK_CLARIFY"
          : state.routeDecision?.nextAction === "CALL_TOOL" &&
              state.finalNextAction === "DIRECT_ANSWER" &&
              state.toolExecutions.some((item) => !item.ok)
            ? "SECOND_FALLBACK_DIRECT_ANSWER"
          : state.routeDecision?.nextAction === "CALL_TOOL"
            ? "TOOL_SUCCESS"
            : "NON_CALL_TOOL_NORMAL";

      const nextCounter = nextConsecutiveToolFailureTurns(state.consecutiveToolFailureTurns, outcome);
      let masterContextUpdate:
        | {
            content: string;
            summary: string;
          }
        | undefined;

      if (shouldAttemptMasterContextUpdate(state)) {
        try {
          const suggested = await deps.llmPort.suggestMasterContextUpdate({
            masterContext: state.masterContext,
            history: state.history,
            message: state.userMessage,
            assistantReply: state.finalText,
            finalNextAction: state.finalNextAction
          });

          if (suggested && suggested.trim() && suggested.trim() !== state.masterContext.trim()) {
            const content = clampMasterContext(suggested);
            const summary = summarizeMasterContext(content) || [...content].slice(0, 120).join("");
            masterContextUpdate = {
              content,
              summary
            };
          }
        } catch {
          masterContextUpdate = undefined;
        }
      }

      deps.repository.finalizeTurn({
        sessionId: state.sessionId,
        turnId: state.turnId,
        userMessage: {
          id: createEntityId(),
          content: state.userMessage,
          createdAt: new Date().toISOString()
        },
        aiMessage: {
          id: createEntityId(),
          content: state.finalText,
          createdAt: new Date().toISOString()
        },
        toolExecutions: state.toolExecutions.map((tool) => ({
          id: tool.id,
          sessionId: state.sessionId,
          turnId: state.turnId,
          toolCallId: tool.toolCallId,
          toolName: tool.toolName,
          args: tool.args,
          result: tool.result,
          ok: tool.ok,
          latencyMs: tool.latencyMs,
          createdAt: tool.createdAt
        })),
        decisionTrace: {
          id: createEntityId(),
          sessionId: state.sessionId,
          turnId: state.turnId,
          nextAction: state.finalNextAction,
          reasonSummary: toReasonSummary(state.routeDecision?.reason ?? "판단 요약 없음"),
          allowedTools: state.routeDecision?.allowedTools ?? [],
          createdAt: new Date().toISOString()
        },
        nextConsecutiveToolFailureTurns: nextCounter,
        sessionUpdatedAt: new Date().toISOString(),
        ...(masterContextUpdate ? { masterContextUpdate } : {}),
        shouldPersist: () => !deps.isAborted()
      });

      return {
        transactionCommitted: true
      };
    })
    .addEdge(START, "loadSessionContext")
    .addEdge("loadSessionContext", "planNextAction")
    .addConditionalEdges("planNextAction", (state: State) => {
      if (!state.doneOk) {
        return "finalize";
      }
      const decision = assertRouteDecision(state.routeDecision);
      if (decision.nextAction === "DIRECT_ANSWER") {
        return "directAnswer";
      }
      if (decision.nextAction === "ASK_CLARIFY") {
        return "askClarify";
      }
      if (decision.nextAction === "REFUSE") {
        return "refuse";
      }
      return "callModelWithTools";
    })
    .addConditionalEdges("callModelWithTools", (state: State) => {
      if (state.pendingTool) {
        return "toolNode";
      }
      return "finalize";
    })
    .addConditionalEdges("toolNode", (state: State) => {
      if (state.shouldRetry && state.toolLoopCount < 2) {
        return "callModelWithTools";
      }
      return "finalize";
    })
    .addEdge("directAnswer", "finalize")
    .addEdge("askClarify", "finalize")
    .addEdge("refuse", "finalize")
    .addEdge("finalize", END)
    .compile();
}

export async function runChatGraph(
  deps: ChatGraphDeps,
  input: {
    sessionId: string;
    requestId: string;
    turnId: string;
    userMessage: string;
    needsSources: boolean;
    debug: boolean;
  }
): Promise<{
  doneOk: boolean;
  finalNextAction: NextAction;
  finalText: string;
  sources: SourceItem[];
  reasonSummary: string;
  errorCode: "MODEL_PROVIDER_ERROR" | "INTERNAL_SERVER_ERROR" | "TOOL_EXECUTION_ERROR" | null;
}> {
  const app = buildGraph(deps);
  const finalState = await app.invoke({
    sessionId: input.sessionId,
    requestId: input.requestId,
    turnId: input.turnId,
    userMessage: input.userMessage,
    needsSources: input.needsSources,
    debug: input.debug,
    masterContext: "",
    history: [],
    routeDecision: null,
    searchPlan: null,
    forceSourceMode: "NOT_FORCED",
    pendingTool: null,
    toolLoopCount: 0,
    toolExecutions: [],
    shouldRetry: false,
    finalText: "",
    finalNextAction: "ASK_CLARIFY",
    finalSources: [],
    unrecoverableErrorCode: null,
    doneOk: true,
    consecutiveToolFailureTurns: 0,
    transactionCommitted: false
  });

  return {
    doneOk: finalState.doneOk,
    finalNextAction: finalState.finalNextAction,
    finalText: finalState.finalText,
    sources: finalState.finalSources,
    reasonSummary: toReasonSummary(finalState.routeDecision?.reason ?? "판단 요약 없음"),
    errorCode: finalState.unrecoverableErrorCode
  };
}
