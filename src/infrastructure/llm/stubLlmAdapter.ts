import type { LlmPort, PlanNextActionInput } from "@/application/ports/llm";
import type { RouteDecision } from "@/domain/models";

function hasAny(message: string, keywords: string[]): boolean {
  return keywords.some((keyword) => message.includes(keyword));
}

export class StubLlmAdapter implements LlmPort {
  async planNextAction(input: PlanNextActionInput): Promise<RouteDecision> {
    const message = input.message.trim();

    if (hasAny(message, ["답안 그대로", "대필", "컨닝", "부정행위", "숙제 대신"])) {
      return {
        nextAction: "REFUSE",
        allowedTools: [],
        refuseReason: "학습 윤리 위반 가능성이 있어 거절합니다.",
        confidence: 0.95,
        reason: "부정행위 요청"
      };
    }

    if (hasAny(message, ["논문", "검색", "찾아", "근거", "출처", "최신 통계"])) {
      return {
        nextAction: "CALL_TOOL",
        allowedTools: ["search"],
        confidence: 0.9,
        reason: "검색 필요"
      };
    }

    if (hasAny(message, ["요약", "개요", "발표 대본", "변환"])) {
      return {
        nextAction: "ASK_CLARIFY",
        allowedTools: [],
        clarifyQuestion: "변환할 원문 텍스트를 함께 보내주세요.",
        confidence: 0.82,
        reason: "변환 요청이지만 입력 원문 불충분"
      };
    }

    return {
      nextAction: "DIRECT_ANSWER",
      allowedTools: [],
      confidence: 0.88,
      reason: "도구 없이 설명 가능"
    };
  }

  async generateDirectAnswer(input: {
    message: string;
    masterContext: string;
    history: Array<{ role: string; content: string }>;
  }): Promise<string> {
    const prefix = input.masterContext ? "맥락 반영 답변: " : "답변: ";
    const contextHint = input.masterContext ? `[맥락:${input.masterContext.slice(0, 16)}] ` : "";
    return `${prefix}${contextHint}${input.message}`;
  }
}
