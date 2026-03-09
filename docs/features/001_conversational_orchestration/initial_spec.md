# 대화형 오케스트레이션 개선 초기 스펙 v0.1

## 1. 문서 목적

- `docs/features/001_conversational_orchestration/prd.md`를 바탕으로, 현재 MVP의 대화 어색함을 줄이기 위한 첫 구현 범위를 정의한다.
- 본 문서는 기존 `000_bootstrap` 위에 얹는 후속 기능 스펙이며, 기존 API/보안 계약을 가능한 한 유지한다.

## 2. 완료 정의 (Definition of Done)

### 2.1 Feature 전체 DoD

- 검색 경로에서 사용자 메시지를 그대로 검색하기보다 재작성된 검색 쿼리를 우선 사용한다.
- 검색 결과 수집 후, 결과 적합성을 재판단하는 단계가 추가된다.
- 모호한 질문에서 무조건 `ASK_CLARIFY`로 종료하지 않고, 가능한 경우 가정 기반 답변을 우선 제공한다.
- Gemini live 경로에서 대화 히스토리가 role 기반 multi-turn 형태로 전달된다.
- 검색 후 답변은 "직접 답변 -> 근거 정리 -> 출처" 구조를 따른다.
- 기존 allowlist, 스키마 검증, internal token, reasoning trace 정책은 깨지지 않는다.

### 2.2 Phase 1 DoD

- `CALL_TOOL(search)` 경로에서 planner가 생성한 `searchQueries[0]`을 우선 사용한다.
- planner 출력이 유효하지 않거나 비어 있으면 기존 `userMessage` 기반 검색으로 안전하게 fallback한다.
- search answer prompt는 첫 문단 직접 답변 규칙을 따른다.
- Phase 1에서는 reflection 노드, `ASK_CLARIFY` 정책 변경, role 기반 multi-turn 입력 개선을 포함하지 않는다.

## 3. 구현 범위

### 3.1 검색 계획 노드 추가

- `CALL_TOOL(search)` 직전 `prepareSearchPlan` 노드를 추가한다.
- 출력 스키마:
  - `searchIntent: string`
  - `searchQueries: string[]` (2~4개)
  - `mustInclude: string[]`
  - `mustExclude: string[]`
  - `answerShape: "definition" | "comparison" | "latest" | "process" | "recommendation"`
  - `reason: string`
- 서버는 위 결과를 검증한 뒤 첫 번째 쿼리 또는 정책 기반 선택 쿼리로 `search`를 실행한다.

### 3.1.1 planner 필드 사용 규칙

- Phase 1:
  - 실제 검색 실행에는 `searchQueries[0]`만 사용한다.
  - `searchQueries`는 2~4개를 허용하지만, 1개만 유효해도 fallback 정규화 후 사용 가능하다.
  - `mustInclude`, `mustExclude`, `answerShape`, `searchIntent`는 런타임 제어에 직접 사용하지 않고 디버깅/후속 확장용 의미 필드로 유지한다.
  - `reason`은 raw로 저장하지 않으며 필요 시 안전한 요약으로만 런타임 메모리에서 사용한다.
- Phase 2 이후:
  - `searchQueries[1...]`, `mustInclude`, `mustExclude`, `answerShape`를 reflection 및 재검색 전략과 연동할 수 있다.

### 3.1.2 planner fallback 규칙

- planner 출력 파싱 실패 시 기존 `userMessage` 기반 검색으로 fallback한다.
- planner가 빈 배열 또는 공백 query만 반환하면 기존 `userMessage` 기반 검색으로 fallback한다.
- fallback은 recoverable 경로로 취급하며 스트림을 실패시키지 않는다.

### 3.2 검색 결과 재판단 노드 추가

- 첫 검색 후 `reflectSearchCoverage` 노드를 추가한다.
- 출력 스키마:
  - `decision: "ANSWER" | "REFINE_SEARCH" | "ASK_CLARIFY"`
  - `followupQuery: string | null`
  - `clarifyQuestion: string | null`
  - `reason: string`
- `REFINE_SEARCH`일 경우 1회에 한해 좁혀진 2차 검색을 허용한다.
- 전체 도구 루프 한도는 기존 2회를 유지한다.

### 3.3 라우팅 정책 조정

- `confidence < 0.55`일 때 즉시 `ASK_CLARIFY`로 고정하는 정책을 완화한다.
- 아래 조건이면 low confidence여도 `DIRECT_ANSWER` 또는 `CALL_TOOL(search)`를 유지할 수 있다.
  - 일반 지식으로 안전한 초안 답변 가능
  - 검색으로 확인할 가치가 명확함
- `ASK_CLARIFY`는 답변 품질 저하가 치명적인 경우에 한정한다.

### 3.4 검색 후 답변 프롬프트 조정

- 기존 "교육적으로 정리된 문서형 답변" 중심 프롬프트를 아래 구조로 바꾼다.
  - 첫 1~2문장: 사용자 질문에 직접 답변
  - 본문: 핵심 근거 2~4개 정리
  - 선택: 차이점/주의사항/다음 단계
  - 마지막: `출처:`
- 응답 톤은 존댓말을 유지하되, 보고서 스타일보다 대화형 설명을 우선한다.

### 3.5 대화 히스토리 전달 방식 개선

- Gemini 어댑터는 system prompt와 user prompt를 단일 문자열로 합치지 않는다.
- 최근 히스토리를 provider가 허용하는 role 기반 `contents` 배열로 구성한다.
- history truncation 규칙은 유지하되, 텍스트 bullet 요약 대신 실제 turn 구조를 우선 사용한다.

## 4. 비범위

- 새 tool type 추가
- model-native tool calling 도입
- reasoning trace API 응답 스키마 대규모 변경
- transform path의 planner/reflection 도입

## 5. 그래프 변경안

기존:

`planNextAction -> callModelWithTools -> toolNode -> finalize`

변경 후:

`planNextAction -> prepareSearchPlan -> toolNode(search) -> reflectSearchCoverage -> [toolNode(search) | answerWithSearch | askClarify] -> finalize`

세부 규칙:

- `CALL_TOOL(transform)`은 기존 경로 유지
- `CALL_TOOL(search)`만 planner/reflector를 탄다
- 2차 검색은 최대 1회
- 반사 단계에서 `ASK_CLARIFY`가 나오더라도, 이미 충분한 일반 답변이 가능한 경우 `ANSWER`를 우선할 수 있다

## 6. 프롬프트 정책

### 6.1 Search Planner Prompt

- 목표는 "좋은 검색어 생성"이지 최종 답변 생성이 아니다.
- 사용자 표현을 그대로 반복하지 말고, 검색 엔진 친화적 표현으로 재작성한다.
- 비교/최신/학교/전형/통계 요청은 구체 고유명사와 시점을 명시한다.

### 6.2 Search Reflection Prompt

- 목표는 "현재 자료가 질문에 충분한가"를 판단하는 것이다.
- 부족하면 무조건 추가질문이 아니라, 먼저 검색 refinement 가능성을 검토한다.

### 6.3 Answer Prompt

- 메타 문구("검색해보니", "자료를 정리하면") 남용을 줄인다.
- 답변은 사용자의 질문에 자연스럽게 이어지는 형태를 우선한다.

## 7. Reasoning trace 정책

- raw planner/reflection 응답은 저장하지 않는다.
- 필요한 경우 아래 수준의 요약만 trace에 반영한다.
  - `searchPlanSummary`: "비교형 검색", "최신 정보 확인", "학교별 조건 재검색" 등 1문장
  - `searchReflectionSummary`: "자료 충분", "검색어 재정제", "질문 구체화 필요"
- 기존 200자 제한과 마스킹 규칙을 그대로 적용한다.
- Phase 1에서는 reasoning trace 스키마를 변경하지 않는다.
- planner/reflection 요약 노출은 Phase 3에서 별도 결정한다.

## 8. 테스트 원칙

- planner 스키마 검증 실패 시 fallback 경로를 검증한다.
- reflection이 `REFINE_SEARCH`를 반환할 때 2차 검색이 정확히 1회만 일어나는지 검증한다.
- `ASK_CLARIFY` 감소 정책이 기존 refusal/forced source 규칙을 깨지 않는지 회귀 테스트를 작성한다.
- 검색 후 답변 프롬프트 변경으로도 `sources`가 누락되지 않는지 검증한다.

### 8.1 측정/평가 기준

- Phase 1 평가는 고정 검색 질문 20개로 수행한다.
- 각 질문에 대해 아래를 기록한다.
  - planner 최종 query와 userMessage 동일 여부
  - 최종 응답 첫 문단 직접 답변 여부
  - `sources` 포함 여부
- 자연스러움 평가는 동일 20문장에 대해 1~5점 수동 평가표를 사용한다.

## 9. 구현 우선순위

### Phase 1 (우선 구현)

- search planner 스키마/프롬프트/LLM 포트 추가
- `CALL_TOOL(search)` 경로에서 검색어 재작성 적용
- search answer prompt를 "직접 답변 우선" 구조로 수정
- 관련 validator/unit test 및 graph regression test 추가

목표:

- 가장 적은 구조 변경으로 검색 경로의 체감 품질을 먼저 개선한다.
- transform 경로, SSE 계약, DB 스키마는 건드리지 않는다.
- search planner는 query rewrite 전용으로 제한하며, 재검색/reflection/trace 확장은 포함하지 않는다.

### Phase 2 (후속)

- search reflection 노드 추가
- 2차 검색 1회 허용
- `ASK_CLARIFY` fallback 정책 완화

목표:

- 검색 후 재판단을 통해 기계적인 종료를 줄인다.

### Phase 3 (후속)

- Gemini role 기반 multi-turn 입력 개선
- reasoning trace 최소 확장 여부 결정

목표:

- 전반적인 대화 연속성과 웹앱형 체감을 끌어올린다.

## 10. 구현 체크포인트

- Phase 1 완료 시:
  - raw userMessage passthrough 검색 비율 감소
  - search path 답변 첫 문단이 직접 답변인지 수동 확인
- Phase 2 완료 시:
  - 2차 검색이 최대 1회만 일어나는지 자동 테스트 확인
  - 검색 실패/부족 시 `ASK_CLARIFY` 남용 감소 확인
- Phase 3 완료 시:
  - live 모드에서 이전 턴 문맥 반영감이 개선되었는지 수동 검증

## 11. 확정 상태

- v0.1 초안
- feature 폴더 생성 및 문제 정의/설계 방향 문서화 완료
- 구현 우선순위와 단계별 목표 정의 완료
