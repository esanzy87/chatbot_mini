import { describe, expect, it } from "vitest";
import type { RouteDecision } from "@/domain/models";
import { applyConfidenceFallback, validateRouteDecision } from "@/domain/policies/routeDecision";
import {
  decideForceSourceMode,
  isRefusePrecheck,
  normalizeForSourceDecision
} from "@/domain/policies/sourceMode";
import {
  classifyToolFailure,
  nextConsecutiveToolFailureTurns,
  resolveToolFailureFallback
} from "@/domain/policies/toolFailure";
import { isValidSourceItem, normalizeSources } from "@/domain/policies/sources";
import { toReasonSummary } from "@/domain/policies/reasonSummaryDomain";
import { fallbackSearchQueryPlan, validateSearchQueryPlan } from "@/domain/policies/searchPlan";
import { fallbackSearchReflection, validateSearchReflection } from "@/domain/policies/searchReflection";

function baseDecision(overrides?: Partial<RouteDecision>): RouteDecision {
  return {
    nextAction: "DIRECT_ANSWER",
    allowedTools: [],
    confidence: 0.9,
    reason: "ok",
    ...overrides
  };
}

describe("domain/routeDecision", () => {
  it("validates CALL_TOOL requires allowed tools", () => {
    expect(() => validateRouteDecision(baseDecision({ nextAction: "CALL_TOOL", allowedTools: [] }))).toThrowError();
  });

  it("validates ASK_CLARIFY requires question", () => {
    expect(() =>
      validateRouteDecision(baseDecision({ nextAction: "ASK_CLARIFY", allowedTools: [], clarifyQuestion: "" }))
    ).toThrowError();
  });

  it("validates REFUSE requires reason", () => {
    expect(() => validateRouteDecision(baseDecision({ nextAction: "REFUSE", allowedTools: [], refuseReason: "" }))).toThrowError();
  });

  it("forces ASK_CLARIFY when confidence is below threshold", () => {
    const fallback = applyConfidenceFallback(baseDecision({ nextAction: "DIRECT_ANSWER", confidence: 0.54 }));
    expect(fallback.nextAction).toBe("DIRECT_ANSWER");
  });

  it("keeps route decision when confidence is enough", () => {
    const original = baseDecision({ confidence: 0.55 });
    const result = applyConfidenceFallback(original);
    expect(result).toEqual(original);
  });

  it("keeps low-confidence search tool call instead of degrading to clarify", () => {
    const result = applyConfidenceFallback(
      baseDecision({
        nextAction: "CALL_TOOL",
        allowedTools: ["search"],
        confidence: 0.2
      })
    );

    expect(result.nextAction).toBe("CALL_TOOL");
  });

  it("downgrades generic high-confidence ASK_CLARIFY to DIRECT_ANSWER", () => {
    const result = applyConfidenceFallback(
      baseDecision({
        nextAction: "ASK_CLARIFY",
        allowedTools: [],
        clarifyQuestion: "질문 의도를 더 구체적으로 알려주세요.",
        confidence: 0.8
      })
    );

    expect(result.nextAction).toBe("DIRECT_ANSWER");
  });
});

describe("domain/sourceMode", () => {
  it("normalizes with NFKC and lowercase", () => {
    expect(normalizeForSourceDecision("  ＡＢＣ  ")).toBe("abc");
  });

  it("returns NOT_FORCED when needsSources=false", () => {
    expect(decideForceSourceMode({ needsSources: false, message: "출처 알려줘" })).toBe("NOT_FORCED");
  });

  it("rank 1 refuse precheck wins", () => {
    expect(decideForceSourceMode({ needsSources: true, message: "숙제 대신 해줘 출처도" })).toBe("NOT_FORCED");
    expect(isRefusePrecheck("숙제 대신 해줘")).toBe(true);
  });

  it("rank 2 source keyword is forced", () => {
    expect(decideForceSourceMode({ needsSources: true, message: "출처 링크 포함해서" })).toBe("FORCED");
  });

  it("rank 3 transform keyword is not forced when no source keyword", () => {
    expect(decideForceSourceMode({ needsSources: true, message: "발표 대본으로 변환" })).toBe("NOT_FORCED");
  });

  it("rank 4 fact keyword is forced", () => {
    expect(decideForceSourceMode({ needsSources: true, message: "최신 통계 알려줘" })).toBe("FORCED");
  });
});

describe("domain/toolFailure", () => {
  it("classifies attributable timeout as recoverable", () => {
    expect(
      classifyToolFailure({ toolCallId: "tool_01HW8K6M2K4VQX3D4N0Y7AZ9HS", kind: "TIMEOUT", graphCanContinue: true })
    ).toBe("recoverable");
  });

  it("classifies node-level exception as unrecoverable", () => {
    expect(classifyToolFailure({ kind: "NODE_EXCEPTION", graphCanContinue: false })).toBe("unrecoverable");
  });

  it("updates consecutive failure turns with cap", () => {
    expect(nextConsecutiveToolFailureTurns(0, "TOOL_FAILURE_ASK_CLARIFY")).toBe(1);
    expect(nextConsecutiveToolFailureTurns(1, "TOOL_FAILURE_ASK_CLARIFY")).toBe(2);
    expect(nextConsecutiveToolFailureTurns(2, "TOOL_FAILURE_ASK_CLARIFY")).toBe(2);
    expect(nextConsecutiveToolFailureTurns(1, "SECOND_FALLBACK_DIRECT_ANSWER")).toBe(0);
  });

  it("resets on non-failure outcomes", () => {
    expect(nextConsecutiveToolFailureTurns(2, "TOOL_SUCCESS")).toBe(0);
  });

  it("keeps previous counter on unrecoverable/aborted", () => {
    expect(nextConsecutiveToolFailureTurns(2, "UNRECOVERABLE_ERROR")).toBe(2);
    expect(nextConsecutiveToolFailureTurns(1, "ABORTED")).toBe(1);
  });

  it("prioritizes ASK_CLARIFY for forced source requests without sources", () => {
    const action = resolveToolFailureFallback({
      needsSources: true,
      forceSourceMode: "FORCED",
      hasValidSources: false,
      consecutiveToolFailureTurns: 10
    });
    expect(action).toBe("ASK_CLARIFY");
  });

  it("returns DIRECT_ANSWER after second general failure", () => {
    const action = resolveToolFailureFallback({
      needsSources: false,
      forceSourceMode: "NOT_FORCED",
      hasValidSources: false,
      consecutiveToolFailureTurns: 1
    });
    expect(action).toBe("DIRECT_ANSWER");
  });
});

describe("domain/sources", () => {
  it("validates source item schema", () => {
    expect(
      isValidSourceItem({
        title: "문서",
        url: "https://example.com",
        source: "official-doc"
      })
    ).toBe(true);

    expect(
      isValidSourceItem({
        title: "",
        url: "https://example.com",
        source: "official-doc"
      })
    ).toBe(false);
  });

  it("drops invalid items, deduplicates and caps to 5", () => {
    const normalized = normalizeSources([
      { title: "A", url: "https://a.com", source: "src" },
      { title: "A dup", url: "https://a.com", source: "src" },
      { title: "B", url: "https://b.com", source: "src" },
      { title: "C", url: "https://c.com", source: "src" },
      { title: "D", url: "https://d.com", source: "src" },
      { title: "E", url: "https://e.com", source: "src" },
      { title: "F", url: "https://f.com", source: "src" },
      { title: "X", url: "ftp://x.com", source: "src" }
    ]);

    expect(normalized).toHaveLength(5);
    expect(normalized[0]?.url).toBe("https://a.com");
    expect(normalized.at(-1)?.url).toBe("https://e.com");
  });
});

describe("domain/reasonSummaryDomain", () => {
  it("keeps first three sentences before hard normalization", () => {
    const result = toReasonSummary("1문장. 2문장. 3문장. 4문장.");
    expect(result).toContain("1문장.");
    expect(result).toContain("2문장.");
    expect(result).toContain("3문장.");
    expect(result).not.toContain("4문장");
  });

  it("hard normalization still applies after sentence limiting", () => {
    const result = toReasonSummary("system prompt. developer message. internal reasoning.");
    expect(result).toContain("[REDACTED_REASON]");
  });
});

describe("domain/searchPlan", () => {
  it("validates and normalizes search query plan", () => {
    const result = validateSearchQueryPlan({
      searchIntent: " 최신 통계 확인 ",
      searchQueries: ["  Berkeley biology latest stats  ", "  biology berkeley official "],
      mustInclude: [" official "],
      mustExclude: [" blog "],
      answerShape: "latest",
      reason: " 검색어 재작성 "
    });

    expect(result.searchIntent).toBe("최신 통계 확인");
    expect(result.searchQueries[0]).toBe("Berkeley biology latest stats");
    expect(result.mustInclude).toEqual(["official"]);
    expect(result.mustExclude).toEqual(["blog"]);
  });

  it("rejects empty search query list", () => {
    expect(() =>
      validateSearchQueryPlan({
        searchIntent: "검색",
        searchQueries: [],
        mustInclude: [],
        mustExclude: [],
        answerShape: "definition",
        reason: "빈 쿼리"
      })
    ).toThrowError(/SEARCH_PLAN_QUERIES_INVALID/);
  });

  it("builds fallback search query plan", () => {
    const result = fallbackSearchQueryPlan("최신 통계 알려줘", "플래너 파싱 실패");
    expect(result.searchQueries).toEqual(["최신 통계 알려줘"]);
    expect(result.answerShape).toBe("definition");
  });
});

describe("domain/searchReflection", () => {
  it("validates refine_search reflection", () => {
    const result = validateSearchReflection({
      decision: "REFINE_SEARCH",
      followupQuery: "berkeley biology official statistics",
      clarifyQuestion: null,
      reason: "검색어를 좁혀 재검색"
    });

    expect(result.followupQuery).toBe("berkeley biology official statistics");
    expect(result.clarifyQuestion).toBeNull();
  });

  it("rejects missing followup query for refine_search", () => {
    expect(() =>
      validateSearchReflection({
        decision: "REFINE_SEARCH",
        followupQuery: null,
        clarifyQuestion: null,
        reason: "재검색"
      })
    ).toThrowError(/SEARCH_REFLECTION_FOLLOWUP_QUERY_INVALID/);
  });

  it("falls back to ANSWER when results exist", () => {
    const result = fallbackSearchReflection({
      hasResults: true,
      message: "질문",
      reason: "파싱 실패"
    });

    expect(result.decision).toBe("ANSWER");
  });
});
