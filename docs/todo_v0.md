# chatbot_mini 구현 TODO v0 (기준: `docs/initial_spec.md` v0.33)

## 0. 작업 운영 규칙
- [x] `OPS-001` 모든 기능 구현은 RED 테스트를 먼저 작성한 뒤 GREEN 구현으로 진행한다. | DoD: PR/커밋 단위로 실패 테스트가 선행되었음을 테스트 파일 히스토리로 확인 가능.
- [x] `OPS-002` 각 기능 완료 후 REFACTOR 단계에서 중복 제거와 포트/어댑터 경계를 재점검한다. | DoD: 리팩터 후 기존 테스트 전부 통과.
- [x] `OPS-003` 체크리스트 항목 상태 규칙(`todo -> doing -> done`)을 문서/이슈 트래킹 도구에 일관 적용한다. | DoD: 완료 항목마다 관련 커밋 또는 테스트 증빙 링크 존재.
- [x] `OPS-004` 구현 중 스펙 변경 필요사항은 즉시 `docs/initial_spec.md`에 반영 후 TODO 갱신한다. | DoD: 변경점마다 스펙 버전/변경 이력 동기화.

## 1. 프로젝트 부트스트랩
- [x] `BOOT-001` Next.js(App Router)+TypeScript 프로젝트 기본 구조를 준비한다. | DoD: `pnpm dev`로 기본 앱 실행 가능.
- [x] `BOOT-002` `pnpm` 기반 스크립트(`test`, `test:coverage`, `test:live`)를 `package.json`에 정의한다. | DoD: 각 스크립트 명령이 실행 엔트리를 찾는다.
- [x] `BOOT-003` 테스트 하네스 의존성(`vitest`, `@testing-library/react`, API 테스트 유틸)을 설치한다. | DoD: 빈 샘플 테스트 1개 통과.
- [x] `BOOT-004` 공통 코드 스타일/TS 설정(`strict`, path alias, noImplicitAny)을 확정한다. | DoD: `tsc --noEmit` 성공.
- [x] `BOOT-005` 클린 아키텍처 폴더 골격(`domain`, `application`, `infrastructure`, `presentation`)을 생성한다. | DoD: 각 계층 인덱스/README 또는 배럴 파일 존재.
- [x] `BOOT-006` 의존성 주입 조립 루트(composition root)를 만든다. | DoD: API 핸들러가 구체 구현 대신 포트 인터페이스를 주입받아 동작.

## 2. 환경변수/부트스트랩 검증
- [x] `ENV-001` 환경변수 스키마 로더를 구현한다(`APP_LLM_MODE`, `APP_SEARCH_MODE`, `INTERNAL_TOOL_TOKEN`, API keys). | DoD: 로더 단위 테스트 통과.
- [x] `ENV-002` `APP_LLM_MODE`, `APP_SEARCH_MODE` 값 허용 범위를 `stub|live`로 제한한다. | DoD: 허용 외 값 입력 시 앱 시작 실패.
- [x] `ENV-003` 모드 기본값은 미설정(undefined)일 때만 `stub` 적용한다. | DoD: 빈 문자열 입력은 실패, 미설정만 기본값 처리.
- [x] `ENV-004` `APP_LLM_MODE=live`일 때 `GEMINI_API_KEY` 필수 검증을 추가한다. | DoD: 키 누락 시 fail-fast.
- [x] `ENV-005` `APP_SEARCH_MODE=live`일 때 `TAVILY_API_KEY` 필수 검증을 추가한다. | DoD: 키 누락 시 fail-fast.
- [x] `ENV-006` `NODE_ENV=test`에서만 `INTERNAL_TOOL_TOKEN=test-internal-token` 기본값 허용한다. | DoD: dev/prod에서 토큰 누락 시 fail-fast.
- [x] `ENV-007` 환경설정 로딩 실패 시 명확한 에러 코드/메시지 로그를 남긴다. | DoD: 실패 케이스에서 원인 파악 가능한 로그 확인.

## 3. 공통 규약/유틸 구현
- [x] `CORE-001` ID 생성기(`sess_`, `turn_`, `tool_`, `req_`)를 대문자 ULID 기반으로 구현한다. | DoD: 정규식 테스트 통과.
- [x] `CORE-002` ID 검증 유틸을 구현하고 자동 대소문자 정규화 금지 정책을 강제한다. | DoD: 소문자/혼합 입력이 `VALIDATION_ERROR`로 분기.
- [x] `CORE-003` UTC ISO 8601(`YYYY-MM-DDTHH:mm:ss.SSSZ`) 시간 생성 유틸을 구현한다. | DoD: 저장/응답 전 영역에서 동일 포맷 사용.
- [x] `CORE-004` Unicode code point 길이 계산 유틸을 구현한다. | DoD: 한글/이모지 길이 경계 테스트 통과.
- [x] `CORE-005` 입력 문자열 공통 검증(`trim`, 빈값, min/max)을 구현한다. | DoD: 공백-only 입력이 422 처리.
- [x] `CORE-006` `requestId` 생성/전파 유틸(헤더 주입 포함)을 구현한다. | DoD: 모든 HTTP 응답 헤더 `x-request-id` 포함.
- [x] `CORE-007` 공통 JSON 에러 응답 빌더(`error.code/message/requestId/details`)를 구현한다. | DoD: 엔드포인트 공통 포맷 일관성 테스트 통과.
- [x] `CORE-008` API 에러 코드 enum + HTTP 매핑 테이블을 구현한다. | DoD: 코드별 상태코드 매핑 테스트 통과.
- [x] `CORE-009` 로그용 PII 마스킹 유틸(이메일/전화번호)을 구현한다. | DoD: 치환 + idempotent 테스트 통과.
- [x] `CORE-010` `reasonSummary` 정규화 파이프라인(치환->줄바꿈정규화->trim->200자절단->빈값대체) 구현. | DoD: 순서/치환 패턴 테스트 통과.
- [x] `CORE-011` `error.details` 정책(`VALIDATION_ERROR.fields`, `INVALID_CURSOR.cursor<=120`)을 구현한다. | DoD: 코드별 details 포함/생략 규칙 테스트 통과.
- [x] `CORE-012` 클라이언트 제공 `x-request-id`를 무시하고 서버 생성값으로 덮어쓰는 정책을 구현한다. | DoD: 임의 헤더 입력에도 응답/로그에 서버 생성값만 사용.

## 4. 도메인 모델/정책 구현
- [x] `DOM-001` `NextAction`/`RouteDecision`/`ConversationState`/`ReasoningTrace` 타입을 정의한다. | DoD: 타입 빌드 통과.
- [x] `DOM-002` `RouteDecision` 유효성 규칙(`CALL_TOOL`/`ASK_CLARIFY`/`REFUSE`) validator를 구현한다. | DoD: 케이스별 허용/거부 테스트 통과.
- [x] `DOM-003` `confidence < 0.55 => ASK_CLARIFY` 후처리 정책을 구현한다. | DoD: 경계값(0.54/0.55) 테스트 통과.
- [x] `DOM-004` `needsSources` 기본값/강제대상 판정 엔트리 정책을 구현한다. | DoD: `needsSources=false` 시 `NOT_FORCED` 고정.
- [x] `DOM-005` 강제대상 판정 알고리즘(1~5순위)을 구현한다. | DoD: 순위 충돌 입력에서 우선순위대로 판정.
- [x] `DOM-006` `REFUSE` 사전 판정 키워드 정책을 구현한다. | DoD: 키워드 매칭 양/음성 테스트 통과.
- [x] `DOM-007` 도구 실패 분류(recoverable/unrecoverable) 정책을 구현한다. | DoD: `toolCallId` 귀속 가능/불가 케이스 분리 테스트 통과.
- [x] `DOM-008` 연속 도구 실패 카운터 갱신 정책(`min(prev+1,2)`, reset 조건)을 구현한다. | DoD: 1턴차/2턴차/성공/reset/abort 시나리오 테스트 통과.
- [x] `DOM-009` `sources` 정규화(유효성 검증, 중복 제거, 최대 5개)를 구현한다. | DoD: invalid 제거+중복 제거+5개 제한 테스트 통과.
- [x] `DOM-010` 강제대상에서 출처 미확보 시 `ASK_CLARIFY` 우선 정책을 구현한다. | DoD: 일반 fallback(`DIRECT_ANSWER`)보다 우선 적용 테스트 통과.
- [x] `DOM-011` 사고 과정 요약 문장 수 제한(최대 3문장) + `6.10` 우선 규칙을 구현한다. | DoD: 4문장 입력에서 규칙 충돌 시 `6.10` 우선 테스트 통과.

## 5. 애플리케이션 포트/유스케이스 정의
- [x] `APP-001` 포트 인터페이스(`LlmPort`, `SearchPort`, `SessionRepository`, `MessageRepository`, `TraceRepository`)를 정의한다. | DoD: application 레이어가 인프라 import 없이 컴파일.
- [x] `APP-002` `CreateSession` 유스케이스를 정의한다. | DoD: master context 검증/요약/트랜잭션 요구사항을 테스트로 명시.
- [x] `APP-003` `HandleChatTurn` 유스케이스를 정의한다. | DoD: 상태 로드->라우팅->툴->최종화 흐름 테스트 더블로 구동.
- [x] `APP-004` `RunTool` 유스케이스를 정의한다. | DoD: allowlist/입력검증/timeout/결과정규화 로직 단위 테스트 통과.
- [x] `APP-005` `GetReasoningTrace` 유스케이스를 정의한다. | DoD: cursor 기반 페이지네이션 단위 테스트 통과.
- [x] `APP-006` request-scoped context(`requestId`, `sessionId`, `turnId`, debug flag) 객체를 정의한다. | DoD: 각 레이어에서 동일 값 추적 가능.

## 6. SQLite 인프라 구축
- [x] `DB-001` SQLite 연결 모듈을 만들고 `PRAGMA foreign_keys=ON`을 설정한다. | DoD: FK 위반 테스트에서 삽입 실패.
- [x] `DB-002` `sessions` 테이블 DDL을 구현한다. | DoD: 제약(`consecutive_tool_failure_turns>=0`, 기본값 0) 검증 통과.
- [x] `DB-003` `master_contexts` 테이블 DDL을 구현한다. | DoD: `session_id` PK+FK, `content/summary NOT NULL` 확인.
- [x] `DB-004` `messages` 테이블 DDL을 구현한다. | DoD: `role` 체크 제약 및 `metadata default '{}'` 확인.
- [x] `DB-005` `tool_executions` 테이블 DDL을 구현한다. | DoD: `tool_call_id unique`, `ok`, `latency_ms>=0` 체크 확인.
- [x] `DB-006` `decision_traces` 테이블 DDL을 구현한다. | DoD: `turn_id unique` 제약 확인.
- [x] `DB-007` 필수 인덱스를 생성한다(`messages`, `tool_executions`, `decision_traces`). | DoD: 스키마 조회 시 인덱스 존재.
- [x] `DB-008` 모든 시간 컬럼을 UTC ISO 텍스트로 저장하도록 저장 어댑터를 구현한다. | DoD: 샘플 저장값 포맷 검증 통과.
- [x] `DB-009` 세션 생성 트랜잭션(`sessions+master_contexts`) 원자성을 구현한다. | DoD: 중간 실패 시 부분 데이터 미생성.
- [x] `DB-010` 턴 종료 트랜잭션(`messages/tool_executions/decision_traces/sessions`) 원자성을 구현한다. | DoD: 중간 실패 시 5개 write-set 전체 롤백.
- [x] `DB-011` 같은 세션 갱신 직렬화를 위해 `BEGIN IMMEDIATE` 트랜잭션 정책을 구현한다. | DoD: 동시 쓰기 테스트에서 직렬화 동작.

## 7. Repository 어댑터 구현
- [x] `REPO-001` `SessionRepository.create/get/updateFailureCounter` 구현. | DoD: CRUD/카운터 갱신 단위 테스트 통과.
- [x] `REPO-002` `MessageRepository.appendTurnMessages` 구현(`role=user/ai`만 MVP 저장). | DoD: `done.ok`별 cardinality 저장 규칙 테스트 통과.
- [x] `REPO-003` `ToolExecutionRepository.appendToolExecutions` 구현. | DoD: `start` 발생 call만 1행 저장 검증 통과.
- [x] `REPO-004` `TraceRepository.appendDecisionTrace/listByCursor` 구현. | DoD: 정렬/커서/limit+1 규칙 테스트 통과.
- [x] `REPO-005` JSON 직렬화 실패 감지 및 에러 전파를 구현한다. | DoD: 직렬화 예외 시 저장 중단 + 상위 에러 처리.
- [x] `REPO-006` `updated_at` 자동 갱신을 저장 계층에서 강제한다. | DoD: 세션 갱신 후 `updated_at` 증가 확인.

## 8. LLM/Search/Transform 어댑터 구현
- [x] `ADP-001` `StubLlmAdapter`를 구현하고 4개 액션 경로를 결정적으로 재현한다. | DoD: 입력 fixture별 고정 `RouteDecision` 반환 테스트 통과.
- [x] `ADP-002` `GeminiLlmAdapter`를 구현해 구조화된 `RouteDecision` 출력을 받는다. | DoD: 스키마 파싱 성공/실패 처리 테스트 통과.
- [x] `ADP-003` 라우터 출력 파싱 실패 시 `ASK_CLARIFY` 기본값 fallback을 구현한다. | DoD: malformed JSON 입력 테스트 통과.
- [x] `ADP-004` `StubSearchAdapter`를 구현한다. | DoD: deterministic 검색 결과 fixture 반환.
- [x] `ADP-005` `TavilySearchAdapter`를 구현한다. | DoD: live 모드에서 Tavily API 호출 mock 통합 테스트 통과.
- [x] `ADP-006` `TransformAdapter` 최소 구현(규칙 기반 템플릿) 작성. | DoD: `summary|outline|presentation_script` 3포맷 테스트 통과.
- [x] `ADP-007` 어댑터 선택 팩토리(`APP_LLM_MODE`, `APP_SEARCH_MODE`)를 구현한다. | DoD: stub/live 분기 테스트 통과.
- [x] `ADP-008` 도구 timeout 래퍼(8초)를 구현한다. | DoD: timeout 시 `TOOL_TIMEOUT`으로 변환.
- [x] `ADP-009` recoverable 외부 오류(5xx/네트워크/스키마) 표준 에러 객체 매핑을 구현한다. | DoD: 오류 유형별 매핑 단위 테스트 통과.

## 9. 세션 API 구현
- [x] `API-SES-001` `POST /api/sessions` 라우트 핸들러를 생성한다. | DoD: 라우트 호출 시 세션 생성 응답 반환.
- [x] `API-SES-002` `masterContext` 길이 제약(20~4000, trim+code point) 검증을 구현한다. | DoD: 경계값 테스트 통과.
- [x] `API-SES-003` `masterContextSummary` 생성 실패 fallback(120자 절단)을 구현한다. | DoD: fallback 문자열 규칙 테스트 통과.
- [x] `API-SES-004` 생성 API 트랜잭션 실패 시 `500 INTERNAL_SERVER_ERROR` 공통 포맷 반환 구현. | DoD: 실패 주입 테스트 통과.
- [x] `API-SES-005` `GET /api/sessions/{sessionId}` 라우트 핸들러를 구현한다. | DoD: 기존 세션 조회 응답 반환.
- [x] `API-SES-006` `sessionId` 형식 검증(`sess_` + ULID 대문자) 구현. | DoD: 형식 위반 `422 VALIDATION_ERROR`.
- [x] `API-SES-007` 없는 세션 조회 시 `404 SESSION_NOT_FOUND` 구현. | DoD: 존재하지 않는 ID 테스트 통과.
- [x] `API-SES-008` 두 API 모두 응답 헤더 `x-request-id` 주입. | DoD: 성공/오류 응답 헤더 일관 확인.

## 10. 내부 도구 API 구현
- [x] `API-TOOL-001` `POST /api/tools/search` 라우트를 구현한다. | DoD: 유효 요청에서 검색 결과 JSON 반환.
- [x] `API-TOOL-002` `POST /api/tools/transform` 라우트를 구현한다. | DoD: 유효 요청에서 변환 결과 JSON 반환.
- [x] `API-TOOL-003` `x-internal-tool-token` 인증 미들웨어를 구현한다. | DoD: 누락/불일치 시 `401 UNAUTHORIZED_INTERNAL_ACCESS`.
- [x] `API-TOOL-004` 인증 검사 후 body 검증 수행 순서를 강제한다. | DoD: 토큰 누락+body오류 동시 입력 시 401 우선.
- [x] `API-TOOL-005` `sessionId` 존재 검증을 구현한다. | DoD: 형식 유효하지만 미존재 시 404.
- [x] `API-TOOL-006` 검색 DTO 검증(`query` 2~300, `topK` 1~10, default 5) 구현. | DoD: 경계값 테스트 통과.
- [x] `API-TOOL-007` 변환 DTO 검증(`text` 1~5000, `targetFormat` enum) 구현. | DoD: 경계값 테스트 통과.
- [x] `API-TOOL-008` DTO->도메인 인자 매핑 시 `sessionId` 제거 규칙을 구현한다. | DoD: 도메인 호출 인자에 `sessionId` 미포함 테스트 통과.
- [x] `API-TOOL-009` `/api/tools/*` timeout 오류의 HTTP 매핑(`504 TOOL_TIMEOUT`)을 구현한다. | DoD: timeout 테스트 통과.

## 11. `/api/chat` pre-stream 검증/게이트 구현
- [x] `API-CHAT-001` `POST /api/chat` 라우트 핸들러와 SSE 응답 초기화를 구현한다. | DoD: `text/event-stream` 헤더로 핸드셰이크 성공.
- [x] `API-CHAT-002` JSON 파싱 실패 시 pre-stream `400 JSON_PARSE_ERROR` 구현. | DoD: malformed JSON 테스트 통과.
- [x] `API-CHAT-003` `sessionId` 필수/형식/존재 검증 pre-stream 처리 구현. | DoD: 누락422/형식422/미존재404 테스트 통과.
- [x] `API-CHAT-004` `message` 길이 검증(1~2000, trim+code point) 구현. | DoD: 경계값 테스트 통과.
- [x] `API-CHAT-005` `clientOptions` 기본값(`needsSources=false`, `debug=false`) 적용 구현. | DoD: 옵션 생략 시 기본 동작 확인.
- [x] `API-CHAT-006` 동일 세션 in-flight 중복 요청 차단(`SESSION_BUSY`) 구현. | DoD: 동시 요청 시 후행 409 반환.
- [x] `API-CHAT-007` `SESSION_BUSY` in-flight 해제 시점(done/abort/예외) 구현. | DoD: 종료 경로별 lock 해제 테스트 통과.
- [x] `API-CHAT-008` `SESSION_BUSY` 보장 범위를 단일 프로세스 메모리 범위로 고정하고 주석/문서화한다. | DoD: 멀티 인스턴스 비보장 사실이 코드 주석/문서에 명시.

## 12. LangGraph 오케스트레이션 구현
- [x] `GRAPH-001` 그래프 상태 객체 초기화(`sessionId`, `messages`, `masterContext`, 카운터 등) 구현. | DoD: 초기 상태 스냅샷 테스트 통과.
- [x] `GRAPH-002` `loadSessionContext` 노드 구현. | DoD: DB에서 masterContext/history/counter 로드.
- [x] `GRAPH-003` `forceSourceMode` 선계산 노드(또는 단계) 구현. | DoD: `needsSources=false`에서 항상 `NOT_FORCED`.
- [x] `GRAPH-004` `planNextAction` 노드 구현(입력에 `forceSourceMode` 포함). | DoD: 라우팅 결정 결과가 상태에 저장.
- [x] `GRAPH-005` `directAnswer` 노드 구현. | DoD: 도구 호출 없이 최종 메시지 생성.
- [x] `GRAPH-006` `askClarify` 노드 구현. | DoD: `clarifyQuestion` 기반 메시지 반환.
- [x] `GRAPH-007` `refuse` 노드 구현(학습코치형 톤). | DoD: 거절+대안 메시지 포맷 테스트 통과.
- [x] `GRAPH-008` `callModelWithTools` 노드 구현. | DoD: tool call 포함 모델 응답 처리.
- [x] `GRAPH-009` `toolNode` 구현(allowlist 재검증 + zod 검증 + timeout). | DoD: 비허용 도구 호출 차단 테스트 통과.
- [x] `GRAPH-010` 도구 루프 최대 2회 정책 구현. | DoD: 3회째 진입 방지 테스트 통과.
- [x] `GRAPH-011` recoverable 실패 시 동일 턴 재시도/대체응답 진행 구현. | DoD: timeout 등 recoverable에서 그래프 계속 진행.
- [x] `GRAPH-012` unrecoverable 실패 시 즉시 종료 경로(`event:error` 예정) 구현. | DoD: 노드 레벨 예외에서 종료 분기 테스트 통과.
- [x] `GRAPH-013` `finalize` 노드에서 턴 저장 트랜잭션 호출 구현. | DoD: 종료 상태별 저장 매트릭스 반영.
- [x] `GRAPH-014` `consecutiveToolFailureTurns` 갱신/복원 로직 연계 구현. | DoD: 세션 재진입 후 카운터 일관성 테스트 통과.

## 13. SSE 이벤트 송출 엔진 구현
- [x] `SSE-001` SSE writer 유틸(`token`, `tool`, `message`, `error`, `done`)을 구현한다. | DoD: 이벤트 타입별 포맷 일관성 확인.
- [x] `SSE-002` 이벤트 payload strict schema validator(송신 전)를 구현한다. | DoD: 정의 외 top-level 필드 차단 테스트 통과.
- [x] `SSE-003` `event: token` 누적 송출 구현. | DoD: 0..N회 송출 가능.
- [x] `SSE-004` `event: tool` lifecycle(`start -> success|error`) 송출 구현. | DoD: 정상 연결에서 call별 2회 정확성 테스트 통과.
- [x] `SSE-005` `debug=true` 시 `tool.args` 송출, `debug=false` 시 생략 가능 규칙 구현. | DoD: debug on/off 비교 테스트 통과.
- [x] `SSE-006` `event: message` payload(`turnId,text,nextAction,sources?,debug?`) 생성 구현. | DoD: 필수필드 누락 없음.
- [x] `SSE-007` `debug=true` 시 `message.debug.requestId` 필수 및 헤더 일치 규칙 구현. | DoD: 헤더/페이로드 동일성 테스트 통과.
- [x] `SSE-008` `event:error` 송출 코드를 3종(`MODEL_PROVIDER_ERROR|INTERNAL_SERVER_ERROR|TOOL_EXECUTION_ERROR`)으로 제한한다. | DoD: 비허용 코드 송출 차단 테스트 통과.
- [x] `SSE-009` `event:done` payload 계산(`latencyMs=max(0,floor(t_done-t0))`) 구현. | DoD: fake timer 기반 계산 테스트 통과.
- [x] `SSE-010` `done.ok=true` 시 `errorCode` 금지, `ok=false` 시 필수 규칙 구현. | DoD: 케이스별 스키마 테스트 통과.
- [x] `SSE-011` 이벤트 cardinality 규칙(정상연결 기준 message 1회, done 1회 등) 강제 구현. | DoD: 경로별 cardinality 테스트 통과.
- [x] `SSE-012` `done`은 항상 마지막 이벤트가 되도록 송출 순서 제어 구현. | DoD: 이벤트 시퀀스 테스트 통과.
- [x] `SSE-013` commit 성공 후에만 `event:message` 송출(7.3.5) 구현. | DoD: commit 실패 시 message 미송출 테스트 통과.
- [x] `SSE-014` 클라이언트 abort 감지 시 추가 `tool/message` 이벤트 금지 구현. | DoD: abort 후 금지 이벤트 미발생 테스트 통과.
- [x] `SSE-015` `tool.phase=start`에서 `debug=true`면 `args` 필수, `debug=false`면 선택 규칙을 구현한다. | DoD: debug 플래그별 payload 스키마 테스트 통과.
- [x] `SSE-016` 정상 연결 케이스에서 `start`된 모든 `toolCallId`가 `success|error`로 닫힌 뒤 `done` 송출되도록 보장한다. | DoD: 툴 종료 이벤트 누락 없는지 통합 테스트 통과.

## 14. 출처 강제/정규화 및 fallback 구현
- [x] `SRC-001` `needsSources=true` 강제 대상에서 `CALL_TOOL(search)` 우선 시도 로직 구현. | DoD: 강제 대상 fixture에서 search 경로 진입.
- [x] `SRC-002` `needsSources=true` 비강제 대상(`transform/REFUSE/창작`) 예외 처리 구현. | DoD: 비강제 대상에서 search 강제 미적용.
- [x] `SRC-003` 강제 대상 최종 `message.sources` 필수 규칙 구현. | DoD: 유효 sources 없으면 message 대신 ASK_CLARIFY.
- [x] `SRC-004` 출처 유효성 검증(`title/url/source`) 구현. | DoD: invalid 항목 drop 테스트 통과.
- [x] `SRC-005` 출처 중복 URL 제거 구현. | DoD: 중복 URL 1건만 유지.
- [x] `SRC-006` 출처 최대 5개 절단 규칙(입력 순서 기준) 구현. | DoD: 6개 이상 입력 시 상위 5개 유지.
- [x] `SRC-007` 강제 대상에서 정규화 후 0건이면 `ASK_CLARIFY` 종료 구현. | DoD: 0건 케이스에서 DIRECT_ANSWER 금지.
- [x] `SRC-008` 비강제 대상에서 정규화 후 0건이면 `sources` 필드 생략 구현. | DoD: optional sources 규칙 테스트 통과.
- [x] `SRC-009` 강제 대상 실패가 연속 2턴 이상이어도 `DIRECT_ANSWER` fallback 금지 규칙 구현. | DoD: 우선순위 충돌 테스트 통과.

## 15. 턴 저장/원자성/순서 구현
- [x] `TX-001` `done.ok=true` 경로 write 매트릭스 저장 구현(`user=1, ai=1, trace=1`). | DoD: DB row count 검증 테스트 통과.
- [x] `TX-002` `done.ok=false` 경로 write 매트릭스 저장 구현(`user=1, ai=0, trace=0`). | DoD: DB row count 검증 테스트 통과.
- [x] `TX-003` abort/rollback 경로 write 매트릭스 구현(`messages/tool_executions/decision_traces=0`). | DoD: abort/rollback 시 미저장 확인.
- [x] `TX-004` `tool_executions`는 `event:tool(start)` 발생 call만 저장 구현. | DoD: 미시작 call 미저장 테스트 통과.
- [x] `TX-005` `tool_executions.ok=false` 저장 시 `result={errorCode,message}` 규칙 구현. | DoD: 실패 row JSON 스키마 테스트 통과.
- [x] `TX-006` timeout/미측정 실패 `latency_ms` 저장 규칙 구현. | DoD: timeout>=0, 미측정=0 확인.
- [x] `TX-007` 저장 직렬화 실패 전파(pre-stream 500 / in-stream error+done) 구현. | DoD: 두 경로 모두 기대 에러 시퀀스 통과.
- [x] `TX-008` `event:message` 이전 commit 완료 보장 구현. | DoD: 인위적 commit 지연 시 순서 위반 없음.

## 16. Reasoning Trace API 구현
- [x] `TRACE-001` `GET /api/sessions/{sessionId}/reasoning-traces` 라우트를 구현한다. | DoD: 기본 조회 응답 반환.
- [x] `TRACE-002` `limit` 검증(기본20, 1~100) 구현. | DoD: 0/1/100/101 경계 테스트 통과.
- [x] `TRACE-003` cursor 인코딩/디코딩(`base64url`, no padding, JSON `{v,createdAt,turnId}`) 구현. | DoD: encode/decode 왕복 테스트 통과.
- [x] `TRACE-004` cursor 유효성 검증(`v=1`, ISO, turnId regex) 구현. | DoD: invalid cursor에서 400 `INVALID_CURSOR`.
- [x] `TRACE-005` `createdAt DESC, turnId DESC` 조회 조건 구현. | DoD: tie-break 정렬 테스트 통과.
- [x] `TRACE-006` 내부 `limit+1` 조회 후 `nextCursor` 생성 규칙 구현. | DoD: 마지막 페이지 null/중간 페이지 cursor 생성 테스트 통과.
- [x] `TRACE-007` `items[].toolExecutions` 정렬(`created_at ASC, tool_call_id ASC`) 구현. | DoD: 배열 정렬 검증 테스트 통과.
- [x] `TRACE-008` 결과 0건 시 `{nextCursor:null,items:[]}` 반환 규칙 구현. | DoD: 빈 데이터셋 테스트 통과.
- [x] `TRACE-009` cursor 문자셋(base64url only, `=` padding 금지) 검증을 구현한다. | DoD: padding/non-base64url 입력이 `INVALID_CURSOR`.

## 17. UI 구현(`/chat/[sessionId]`)
- [x] `UI-001` `/chat/[sessionId]` 페이지 기본 레이아웃(상단/본문/우측패널/입력영역) 구현. | DoD: 데스크톱/모바일에서 화면 깨짐 없음.
- [x] `UI-002` 모든 UI 레이블/시스템 메시지를 한국어 고정으로 작성한다. | DoD: 영어 라벨 잔존 없음.
- [x] `UI-003` 초기 진입 시 `GET /api/sessions/{sessionId}`로 세션 컨텍스트 복구를 구현한다. | DoD: 새로고침 후 컨텍스트 표시 유지.
- [x] `UI-004` 상단 `학습 맥락` 요약 토글 UI를 구현한다. | DoD: 토글 동작 + 요약 표시 확인.
- [x] `UI-005` 입력창 + 전송 버튼 + `근거 필요` 체크박스를 구현한다. | DoD: 옵션 상태가 요청 payload에 반영.
- [x] `UI-006` 스트리밍 상태 문구(`생성 중...`)를 구현한다. | DoD: chat in-flight 동안 표시.
- [x] `UI-007` 도구 실행 상태 문구(`자료 조회 중...`)를 구현한다. | DoD: tool start~end 구간 표시.
- [x] `UI-008` SSE 클라이언트 파서를 구현하고 이벤트별 상태 업데이트를 연결한다. | DoD: token/tool/message/error/done 모두 렌더링 반영.
- [x] `UI-009` token 누적 버퍼 렌더링을 구현한다. | DoD: token 연속 수신 시 문장 누적 확인.
- [x] `UI-010` `event:message` 수신 시 token 버퍼 폐기 후 `message.text`로 원자 교체 구현. | DoD: 최종 텍스트 일치 테스트 통과.
- [x] `UI-011` token 누적값과 최종 message 불일치 시 경고 로그 1회 출력 구현. | DoD: 불일치 케이스 로그 1회만 발생.
- [x] `UI-012` 우측 `사고 과정 보기` 토글/패널 UI를 구현한다. | DoD: 기본 숨김, 토글 시 표시.
- [x] `UI-013` reasoning trace 목록 조회/표시를 구현한다. | DoD: 턴별 nextAction/reasonSummary/tool 상태 렌더링.
- [x] `UI-014` trace 항목 3줄/200자 표시 제한을 구현한다. | DoD: 긴 텍스트 클램프 동작 확인.
- [x] `UI-015` 디버그 모드에서만 tool args/trace 세부를 확장 노출한다. | DoD: debug on/off 표시 차이 테스트 통과.
- [x] `UI-016` SSE 오류/종료 상태 처리(재시도 가능 상태) 구현. | DoD: done(ok=false) 후 UI 정상 복구.

## 18. 보안/가드레일/로깅 구현
- [x] `SEC-001` 서버 측 도구 allowlist 재검증(실행 직전) 구현. | DoD: 비허용 toolName 차단 테스트 통과.
- [x] `SEC-002` 모든 도구 인자 zod 검증(실행 전) 구현. | DoD: 스키마 위반 요청 실행 차단.
- [x] `SEC-003` `REFUSE` 정책 메시지 템플릿(학습코치형 대안 포함) 구현. | DoD: 부정행위 요청 응답 품질 테스트 통과.
- [x] `SEC-004` 로그 기록 직전 PII 마스킹 파이프라인 적용 구현. | DoD: 로그 스냅샷에 원문 이메일/전화번호 미노출.
- [x] `SEC-005` 최소 로그 필드(`requestId,sessionId,nextAction,toolName,ok,latencyMs`) 고정 출력 구현. | DoD: 성공/실패 로그 샘플 점검 통과.
- [x] `SEC-006` `RouteDecision.reason` raw 원문 비저장/비응답 정책 강제 구현. | DoD: DB/API 어디에도 raw reason 없음.

## 19. 단위 테스트(도메인/애플리케이션)
- [x] `UT-001` `RouteDecision` 유효성 테스트 세트를 작성한다. | DoD: action별 필수 필드 규칙 전부 커버.
- [x] `UT-002` `needsSources` 강제대상 판정 알고리즘 테스트를 작성한다. | DoD: 1~5순위/정규화/includes 케이스 커버.
- [x] `UT-003` `refusePrecheck` 테스트를 작성한다. | DoD: 키워드 양/음성 케이스 커버.
- [x] `UT-004` `reasonSummary` 정규화 테스트를 작성한다. | DoD: 금지패턴 치환, 줄바꿈, 절단, 빈값대체 검증.
- [x] `UT-005` 출처 정규화 유틸 테스트를 작성한다. | DoD: invalid/drop/dedupe/top5 검증.
- [x] `UT-006` failure counter 정책 테스트를 작성한다. | DoD: 증가/상한/reset/유지 규칙 검증.
- [x] `UT-007` PII 마스킹 테스트를 작성한다. | DoD: 이메일/전화번호/idempotent 검증.
- [x] `UT-008` 입력 길이 검증(code point+trim) 테스트를 작성한다. | DoD: 경계+멀티바이트 케이스 커버.
- [x] `UT-009` requestId/ID regex 정책 테스트를 작성한다. | DoD: 대소문자/포맷 규칙 검증.

## 20. API/통합 테스트(Stub 모드 기본)
- [x] `IT-001` `POST /api/sessions` 성공/검증실패/트랜잭션실패 테스트를 작성한다. | DoD: 상태코드+에러스키마+롤백 검증.
- [x] `IT-002` `GET /api/sessions/{sessionId}` 성공/404/422 테스트를 작성한다. | DoD: 스펙 매핑 통과.
- [x] `IT-003` `/api/tools/search` 인증우선순위(401 우선) 테스트를 작성한다. | DoD: 토큰누락+invalid body 동시 케이스 통과.
- [x] `IT-004` `/api/tools/transform` 인증/검증/404 테스트를 작성한다. | DoD: 상태코드+에러코드 일치.
- [x] `IT-005` `/api/chat` pre-stream 검증(400/404/409/422) 테스트를 작성한다. | DoD: 조건별 오류 응답 통과.
- [x] `IT-006` `/api/chat` 4개 액션 경로(`DIRECT_ANSWER`, `CALL_TOOL`, `ASK_CLARIFY`, `REFUSE`) 테스트를 작성한다. | DoD: 경로 100% 커버.
- [x] `IT-007` recoverable 도구 실패에서 fallback 응답 + `done.ok=true` 테스트를 작성한다. | DoD: 오류 후 message 존재 확인.
- [x] `IT-008` unrecoverable 오류에서 `event:error` + `done.ok=false` 테스트를 작성한다. | DoD: message 미전송 확인.
- [x] `IT-009` `/api/chat` in-stream tool timeout은 `event:tool(errorCode=TOOL_TIMEOUT)`만 전송되는지 테스트한다. | DoD: HTTP 200 유지 + event:error 미전송.
- [x] `IT-010` SSE cardinality 테스트를 작성한다. | DoD: message/error/done 개수 규칙 통과.
- [x] `IT-011` SSE payload strict schema 테스트를 작성한다. | DoD: 필수 필드/허용 필드 규칙 통과.
- [x] `IT-012` commit 순서 테스트(`commit 성공 후 message`)를 작성한다. | DoD: commit 실패 시 message 미전송 검증.
- [x] `IT-013` abort 처리 테스트를 작성한다. | DoD: abort 후 in-flight 해제 + done 미전송 허용 검증.
- [x] `IT-014` `x-request-id` 전파 테스트(성공/오류/SSE handshake)를 작성한다. | DoD: 헤더/JSON error/requestId 일치.
- [x] `IT-015` `/reasoning-traces` 페이지네이션 테스트를 작성한다. | DoD: cursor/limit/tie-break/invalid cursor 통과.
- [x] `IT-016` 턴 저장 cardinality 테스트를 작성한다. | DoD: done 상태별 DB row count 매트릭스 통과.
- [x] `IT-017` `tool_executions` 저장 규칙 테스트를 작성한다. | DoD: start 기반 저장, ok/result/latency 규칙 통과.
- [x] `IT-018` `consecutiveToolFailureTurns` 저장/복원 테스트를 작성한다. | DoD: 증가/상한/reset/유지 케이스 통과.
- [x] `IT-019` `needsSources` 강제/비강제 시나리오 테스트를 작성한다. | DoD: sources 필수/선택/ASK_CLARIFY fallback 검증.
- [x] `IT-020` `reasonSummary` raw reason 비노출 테스트를 작성한다. | DoD: DB/API payload에서 raw reason 미검출.

## 21. UI 테스트
- [x] `UI-T-001` 채팅 페이지 기본 렌더 테스트를 작성한다. | DoD: 핵심 UI 영역 렌더 확인.
- [x] `UI-T-002` token 누적->message 교체 규칙 테스트를 작성한다. | DoD: 최종 본문이 `message.text`로 치환.
- [x] `UI-T-003` token/message 불일치 경고 로그 1회 테스트를 작성한다. | DoD: 로그 호출 count=1.
- [x] `UI-T-004` `근거 필요` 체크박스가 요청 `needsSources`에 반영되는지 테스트한다. | DoD: payload 검증 통과.
- [x] `UI-T-005` 사고 과정 보기 토글/리스트 렌더 테스트를 작성한다. | DoD: 토글 전 숨김, 후 표시.
- [x] `UI-T-006` 디버그 모드에서만 상세 필드 노출 테스트를 작성한다. | DoD: debug on/off 차이 검증.
- [x] `UI-T-007` 스트리밍 상태/도구 상태 문구 표시 테스트를 작성한다. | DoD: in-flight/tool running 시점 검증.
- [x] `UI-T-008` done(ok=false) 오류 종료 UI 복구 테스트를 작성한다. | DoD: 입력 재활성화/오류 안내 확인.

## 22. Live 통합(선택 실행) 테스트
- [x] `LIVE-001` `integration:live` 태그 체계를 설정한다. | DoD: `pnpm test:live`에서만 실행.
- [x] `LIVE-002` Gemini live 어댑터 호출 스모크 테스트를 작성한다. | DoD: 키 존재 시 실제 호출 성공.
- [x] `LIVE-003` Tavily live 어댑터 호출 스모크 테스트를 작성한다. | DoD: 키 존재 시 실제 호출 성공.
- [x] `LIVE-004` live 모드 키 누락 fail-fast 테스트를 작성한다. | DoD: 앱 시작 단계에서 즉시 실패.

## 23. 성능 측정 준비
- [x] `PERF-001` `2.2` 프로토콜을 자동 실행하는 벤치마크 스크립트를 작성한다. | DoD: 모드별 220요청 실행 가능.
- [x] `PERF-002` 워크로드 fixture(유효 200 + 기대 시나리오 라벨)를 작성한다. | DoD: 시나리오/길이/needsSources/세션분포 규칙 충족.
- [x] `PERF-003` warm-up 20 제외 후 p95 계산 로직을 구현한다. | DoD: 계산 단위 테스트 통과.
- [x] `PERF-004` 측정 구간(`t0->t_first`) 로깅 포인트를 구현한다. | DoD: 요청별 측정값 수집 가능.
- [x] `PERF-005` stub/live 모드 각각 성능 측정 리포트 템플릿을 만든다. | DoD: p95 결과 + 샘플 조건 기록 가능.
- [x] `PERF-006` 안정성 지표(`fallback 제공률`, `done 정상종료율`) 집계 로직을 구현한다. | DoD: 분모/분자 정의대로 계산.
- [x] `PERF-007` 워크로드 시나리오 비율 판정을 실제 라우팅 결과가 아니라 fixture 기대 라벨 기준으로 계산한다. | DoD: 판정 로직 단위 테스트 통과.

## 24. CI/품질 게이트
- [x] `CI-001` CI 파이프라인에서 `pnpm test` 실행을 설정한다. | DoD: 테스트 실패 시 빌드 실패.
- [x] `CI-002` `pnpm test:coverage` 실행 및 임계치(`domain+application >=80%`)를 설정한다. | DoD: 임계치 미달 시 실패.
- [x] `CI-003` SSE 계약 테스트를 필수 게이트로 묶는다. | DoD: SSE 테스트 실패 시 CI 실패.
- [x] `CI-004` 기본 CI는 stub 모드로 고정한다. | DoD: 키 없이 CI green 가능.
- [x] `CI-005` live 테스트는 수동/별도 job으로 분리한다. | DoD: 키 제공 시에만 선택 실행.

## 25. 최종 DoD 검증 과업
- [x] `DOD-001` 4개 `NextAction` 경로 E2E 시나리오를 실제 API 호출로 검증한다. | DoD: 각 경로 성공 로그/테스트 결과 확보.
- [x] `DOD-002` 도구 2종(`search`, `transform`) allowlist+스키마 검증 하에서만 실행되는지 검증한다. | DoD: 비허용/스키마오류 차단 증빙.
- [x] `DOD-003` 도구 실패 시 fallback 응답 보장률 100%를 샘플/테스트로 검증한다. | DoD: 분모 정의 케이스에서 100%.
- [x] `DOD-004` `MasterContext`가 턴 라우팅/응답에 반영되는지 회귀 테스트로 검증한다. | DoD: 컨텍스트 변경 시 라우팅/응답 변화 확인.
- [x] `DOD-005` 사고 과정 보기(요약형 trace, raw CoT 비노출) 검증을 수행한다. | DoD: UI/DB/API에서 raw CoT 미노출.
- [x] `DOD-006` API 키 없이 stub 기반 핵심 시나리오 검증 가능함을 확인한다. | DoD: 무키 환경 전체 테스트 green.
- [ ] `DOD-007` `2.1` 성능 목표(stub 1.5s, live 3.0s p95 첫 청크) 측정 결과를 기록한다. | DoD: 측정 리포트 문서화 완료.
- [x] `DOD-008` SSE `done` 정상 종료율 99% 이상을 부하 리포트로 검증한다. | DoD: 정의된 분모 기준 지표 충족.
- [x] `DOD-009` 라우팅 품질 샘플셋(50문장) 기준 목표치를 검증한다. | DoD: `CALL_TOOL` 진입률/불필요 호출률 목표 충족.
- [x] `DOD-010` 최종 릴리스 체크리스트(테스트/커버리지/문서/환경변수) 완료 후 태깅한다. | DoD: 릴리스 후보 빌드 1회 이상 재현 성공.

## 26. 구현 완료 산출물 체크
- [x] `OUT-001` API 계약 문서(요청/응답/에러/SSE 예시) 최신화. | DoD: 구현과 문서 diff 없음.
- [x] `OUT-002` DB 스키마/제약/인덱스 문서 최신화. | DoD: 실제 DDL과 문서 일치.
- [x] `OUT-003` 테스트 리포트(단위/통합/UI/live/성능) 정리. | DoD: 실행 일시/환경/결과 포함.
- [x] `OUT-004` 운영 가이드(환경변수, 모드 전환, 토큰 설정, known limits) 작성. | DoD: 신규 개발자가 가이드만으로 실행 가능.
