import type { LlmPort, PlanNextActionInput } from "@/application/ports/llm";
import type { RouteDecision } from "@/domain/models";
import { validateRouteDecision } from "@/domain/policies/routeDecision";

function extractJsonBlock(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end < start) {
    throw new Error("ROUTE_DECISION_PARSE_ERROR");
  }
  return text.slice(start, end + 1);
}

function fallbackAskClarify(reason: string): RouteDecision {
  return {
    nextAction: "ASK_CLARIFY",
    allowedTools: [],
    clarifyQuestion: "질문 의도를 한 문장으로 더 구체화해 주세요.",
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
    const systemPrompt = [
      "너는 라우팅 엔진이다.",
      "다음 JSON 스키마로만 응답해라:",
      '{"nextAction":"DIRECT_ANSWER|CALL_TOOL|ASK_CLARIFY|REFUSE","allowedTools":["search"|"transform"],"clarifyQuestion":string|null,"refuseReason":string|null,"confidence":number,"reason":string}',
      "JSON 외 텍스트 금지"
    ].join("\n");

    const userPrompt = [
      `masterContext: ${input.masterContext}`,
      `message: ${input.message}`,
      `forceSourceMode: ${input.forceSourceMode}`,
      "위 정보를 기반으로 nextAction을 결정해라."
    ].join("\n");

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

    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";

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
    const prompt = `masterContext: ${input.masterContext}\n질문: ${input.message}`;

    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }]
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

    return payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
  }
}
