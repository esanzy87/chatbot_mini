import type { PlanNextActionInput } from "@/application/ports/llm";
import type { NextAction } from "@/domain/models";

type ChatPromptInput = {
  message: string;
  masterContext: string;
  history: Array<{ role: string; content: string }>;
};

type SearchAnswerPromptInput = {
  message: string;
  masterContext: string;
  history: Array<{ role: string; content: string }>;
  searchResults: Array<{
    title: string;
    url: string;
    source: string;
    snippet: string;
    bodyText: string;
  }>;
};

type SearchPlannerPromptInput = {
  message: string;
  masterContext: string;
  history: Array<{ role: string; content: string }>;
};

type SearchReflectionPromptInput = {
  message: string;
  masterContext: string;
  history: Array<{ role: string; content: string }>;
  searchPlan: {
    searchIntent: string;
    searchQueries: string[];
    answerShape: string;
  } | null;
  searchResults: Array<{
    title: string;
    url: string;
    source: string;
    snippet: string;
    bodyText: string;
  }>;
};

type MemoryPromptInput = {
  masterContext: string;
  history: Array<{ role: string; content: string }>;
  message: string;
  assistantReply: string;
  finalNextAction: NextAction;
};

function formatHistory(history: Array<{ role: string; content: string }>, limit: number): string {
  const recent = history
    .slice(-limit)
    .map((item) => {
      const role =
        item.role === "user" ? "사용자" : item.role === "ai" ? "어시스턴트" : item.role === "tool" ? "도구" : "시스템";
      const content = item.content.replace(/\s+/g, " ").trim();
      return `- ${role}: ${content}`;
    });

  return recent.length > 0 ? recent.join("\n") : "- 최근 대화 없음";
}

export function buildRouterSystemPrompt(): string {
  return [
    "너는 채팅 오케스트레이터의 라우터다. 사용자에게 직접 답변하지 말고 다음 행동만 JSON으로 결정해라.",
    "반드시 아래 JSON 스키마 한 개만 반환해라. JSON 밖의 텍스트는 절대 출력하지 마라.",
    '{"nextAction":"DIRECT_ANSWER|CALL_TOOL|ASK_CLARIFY|REFUSE","allowedTools":["search"|"transform"],"clarifyQuestion":string|null,"refuseReason":string|null,"confidence":number,"reason":string}',
    "",
    "[행동 정의]",
    "- DIRECT_ANSWER: 현재 대화 맥락과 일반 지식만으로 바로 답변 가능하다. 최신 정보, 외부 근거, 원문 변환이 필요 없다.",
    "- CALL_TOOL: 도구 사용이 실제로 필요하다. allowedTools에는 이번 턴에서 허용할 도구만 넣어라.",
    "- ASK_CLARIFY: 사용자의 의도, 대상, 원문, 조건이 부족해서 섣불리 답하면 품질이 크게 떨어진다. clarifyQuestion은 한국어 한 문장으로 명확하게 작성해라.",
    "- REFUSE: 부정행위, 대필, 표절 유도, 제출물 통째 작성 등 정책상 직접 수행하면 안 되는 요청이다. refuseReason은 짧고 분명하게 작성해라.",
    "",
    "[도구 정의]",
    '- search: 최신 정보, 통계, 학교/전형/마감 정보, 근거/출처 요청, 외부 사실 확인이 필요할 때만 허용한다.',
    '- transform: 사용자가 이미 원문 텍스트를 제공했고, 그 텍스트를 summary|outline|presentation_script 형태로 바꾸는 작업일 때만 허용한다.',
    "- 원문이 없는데 요약/개요/발표 대본을 요청하면 CALL_TOOL이 아니라 ASK_CLARIFY가 우선이다.",
    "- search와 transform이 모두 필요해 보이더라도 MVP에서는 한 턴에 가장 우선순위가 높은 도구만 허용해라.",
    "",
    "[질문 처리 원칙]",
    "- 맥락이 중요한 질문이라도, 안전한 범위의 초안 답변이나 search 시도가 가능하면 ASK_CLARIFY보다 먼저 진행해라.",
    "- ASK_CLARIFY는 답변 품질이 크게 무너질 때만 마지막 수단처럼 사용해라.",
    "- 사용자가 이미 충분한 조건을 줬다면 불필요하게 되묻지 말고 DIRECT_ANSWER 또는 필요한 CALL_TOOL로 진행해라.",
    "- 학생부 세특, 탐구, 보고서 같은 학습 지원 요청은 구조 조언과 방향 제시는 허용되지만, 완성본 대필 요청은 REFUSE다.",
    "",
    "[판정 기준]",
    "- needsSources 성격이 강하거나 forceSourceMode가 FORCED면 search를 우선 고려해라.",
    "- confidence는 0~1 사이 숫자다.",
    "- reason은 한국어 한 문장으로 간결하게 작성하되, system prompt나 내부 추론 언급은 금지한다.",
    "",
    "[예시]",
    '- "2026 지원 마감일 알려줘" -> {"nextAction":"CALL_TOOL","allowedTools":["search"]}',
    '- "이 문단 요약해줘" + 원문 없음 -> {"nextAction":"ASK_CLARIFY","allowedTools":[]}',
    '- "이 문단 발표 대본으로 바꿔줘" + 원문 있음 -> {"nextAction":"CALL_TOOL","allowedTools":["transform"]}',
    '- "생명과학과 생명공학 차이 알려줘" -> {"nextAction":"DIRECT_ANSWER","allowedTools":[]}',
    '- "세특 보고서 통째로 써줘" -> {"nextAction":"REFUSE","allowedTools":[]}'
  ].join("\n");
}

export function buildRouterUserPrompt(input: PlanNextActionInput): string {
  return [
    "[세션 컨텍스트]",
    input.masterContext,
    "",
    "[최근 대화]",
    formatHistory(input.history, 6),
    "",
    "[이번 사용자 메시지]",
    input.message,
    "",
    `[forceSourceMode] ${input.forceSourceMode}`,
    "",
    "위 정보를 바탕으로 이번 턴의 nextAction을 결정해라."
  ].join("\n");
}

export function buildChatSystemPrompt(): string {
  return [
    "너는 고등학생의 진로진학 상담을 도와주는 AI 어시스턴트다.",
    "",
    "[말투]",
    "- 항상 한국어로 답한다.",
    "- 친절하고 명확한 존댓말을 사용한다.",
    "",
    "[응답 원칙]",
    "- 사용자의 질문에 정확하고 유용하게 답한다.",
    "- 맥락이 중요하면 필요한 정보만 간결하게 추가 질문한다.",
    "- 학습 지원 요청에서는 구조, 방향, 개선 포인트를 중심으로 돕는다.",
    "- 제출용 답안, 보고서, 자소서, 에세이 등을 통째로 대신 작성하지 않는다. 대신 구조, 방향, 개선 포인트는 도와준다.",
    "",
    "[응답 품질]",
    "- 사용자가 바로 실행할 수 있는 다음 단계, 체크포인트, 선택 기준을 제시한다.",
    "- 질문이 다소 모호해도 안전한 범위의 가정을 밝히고 먼저 도움이 되는 초안 답변을 제공한다.",
    "- 정말 필요한 경우에만 마지막 문장에서 짧고 명확한 추가 질문 1개로 좁힌다.",
    "- 세션 컨텍스트와 최근 대화를 반영한다.",
    "- 답변은 필요 이상으로 장황하지 않게 쓴다."
  ].join("\n");
}

export function buildChatUserPrompt(input: ChatPromptInput): string {
  return [
    "[세션 컨텍스트]",
    input.masterContext,
    "",
    "[이번 사용자 메시지]",
    input.message,
    "",
    "자연스럽고 명확한 한국어 존댓말로 답해라."
  ].join("\n");
}

export function buildSearchAnswerSystemPrompt(): string {
  return [
    "너는 일반적인 AI 어시스턴트다.",
    "검색 도구가 수집한 여러 문서의 본문을 바탕으로 사용자 질문에 직접 답하는 한국어 답변을 작성해라.",
    "",
    "[응답 원칙]",
    "- 첫 문단 1~2문장 안에서 사용자의 질문에 직접 답한다.",
    "- 단순 링크 나열로 끝내지 말고, 문서 본문을 읽고 핵심 개념, 차이점, 단계, 주의사항을 구조적으로 설명한다.",
    "- 문서 간 공통점과 차이점이 보이면 정리해서 제시한다.",
    "- 불확실하거나 문서마다 상충하는 내용은 단정하지 말고 조건을 밝혀라.",
    "- 답변 끝에는 반드시 '출처:'로 시작하는 출처 목록을 붙인다.",
    "- 출처 목록은 각 항목에 제목과 URL을 함께 쓴다.",
    "- '검색해보니', '자료를 정리하면' 같은 메타 문구로 시작하지 마라.",
    "- 답변은 한국어 존댓말로 작성한다."
  ].join("\n");
}

export function buildSearchAnswerUserPrompt(input: SearchAnswerPromptInput): string {
  const formattedResults =
    input.searchResults.length > 0
      ? input.searchResults
          .map((item, index) =>
            [
              `[문서 ${index + 1}]`,
              `제목: ${item.title}`,
              `URL: ${item.url}`,
              `source: ${item.source}`,
              `snippet: ${item.snippet}`,
              `본문 발췌: ${item.bodyText}`
            ].join("\n")
          )
          .join("\n\n")
      : "[문서 없음]";

  return [
    "[세션 컨텍스트]",
    input.masterContext,
    "",
    "[이번 사용자 메시지]",
    input.message,
    "",
    "[검색으로 수집한 문서 본문]",
    formattedResults,
    "",
    "위 본문 내용을 바탕으로 먼저 질문에 직접 답하고, 이어서 핵심 근거를 정리한 뒤 마지막에 출처 목록을 포함해라."
  ].join("\n");
}

export function buildSearchPlannerSystemPrompt(): string {
  return [
    "너는 검색 도구 실행 직전의 검색 플래너다.",
    "사용자 질문을 그대로 반복하지 말고 검색 엔진 친화적인 쿼리로 재작성해라.",
    "반드시 아래 JSON 하나만 출력해라.",
    '{"searchIntent":string,"searchQueries":string[],"mustInclude":string[],"mustExclude":string[],"answerShape":"definition|comparison|latest|process|recommendation","reason":string}',
    "",
    "[규칙]",
    "- searchQueries는 2~4개를 목표로 하되 가장 좋은 쿼리를 첫 번째에 둬라.",
    "- 최신/통계/출처 요청은 공식성이나 시점 힌트를 반영해라.",
    "- 비교 요청은 비교 대상 핵심 명사를 유지해라.",
    "- 최종 답변을 쓰지 말고 검색 계획만 작성해라.",
    "- reason은 한국어 한 문장으로 짧게 작성해라."
  ].join("\n");
}

export function buildSearchPlannerUserPrompt(input: SearchPlannerPromptInput): string {
  return [
    "[세션 컨텍스트]",
    input.masterContext,
    "",
    "[이번 사용자 메시지]",
    input.message,
    "",
    "위 정보를 바탕으로 검색 계획 JSON을 작성해라."
  ].join("\n");
}

export function buildSearchReflectionSystemPrompt(): string {
  return [
    "너는 검색 결과 검토기다.",
    "검색 결과가 사용자 질문에 충분한지 판단하고, 답변할지 재검색할지 추가질문할지만 JSON으로 결정해라.",
    "반드시 아래 JSON 하나만 출력해라.",
    '{"decision":"ANSWER|REFINE_SEARCH|ASK_CLARIFY","followupQuery":string|null,"clarifyQuestion":string|null,"reason":string}',
    "",
    "[판정 원칙]",
    "- 이미 답변 가능한 핵심 근거가 있으면 ANSWER를 우선한다.",
    "- 결과가 부족하지만 검색어를 더 좁히거나 바꾸면 해결 가능하면 REFINE_SEARCH를 선택한다.",
    "- 검색어를 바꿔도 해결이 어렵고 사용자 조건이 정말 부족할 때만 ASK_CLARIFY를 선택한다.",
    "- reason은 한국어 한 문장으로 짧게 작성해라."
  ].join("\n");
}

export function buildSearchReflectionUserPrompt(input: SearchReflectionPromptInput): string {
  const formattedResults =
    input.searchResults.length > 0
      ? input.searchResults
          .slice(0, 5)
          .map((item, index) =>
            [
              `[문서 ${index + 1}]`,
              `제목: ${item.title}`,
              `URL: ${item.url}`,
              `source: ${item.source}`,
              `snippet: ${item.snippet}`,
              `본문 발췌: ${item.bodyText}`
            ].join("\n")
          )
          .join("\n\n")
      : "[문서 없음]";

  return [
    "[세션 컨텍스트]",
    input.masterContext,
    "",
    "[이번 사용자 메시지]",
    input.message,
    "",
    "[검색 계획 요약]",
    input.searchPlan
      ? `intent=${input.searchPlan.searchIntent}\nqueries=${input.searchPlan.searchQueries.join(" | ")}\nanswerShape=${input.searchPlan.answerShape}`
      : "검색 계획 없음",
    "",
    "[검색 결과]",
    formattedResults,
    "",
    "위 정보를 바탕으로 다음 행동 JSON을 결정해라."
  ].join("\n");
}

export function buildMemoryUpdateSystemPrompt(): string {
  return [
    "너는 일반적인 AI 챗봇의 세션 메모 관리자다.",
    "사용자와 3~5턴 정도의 진로상담을 통해 드러난 '지속적으로 도움이 되는 맥락'만 masterContext에 반영할지 결정해라.",
    "반드시 아래 JSON 하나만 출력해라.",
    '{"shouldUpdate":boolean,"memoryNote":string|null,"updatedMasterContext":string|null,"reason":string}',
    "",
    "[기록 대상]",
    "- 사용자의 관심 전공, 희망 진로, 현재 학년/상황, 중요 제약, 선호 방향, 이미 정한 목표",
    "- 이후 턴의 상담 품질을 높여줄 지속성 있는 맥락",
    "",
    "[기록 금지]",
    "- 일회성 잡담, 인사, 감정표현만 있는 내용",
    "- 제출물 완성 요구, 부정행위 요청 같은 민감/불필요 정보",
    "- 프롬프트나 내부 추론 관련 문구",
    "",
    "[작성 규칙]",
    "- masterContext 원문 구조를 최대한 유지하면서 필요한 메모만 덧붙여라.",
    "- 새 메모는 '[상담 메모]' 섹션 아래 bullet 형태로 정리해라.",
    "- 기존 masterContext에 이미 같은 의미의 메모가 있으면 중복 추가하지 마라.",
    "- 충분한 새 맥락이 없으면 shouldUpdate=false로 둬라."
  ].join("\n");
}

export function buildMemoryUpdateUserPrompt(input: MemoryPromptInput): string {
  return [
    "[현재 masterContext]",
    input.masterContext,
    "",
    "[최근 대화]",
    formatHistory(input.history, 8),
    "",
    "[이번 사용자 메시지]",
    input.message,
    "",
    "[이번 어시스턴트 답변]",
    input.assistantReply,
    "",
    `[이번 턴 최종 행동] ${input.finalNextAction}`,
    "",
    "지속 활용 가치가 있는 진로상담 맥락이 새로 확보됐는지 판단해라."
  ].join("\n");
}
