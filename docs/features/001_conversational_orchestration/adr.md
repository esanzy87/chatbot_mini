# ADR (v0)

## ADR-001: 검색 경로에 Planner-Reflector 2단계를 도입한다

- 날짜: 2026-03-09
- 결정:
  - `CALL_TOOL(search)` 경로에 `prepareSearchPlan`과 `reflectSearchCoverage`를 추가한다.
  - planner는 검색어 재작성, reflector는 검색 결과 충분성 판정을 담당한다.
- 근거:
  - 현재 구조는 사용자 메시지를 거의 그대로 검색에 사용해 검색 품질이 낮다.
  - 검색 후 재판단 단계가 없어 결과가 부족해도 기계적으로 답변을 종료한다.
- 영향:
  - 검색 경로의 그래프 구조가 길어지지만, 검색 정확도와 자연스러움이 개선된다.
  - transform 경로는 기존처럼 단순 경로를 유지한다.
- 코드 근거:
  - `src/application/graph/chatGraph.ts`
  - `src/infrastructure/llm/prompts/chatbotPrompts.ts`

## ADR-002: `ASK_CLARIFY`는 마지막 수단에 가깝게 재정의한다

- 날짜: 2026-03-09
- 결정:
  - 정보 부족이 있어도 안전한 범위의 초안 답변 또는 search 시도가 가능한 경우 `ASK_CLARIFY`를 우선하지 않는다.
  - `ASK_CLARIFY`는 답변 품질 저하가 치명적이거나 대상이 불명확한 경우에만 사용한다.
- 근거:
  - 현재 챗봇은 웹앱형 대화감보다 분류기형 응답으로 느껴진다.
  - 사용자는 짧은 질문에서도 어느 정도의 초안 도움을 기대한다.
- 영향:
  - low-confidence fallback 정책 및 라우터 프롬프트 수정이 필요하다.
  - clarify 비율은 줄지만, 답변 내 가정 명시 규칙이 중요해진다.
- 코드 근거:
  - `src/domain/policies/routeDecision.ts`
  - `src/infrastructure/llm/prompts/chatbotPrompts.ts`

## ADR-003: Gemini 입력을 요약 문자열보다 대화 턴 구조에 가깝게 전달한다

- 날짜: 2026-03-09
- 결정:
  - Gemini live 어댑터는 최근 대화를 bullet 텍스트 요약으로만 넣지 않고, role 기반 `contents` 배열로 전달한다.
  - system instruction과 latest user message를 분리해 전달한다.
- 근거:
  - 현재 한 덩어리 문자열 전달 방식은 대화 연속성과 발화 리듬을 약화시킨다.
  - provider가 허용하는 대화 구조를 활용하는 편이 웹앱형 대화감에 유리하다.
- 영향:
  - prompt builder와 Gemini adapter 인터페이스 일부 조정이 필요하다.
  - 동일 내용이라도 응답 톤과 문맥 연결성이 개선될 가능성이 높다.
- 코드 근거:
  - `src/infrastructure/llm/geminiLlmAdapter.ts`
  - `src/infrastructure/llm/prompts/chatbotPrompts.ts`
