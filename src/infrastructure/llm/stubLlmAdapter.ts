import type { LlmPort, PlanNextActionInput } from "@/application/ports/llm";
import type { RouteDecision, SearchQueryPlan } from "@/domain/models";
import { clampMasterContext } from "@/application/utils/masterContext";
import type { SearchResultItem } from "@/application/ports/search";

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
  private emitChunks(text: string, onToken?: (delta: string) => void): void {
    if (!onToken || text.length === 0) {
      return;
    }

    const chunkSize = Math.max(1, Math.ceil(text.length / 3));
    for (let index = 0; index < text.length; index += chunkSize) {
      onToken(text.slice(index, index + chunkSize));
    }
  }

  async planNextAction(input: PlanNextActionInput): Promise<RouteDecision> {
    const message = input.message.trim();

    if (hasAny(message, ["답안 그대로", "대필", "컨닝", "부정행위", "숙제 대신"])) {
      return {
        nextAction: "REFUSE",
        allowedTools: [],
        refuseReason: "제출물 전체 작성이나 부정행위에 해당해 직접 도와드릴 수 없습니다.",
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
        clarifyQuestion: "변환할 원문 텍스트를 먼저 보내주세요.",
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

  async planSearchQuery(input: {
    message: string;
    masterContext: string;
    history: Array<{ role: string; content: string }>;
  }): Promise<SearchQueryPlan> {
    const normalized = input.message.trim().replace(/\s+/g, " ");
    const looksLatest = hasAny(normalized, ["최신", "통계", "최근", "출처", "공식"]);

    return {
      searchIntent: looksLatest ? "최신 정보와 공식 근거 확인" : "질문 관련 핵심 정보 확인",
      searchQueries: [looksLatest ? `${normalized} 공식 출처` : `${normalized} 핵심 정보`, normalized],
      mustInclude: [],
      mustExclude: [],
      answerShape: looksLatest ? "latest" : "definition",
      reason: "검색어를 검색 친화적으로 재작성함"
    };
  }

  async generateDirectAnswer(input: {
    message: string;
    masterContext: string;
    history: Array<{ role: string; content: string }>;
    onToken?: (delta: string) => void;
    abortSignal?: AbortSignal;
  }): Promise<string> {
    const prefix = input.masterContext ? "세션 맥락을 반영하면 " : "답변드리면 ";
    const contextHint = input.masterContext ? `[맥락:${input.masterContext.slice(0, 16)}] ` : "";
    const text = `${prefix}${contextHint}${input.message} 쪽으로 보시면 됩니다.`;
    this.emitChunks(text, input.onToken);
    return text;
  }

  async generateSearchAnswer(input: {
    message: string;
    masterContext: string;
    history: Array<{ role: string; content: string }>;
    searchResults: SearchResultItem[];
    onToken?: (delta: string) => void;
    abortSignal?: AbortSignal;
  }): Promise<string> {
    const lines = input.searchResults
      .slice(0, 3)
      .map((item, index) => `${index + 1}. ${item.title}: ${item.bodyText.slice(0, 120)}`)
      .join("\n");

    const sources = input.searchResults
      .slice(0, 3)
      .map((item) => `- ${item.title} (${item.url})`)
      .join("\n");

    const text = [
      `${input.message.replace(/\?+$/g, "")}에 대해 먼저 간단히 말씀드리면, 관련 자료를 보면 핵심 방향이 드러납니다.`,
      lines,
      "",
      "출처:",
      sources
    ].join("\n");
    this.emitChunks(text, input.onToken);
    return text;
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
