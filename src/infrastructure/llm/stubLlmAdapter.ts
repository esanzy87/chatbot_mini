import type { LlmPort, PlanNextActionInput } from "@/application/ports/llm";
import type { RouteDecision } from "@/domain/models";
import { clampMasterContext } from "@/application/utils/masterContext";

function hasAny(message: string, keywords: string[]): boolean {
  return keywords.some((keyword) => message.includes(keyword));
}

function mergeCounselingMemo(masterContext: string, memo: string): string {
  const memoSection = "[상담 메모]";
  const bullet = `- ${memo}`;
  const trimmed = masterContext.trim();

  if (trimmed.includes(bullet)) {
    return trimmed;
  }

  if (trimmed.includes(memoSection)) {
    return clampMasterContext(`${trimmed}\n${bullet}`);
  }

  return clampMasterContext(`${trimmed}\n\n${memoSection}\n${bullet}`);
}

export class StubLlmAdapter implements LlmPort {
  async planNextAction(input: PlanNextActionInput): Promise<RouteDecision> {
    const message = input.message.trim();

    if (hasAny(message, ["답안 그대로", "대필", "컨닝", "부정행위", "숙제 대신"])) {
      return {
        nextAction: "REFUSE",
        allowedTools: [],
        refuseReason: "제출물 통째 작성이나 부정행위 쪽이라 그건 같이 못 해.",
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
        clarifyQuestion: "좋아, 변환할 원문 텍스트를 먼저 보내줄래? 😆",
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
    const prefix = input.masterContext ? "좋아, 맥락까지 반영해서 보면 " : "내 생각엔 ";
    const contextHint = input.masterContext ? `[맥락:${input.masterContext.slice(0, 16)}] ` : "";
    return `${prefix}${contextHint}${input.message} 쪽으로 보면 돼 ✨`;
  }

  async suggestMasterContextUpdate(input: {
    masterContext: string;
    history: Array<{ role: string; content: string }>;
    message: string;
    assistantReply: string;
    finalNextAction: "DIRECT_ANSWER" | "CALL_TOOL" | "ASK_CLARIFY" | "REFUSE";
  }): Promise<string | null> {
    const userTurnCount = input.history.filter((item) => item.role === "user").length + 1;
    const message = input.message.trim();

    if (input.finalNextAction === "REFUSE" || userTurnCount < 3) {
      return null;
    }

    if (!hasAny(message, ["진로", "전공", "학과", "세특", "탐구", "유학", "입시", "로드맵", "생명과학"])) {
      return null;
    }

    return mergeCounselingMemo(input.masterContext, `사용자가 최근 상담에서 언급한 핵심 고민: ${message}`);
  }
}
