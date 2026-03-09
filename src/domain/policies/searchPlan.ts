import type { SearchQueryPlan } from "@/domain/models";

const ANSWER_SHAPES = new Set<SearchQueryPlan["answerShape"]>([
  "definition",
  "comparison",
  "latest",
  "process",
  "recommendation"
]);

function normalizeStringArray(input: unknown, maxItems: number): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

export function validateSearchQueryPlan(input: SearchQueryPlan): SearchQueryPlan {
  const searchIntent = input.searchIntent.trim();
  const searchQueries = normalizeStringArray(input.searchQueries, 4);
  const mustInclude = normalizeStringArray(input.mustInclude, 8);
  const mustExclude = normalizeStringArray(input.mustExclude, 8);
  const reason = input.reason.trim();

  if (searchIntent.length < 1 || searchIntent.length > 200) {
    throw new Error("SEARCH_PLAN_INTENT_INVALID");
  }

  if (searchQueries.length < 1 || searchQueries.length > 4) {
    throw new Error("SEARCH_PLAN_QUERIES_INVALID");
  }

  if (searchQueries.some((query) => query.length < 2 || query.length > 300)) {
    throw new Error("SEARCH_PLAN_QUERY_LENGTH_INVALID");
  }

  if (!ANSWER_SHAPES.has(input.answerShape)) {
    throw new Error("SEARCH_PLAN_ANSWER_SHAPE_INVALID");
  }

  if (reason.length < 1 || reason.length > 200) {
    throw new Error("SEARCH_PLAN_REASON_INVALID");
  }

  return {
    searchIntent,
    searchQueries,
    mustInclude,
    mustExclude,
    answerShape: input.answerShape,
    reason
  };
}

export function fallbackSearchQueryPlan(message: string, reason: string): SearchQueryPlan {
  const trimmedMessage = message.trim();
  const trimmedReason = reason.trim();

  return {
    searchIntent: "기본 검색 fallback",
    searchQueries: [trimmedMessage.length > 0 ? trimmedMessage : "검색어"],
    mustInclude: [],
    mustExclude: [],
    answerShape: "definition",
    reason: trimmedReason.length > 0 ? trimmedReason : "검색 플랜 fallback"
  };
}
