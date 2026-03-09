import type { SearchReflection } from "@/domain/models";

export function validateSearchReflection(input: SearchReflection): SearchReflection {
  const reason = input.reason.trim();

  if (reason.length < 1 || reason.length > 200) {
    throw new Error("SEARCH_REFLECTION_REASON_INVALID");
  }

  if (input.decision === "ANSWER") {
    return {
      decision: "ANSWER",
      followupQuery: null,
      clarifyQuestion: null,
      reason
    };
  }

  if (input.decision === "REFINE_SEARCH") {
    const followupQuery = (input.followupQuery ?? "").trim();
    if (followupQuery.length < 2 || followupQuery.length > 300) {
      throw new Error("SEARCH_REFLECTION_FOLLOWUP_QUERY_INVALID");
    }

    return {
      decision: "REFINE_SEARCH",
      followupQuery,
      clarifyQuestion: null,
      reason
    };
  }

  const clarifyQuestion = (input.clarifyQuestion ?? "").trim();
  if (clarifyQuestion.length < 1 || clarifyQuestion.length > 300) {
    throw new Error("SEARCH_REFLECTION_CLARIFY_INVALID");
  }

  return {
    decision: "ASK_CLARIFY",
    followupQuery: null,
    clarifyQuestion,
    reason
  };
}

export function fallbackSearchReflection(params: {
  hasResults: boolean;
  message: string;
  reason: string;
}): SearchReflection {
  if (params.hasResults) {
    return {
      decision: "ANSWER",
      followupQuery: null,
      clarifyQuestion: null,
      reason: params.reason.trim() || "검색 결과를 바탕으로 답변"
    };
  }

  return {
    decision: "ASK_CLARIFY",
    followupQuery: null,
    clarifyQuestion: "찾고 싶은 대상이나 조건을 조금 더 구체적으로 알려주세요.",
    reason: params.reason.trim() || "검색 결과 부족"
  };
}
