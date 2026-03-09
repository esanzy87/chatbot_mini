# 대화형 오케스트레이션 개선 TODO v0

## 0. 실행 순서

### Phase 1. 검색 경로 1차 개선

- [x] `P1-001` planner 스키마/validator/프롬프트를 추가한다.
- [x] `P1-002` `LlmPort`와 Gemini/Stub 어댑터에 planner 메서드를 추가한다.
- [x] `P1-003` `CALL_TOOL(search)` 경로에서 planner 기반 query rewrite를 적용한다.
- [x] `P1-004` search answer prompt를 "직접 답변 우선" 구조로 수정한다.
- [x] `P1-005` planner validator, query rewrite, search answer regression 테스트를 추가한다.

완료 기준:

- 사용자 원문 그대로 검색하는 대신 planner가 생성한 검색어가 우선 적용된다.
- search 경로 최종 응답이 "답변 -> 근거 -> 출처" 구조를 따른다.

### Phase 2. 검색 후 재판단 도입

- [x] `P2-001` reflection 스키마/validator/프롬프트를 추가한다.
- [x] `P2-002` `LlmPort`와 Gemini/Stub 어댑터에 reflection 메서드를 추가한다.
- [x] `P2-003` `chatGraph`에 `reflectSearchCoverage` 노드를 추가한다.
- [x] `P2-004` reflection 결과가 `REFINE_SEARCH`일 때 2차 검색 1회를 허용한다.
- [x] `P2-005` reflection graph test와 "최대 1회 재검색" 회귀 테스트를 추가한다.

완료 기준:

- 검색 결과가 부족할 때 기계적으로 종료하지 않고 refinement를 시도할 수 있다.
- 재검색은 최대 1회로 제한된다.

### Phase 3. 라우팅/문맥 전달 개선

- [x] `P3-001` low-confidence fallback 정책을 완화한다.
- [x] `P3-002` `ASK_CLARIFY` 허용 조건을 더 엄격히 정의한다.
- [x] `P3-003` Gemini 어댑터에 role 기반 multi-turn 입력 구성을 도입한다.
- [x] `P3-004` 기존 reasoning trace 문자열에 planner/reflection 요약을 합성 반영한다.
- [x] `P3-005` refusal/forced source 정책 회귀 테스트와 기존 live/stub smoke 검증 기준을 반영한다.

완료 기준:

- 모호한 질문에서도 가능한 범위의 초안 답변 또는 검색 시도가 우선된다.
- live 모드에서 이전 턴 반영감이 개선된다.

## 1. 문서/운영

- [x] `DOC-001` `001_conversational_orchestration` PRD/스펙/ADR/TODO를 유지한다.
- [x] `DOC-002` 구현 중 정책 변경 시 `initial_spec.md`를 먼저 갱신한다.

## 2. 도메인/정책

- [x] `DOM-001` search planner 출력 스키마와 validator를 정의한다.
- [x] `DOM-002` search reflection 출력 스키마와 validator를 정의한다.
- [x] `DOM-003` low-confidence fallback 정책을 재설계한다.
- [x] `DOM-004` `ASK_CLARIFY` 허용 조건을 더 엄격히 정의한다.

## 3. 프롬프트

- [x] `PROMPT-001` search planner system/user prompt를 추가한다.
- [x] `PROMPT-002` search reflection system/user prompt를 추가한다.
- [x] `PROMPT-003` direct answer prompt를 웹앱형 대화감에 맞게 조정한다.
- [x] `PROMPT-004` search answer prompt를 "직접 답변 우선" 구조로 수정한다.

## 4. 애플리케이션/그래프

- [x] `APP-001` `LlmPort`에 search planner 메서드를 추가한다.
- [x] `APP-002` `LlmPort`에 search reflection 메서드를 추가한다.
- [x] `APP-003` `chatGraph`에 `prepareSearchPlan` 노드를 추가한다.
- [x] `APP-004` `chatGraph`에 `reflectSearchCoverage` 노드를 추가한다.
- [x] `APP-005` `CALL_TOOL(search)` 경로에서 planner 결과 기반 검색을 수행한다.
- [x] `APP-006` reflection 결과가 `REFINE_SEARCH`인 경우 2차 검색 1회를 허용한다.
- [x] `APP-007` transform 경로는 기존 동작을 유지하는 회귀 테스트를 추가한다.

## 5. 인프라/LLM

- [x] `INFRA-001` Gemini 어댑터에 role 기반 multi-turn 입력 구성을 도입한다.
- [x] `INFRA-002` planner/reflection 응답의 JSON 파싱 및 fallback을 구현한다.
- [x] `INFRA-003` stub LLM도 planner/reflection 경로를 지원하게 확장한다.

## 6. UI/프레젠테이션

- [x] `UI-001` 기존 SSE 계약으로 planner/reflection 추가 후에도 채팅 UI가 회귀하지 않는지 검증한다.
- [x] `UI-002` 기존 reasoning trace 패널에서 planner/reflection 반영 reasonSummary를 노출한다.

## 7. 테스트

- [x] `TEST-001` planner validator 단위 테스트를 작성한다.
- [x] `TEST-002` reflection validator 단위 테스트를 작성한다.
- [x] `TEST-003` search query rewrite가 userMessage raw passthrough보다 우선되는지 테스트한다.
- [x] `TEST-004` 2차 검색이 최대 1회인지 그래프 테스트를 작성한다.
- [x] `TEST-005` `ASK_CLARIFY` 감소 정책이 refusal/forced source 정책을 깨지 않는지 회귀 테스트를 작성한다.
- [x] `TEST-006` stub 경로와 Gemini adapter 기반 경로에서 `sources` 포함 규칙이 유지되는지 테스트한다.

주:

- `P3-005`의 live 검증은 001 기능 전용 회귀셋이 아니라 기존 `test/live/live-smoke.test.ts` 수준의 smoke 검증을 의미한다.
