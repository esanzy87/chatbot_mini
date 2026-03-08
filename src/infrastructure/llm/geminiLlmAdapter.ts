import type { LlmPort, PlanNextActionInput } from "@/application/ports/llm";
import type { RouteDecision } from "@/domain/models";
import { validateRouteDecision } from "@/domain/policies/routeDecision";
import {
  buildChatSystemPrompt,
  buildChatUserPrompt,
  buildMemoryUpdateSystemPrompt,
  buildMemoryUpdateUserPrompt,
  buildRouterSystemPrompt,
  buildRouterUserPrompt
} from "@/infrastructure/llm/prompts/saetbyulPrompts";

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

function fallbackAskClarify(reason: string): RouteDecision {
  return {
    nextAction: "ASK_CLARIFY",
    allowedTools: [],
    clarifyQuestion: "좋아, 내가 정확히 도우려면 궁금한 포인트를 한 문장으로만 더 말해줄래? ✨",
    confidence: 0.4,
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
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }]
          })
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

  async generateDirectAnswer(input: {
    message: string;
    masterContext: string;
    history: Array<{ role: string; content: string }>;
  }): Promise<string> {
    const systemPrompt = buildChatSystemPrompt();
    const userPrompt = buildChatUserPrompt(input);

    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }]
          })
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

    return extractText(payload);
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
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }]
          })
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
