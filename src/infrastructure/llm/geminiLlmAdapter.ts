import type { LlmPort, PlanNextActionInput } from "@/application/ports/llm";
import type { RouteDecision, SearchQueryPlan } from "@/domain/models";
import { validateRouteDecision } from "@/domain/policies/routeDecision";
import {
  buildChatSystemPrompt,
  buildChatUserPrompt,
  buildMemoryUpdateSystemPrompt,
  buildMemoryUpdateUserPrompt,
  buildSearchPlannerSystemPrompt,
  buildSearchPlannerUserPrompt,
  buildSearchAnswerSystemPrompt,
  buildSearchAnswerUserPrompt,
  buildRouterSystemPrompt,
  buildRouterUserPrompt
} from "@/infrastructure/llm/prompts/chatbotPrompts";

const GEMINI_REQUEST_TIMEOUT_MS = 45_000;

function extractJsonBlock(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end < start) {
    throw new Error("ROUTE_DECISION_PARSE_ERROR");
  }
  return text.slice(start, end + 1);
}

function extractText(payload: {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}): string {
  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
}

async function fetchGemini(
  url: string,
  init: RequestInit,
  options?: {
    timeoutMs?: number;
    upstreamSignal?: AbortSignal;
  }
): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? GEMINI_REQUEST_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort("GEMINI_TIMEOUT"), timeoutMs);

  const onAbort = () => controller.abort("UPSTREAM_ABORTED");
  options?.upstreamSignal?.addEventListener("abort", onAbort, { once: true });

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (options?.upstreamSignal?.aborted) {
      throw new Error("REQUEST_ABORTED");
    }

    if (controller.signal.aborted) {
      throw new Error("MODEL_PROVIDER_ERROR");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    options?.upstreamSignal?.removeEventListener("abort", onAbort);
  }
}

async function readGeminiSseStream(
  stream: ReadableStream<Uint8Array>,
  onToken?: (delta: string) => void
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let aggregated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");

    while (buffer.includes("\n\n")) {
      const boundaryIndex = buffer.indexOf("\n\n");
      const block = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);

      const dataLines = block
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n")
        .trim();

      if (!dataLines || dataLines === "[DONE]") {
        continue;
      }

      try {
        const payload = JSON.parse(dataLines) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string }>;
            };
          }>;
        };
        const delta = extractText(payload);
        if (delta.length > 0) {
          aggregated += delta;
          onToken?.(delta);
        }
      } catch {
        // ignore malformed SSE chunks from upstream provider
      }
    }
  }

  return aggregated;
}

function fallbackAskClarify(reason: string): RouteDecision {
  return {
    nextAction: "ASK_CLARIFY",
    allowedTools: [],
    clarifyQuestion: "정확한 안내를 위해 궁금한 포인트를 한 문장으로 조금만 더 구체화해 주세요.",
    confidence: 0.4,
    reason
  };
}

function fallbackSearchPlan(message: string, reason: string): SearchQueryPlan {
  return {
    searchIntent: "기본 검색 fallback",
    searchQueries: [message.trim()],
    mustInclude: [],
    mustExclude: [],
    answerShape: "definition",
    reason
  };
}

export class GeminiLlmAdapter implements LlmPort {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = "gemini-2.5-flash"
  ) {}

  async planNextAction(input: PlanNextActionInput): Promise<RouteDecision> {
    const systemPrompt = buildRouterSystemPrompt();
    const userPrompt = buildRouterUserPrompt(input);

    let response: Response;
    try {
      response = await fetchGemini(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }]
          })
        },
        {
          timeoutMs: GEMINI_REQUEST_TIMEOUT_MS
        }
      );
    } catch {
      throw new Error("MODEL_PROVIDER_ERROR");
    }

    if (!response.ok) {
      throw new Error("MODEL_PROVIDER_ERROR");
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const text = extractText(payload);

    try {
      const jsonBlock = extractJsonBlock(text);
      const parsed = JSON.parse(jsonBlock) as RouteDecision;
      return validateRouteDecision(parsed);
    } catch {
      return fallbackAskClarify("라우터 출력 파싱 실패");
    }
  }

  async planSearchQuery(input: {
    message: string;
    masterContext: string;
    history: Array<{ role: string; content: string }>;
  }): Promise<SearchQueryPlan> {
    const systemPrompt = buildSearchPlannerSystemPrompt();
    const userPrompt = buildSearchPlannerUserPrompt(input);

    let response: Response;
    try {
      response = await fetchGemini(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }]
          })
        },
        {
          timeoutMs: GEMINI_REQUEST_TIMEOUT_MS
        }
      );
    } catch {
      return fallbackSearchPlan(input.message, "검색 플래너 호출 실패");
    }

    if (!response.ok) {
      return fallbackSearchPlan(input.message, "검색 플래너 응답 실패");
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    try {
      const jsonBlock = extractJsonBlock(extractText(payload));
      const parsed = JSON.parse(jsonBlock) as Partial<SearchQueryPlan>;
      const queries = Array.isArray(parsed.searchQueries)
        ? parsed.searchQueries.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
        : [];

      if (queries.length === 0) {
        return fallbackSearchPlan(input.message, "검색 플랜 쿼리 비어 있음");
      }

      return {
        searchIntent: typeof parsed.searchIntent === "string" && parsed.searchIntent.trim() ? parsed.searchIntent.trim() : "검색 의도 확인",
        searchQueries: queries,
        mustInclude: Array.isArray(parsed.mustInclude)
          ? parsed.mustInclude.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
          : [],
        mustExclude: Array.isArray(parsed.mustExclude)
          ? parsed.mustExclude.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
          : [],
        answerShape:
          parsed.answerShape === "comparison" ||
          parsed.answerShape === "latest" ||
          parsed.answerShape === "process" ||
          parsed.answerShape === "recommendation"
            ? parsed.answerShape
            : "definition",
        reason: typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : "검색어 재작성"
      };
    } catch {
      return fallbackSearchPlan(input.message, "검색 플래너 파싱 실패");
    }
  }

  async generateDirectAnswer(input: {
    message: string;
    masterContext: string;
    history: Array<{ role: string; content: string }>;
    onToken?: (delta: string) => void;
    abortSignal?: AbortSignal;
  }): Promise<string> {
    const systemPrompt = buildChatSystemPrompt();
    const userPrompt = buildChatUserPrompt(input);

    let response: Response;
    try {
      response = await fetchGemini(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }]
          })
        },
        {
          timeoutMs: GEMINI_REQUEST_TIMEOUT_MS,
          ...(input.abortSignal ? { upstreamSignal: input.abortSignal } : {})
        }
      );
    } catch {
      throw new Error("MODEL_PROVIDER_ERROR");
    }

    if (!response.ok) {
      throw new Error("MODEL_PROVIDER_ERROR");
    }

    if (!response.body) {
      return "";
    }

    return await readGeminiSseStream(response.body, input.onToken);
  }

  async generateSearchAnswer(input: {
    message: string;
    masterContext: string;
    history: Array<{ role: string; content: string }>;
    searchResults: Array<{
      title: string;
      snippet: string;
      source: string;
      url: string;
      bodyText: string;
    }>;
    onToken?: (delta: string) => void;
    abortSignal?: AbortSignal;
  }): Promise<string> {
    const systemPrompt = buildSearchAnswerSystemPrompt();
    const userPrompt = buildSearchAnswerUserPrompt(input);

    let response: Response;
    try {
      response = await fetchGemini(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }]
          })
        },
        {
          timeoutMs: GEMINI_REQUEST_TIMEOUT_MS,
          ...(input.abortSignal ? { upstreamSignal: input.abortSignal } : {})
        }
      );
    } catch {
      throw new Error("MODEL_PROVIDER_ERROR");
    }

    if (!response.ok) {
      throw new Error("MODEL_PROVIDER_ERROR");
    }

    if (!response.body) {
      return "";
    }

    return await readGeminiSseStream(response.body, input.onToken);
  }

  async suggestMasterContextUpdate(input: {
    masterContext: string;
    history: Array<{ role: string; content: string }>;
    message: string;
    assistantReply: string;
    finalNextAction: "DIRECT_ANSWER" | "CALL_TOOL" | "ASK_CLARIFY" | "REFUSE";
  }): Promise<string | null> {
    const systemPrompt = buildMemoryUpdateSystemPrompt();
    const userPrompt = buildMemoryUpdateUserPrompt(input);

    let response: Response;
    try {
      response = await fetchGemini(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }]
          })
        },
        {
          timeoutMs: GEMINI_REQUEST_TIMEOUT_MS
        }
      );
    } catch {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    try {
      const jsonBlock = extractJsonBlock(extractText(payload));
      const parsed = JSON.parse(jsonBlock) as {
        shouldUpdate?: boolean;
        updatedMasterContext?: string | null;
      };

      if (!parsed.shouldUpdate || typeof parsed.updatedMasterContext !== "string" || parsed.updatedMasterContext.trim() === "") {
        return null;
      }

      return parsed.updatedMasterContext.trim();
    } catch {
      return null;
    }
  }
}
