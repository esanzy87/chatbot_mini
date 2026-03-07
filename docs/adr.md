# ADR (v0)

## ADR-001: SQLite 드라이버 선택
- 날짜: 2026-03-07
- 결정:
  - 외부 패키지(`better-sqlite3`/`sqlite3`) 대신 Node 내장 `node:sqlite`를 사용한다.
  - DB 접근은 MVP 단계에서 동기 API(`DatabaseSync`)를 사용한다.
- 근거:
  - 현재 실행 환경에서 네이티브 빌드 의존성을 줄이고, 초기 구현 속도를 높이는 것이 유리하다.
  - 스펙 요구사항은 저장소를 SQLite로 고정하고 있으며, 드라이버 구현체는 명시되어 있지 않다.
- 영향:
  - Node 런타임 의존이 강해지며(Edge 런타임 부적합), 라우트는 Node 실행 전제를 가진다.
  - 향후 고부하 환경에서는 비동기/풀링 전략으로 교체 가능하다.
- 코드 근거:
  - `src/infrastructure/sqlite/database.ts`
  - `src/infrastructure/sqlite/schema.ts`
  - `src/infrastructure/sqlite/repository.ts`

## ADR-002: 성능 벤치마크 실행 경로
- 날짜: 2026-03-07
- 결정:
  - 성능 벤치마크는 외부 HTTP 서버 대신 Route Handler를 프로세스 내부에서 직접 호출한다.
  - 측정 스크립트는 `node --import tsx scripts/benchmark-chat.ts`로 실행한다.
- 근거:
  - 현재 실행 환경에서 `tsx` 기본 IPC 모드가 샌드박스 권한과 충돌해 실행 실패(`EPERM`)가 발생했다.
  - in-process 호출로도 `/api/chat` 요청/응답 흐름, SSE 첫 청크 시간, 안정성 지표를 재현 가능하다.
- 영향:
  - 네트워크/리버스프록시 오버헤드는 포함되지 않는다.
  - 애플리케이션 로직 중심 p95 측정과 회귀 비교에는 충분하다.
- 코드 근거:
  - `scripts/benchmark-chat.ts`
  - `package.json` (`benchmark:stub`)

## ADR-003: Coverage 게이트 범위
- 날짜: 2026-03-07
- 결정:
  - 커버리지 임계치(80%)는 `domain` + `application` 레이어에만 강제한다.
- 근거:
  - 초기 MVP 품질 게이트 목표가 도메인 정책/유스케이스 안정성 확보에 맞춰져 있다.
  - UI/인프라/프레젠테이션은 통합 테스트로 검증하고, 커버리지 게이트는 핵심 로직 계층에 집중한다.
- 영향:
  - CI `test:coverage` 실패 조건은 핵심 레이어 기준으로 단순화된다.
- 코드 근거:
  - `vitest.config.ts` coverage include/threshold 설정
  - `.github/workflows/ci.yml`

## ADR-004: CALL_TOOL 최소 구현 방식
- 날짜: 2026-03-07
- 결정:
  - MVP v0.33의 `CALL_TOOL` 경로는 모델 raw `tool_calls` 파싱 루프 대신, 서버 결정적 선택기(`allowedTools` 기반)로 단일 도구를 선택해 실행한다.
  - 동일 턴 도구 실행은 최대 2회 루프(재시도 포함) 정책을 유지한다.
- 근거:
  - Scratch 단계에서 구조화된 라우팅 결과와 도구 실행 안정성(검증/타임아웃/fallback) 확보를 우선한다.
  - 모델별 tool-call payload 차이와 파싱 변동성을 초기 MVP 범위에서 분리해 복잡도를 낮춘다.
- 영향:
  - `callModelWithTools` 노드는 모델 호출 노드가 아니라 서버 측 도구 선택 노드로 동작한다.
  - 추후 확장 시 model-native tool call 루프를 별도 ADR로 도입한다.
- 코드 근거:
  - `src/application/graph/chatGraph.ts` (`chooseTool`, `callModelWithTools`, `toolNode`)
  - `docs/initial_spec.md` v0.33

## ADR-005: 내부 툴 API 실행 경계
- 날짜: 2026-03-07
- 결정:
  - `/api/chat` 오케스트레이션 경로는 포트 어댑터를 직접 호출해 도구를 실행한다.
  - `/api/tools/*`는 `x-internal-tool-token` 보호를 유지한 내부 점검/테스트용 엔드포인트로 제공한다.
- 근거:
  - 오케스트레이션 hot path에서 불필요한 내부 HTTP hop을 제거해 단순성과 지연시간을 줄인다.
  - 내부 툴 API 보호/검증 계약은 독립 라우트에서 동일하게 검증 가능하다.
- 영향:
  - `/api/tools/*`는 운영 점검/통합 테스트용 경로로 유지되고, 채팅 실행 경로의 필수 의존성은 아니다.
- 코드 근거:
  - `src/application/graph/chatGraph.ts` (포트 직접 호출)
  - `src/app/api/tools/search/route.ts`
  - `src/app/api/tools/transform/route.ts`
  - `docs/initial_spec.md` v0.33

## ADR-006: Composition Root 위치 조정
- 날짜: 2026-03-07
- 결정:
  - 의존성 조립 코드를 `application`에서 분리해 `composition` 계층으로 이동한다.
  - `presentation/test/script`는 `composition/container`를 사용한다.
- 근거:
  - 클린 아키텍처 규칙에서 application 비즈니스 계층이 infra 구체 구현체를 직접 import하지 않도록 경계를 명확히 한다.
- 영향:
  - import 경로가 `@/application/container` -> `@/composition/container`로 변경된다.
  - 테스트/스크립트에서도 동일 경계를 유지한다.
- 코드 근거:
  - `src/composition/container.ts`
  - `src/app/api/*`
  - `test/**`, `scripts/benchmark-chat.ts`

## ADR-007: TOOL_EXECUTION_ERROR 승격 규칙
- 날짜: 2026-03-07
- 결정:
  - 도구 노드 예외로 그래프 진행 불가 시 `event:error(code=TOOL_EXECUTION_ERROR)` + `done(ok=false)`로 종료한다.
  - 이때 `toolCallId` 귀속 가능 여부와 무관하게 승격할 수 있다.
- 근거:
  - 실제 실행 경로에서는 도구 이벤트(`start/error`)가 이미 생성된 상태에서도 노드 레벨 진행 불가가 발생할 수 있다.
  - 종료 규칙을 명확히 해 구현-문서 정합성을 유지한다.
- 영향:
  - 도구 실행 실패의 일부 경로에서 `event: tool(phase=error)` 후 `event:error`가 이어질 수 있다.
- 코드 근거:
  - `src/application/graph/chatGraph.ts`
  - `src/app/api/chat/route.ts`
  - `docs/initial_spec.md` v0.33

## ADR-008: Presentation 계층 접근 경계 정렬
- 날짜: 2026-03-08
- 결정:
  - Route Handler는 `SqliteRepository` 구현체를 직접 호출하지 않고 application 경계(유스케이스/포트)만 사용한다.
  - 세션 조회는 `GetSessionUseCase`로 통일하고, reasoning trace 조회는 `GetReasoningTraceUseCase`를 사용한다.
  - `/api/health`도 공통 `x-request-id` 헤더 정책을 적용한다.
- 근거:
  - 초기 스펙의 클린 아키텍처/DIP 규칙(`presentation -> application -> domain`)과 구현 간 편차를 제거한다.
  - 공통 응답 상관관계(requestId) 정책을 운영 엔드포인트 전반에 일관 적용한다.
- 영향:
  - route 레이어의 인프라 직접 의존이 제거되고, application 테스트 대상 경로와 런타임 경로 정합성이 개선된다.
  - 헬스체크 응답도 requestId 기반 추적이 가능해진다.
- 코드 근거:
  - `src/application/usecases/getSession.ts`
  - `src/composition/container.ts`
  - `src/app/api/chat/route.ts`
  - `src/app/api/sessions/[sessionId]/route.ts`
  - `src/app/api/sessions/[sessionId]/reasoning-traces/route.ts`
  - `src/app/api/tools/search/route.ts`
  - `src/app/api/tools/transform/route.ts`
  - `src/app/api/health/route.ts`
  - `docs/initial_spec.md` v0.33

## ADR-009: 강제 출처 우선순위 + Abort 전파 정렬
- 날짜: 2026-03-08
- 결정:
  - `needsSources=true` 강제 대상에서는 `CALL_TOOL(search)` 강제 정책을 confidence fallback보다 우선 적용한다.
  - `GET /api/sessions/{sessionId}/reasoning-traces`에서 빈 `cursor`(`?cursor=`)는 `INVALID_CURSOR(400)`로 처리한다.
  - 도구 실행 경로에 요청 abort 신호를 전달하기 위해 `SearchPort.search/transform`에 선택적 `signal` 옵션을 추가한다.
- 근거:
  - 스펙의 "강제 출처 요청 우선 도구 시도"와 구현의 low-confidence 조기 `ASK_CLARIFY` 경로가 충돌했다.
  - cursor 빈값을 미지정으로 간주하면 페이지네이션 입력 계약의 "형식 오류는 INVALID_CURSOR" 원칙과 충돌한다.
  - 연결 종료 시 외부 호출 중단 시도가 가능해야 abort 처리 비용/지연을 줄일 수 있다.
- 영향:
  - 강제 출처 요청에서 첫 도구 시도 전 `ASK_CLARIFY`로 조기 종료되지 않는다.
  - `cursor=` 요청은 일관되게 `400 INVALID_CURSOR`를 반환한다.
  - Tavily live 호출 등 외부 도구 경로에서 abort 신호를 받아 조기 중단 시도가 가능해진다.
- 코드 근거:
  - `src/application/graph/chatGraph.ts`
  - `src/application/ports/search.ts`
  - `src/application/utils/withToolTimeout.ts`
  - `src/infrastructure/search/tavilySearchAdapter.ts`
  - `src/app/api/chat/route.ts`
  - `src/app/api/sessions/[sessionId]/reasoning-traces/route.ts`
  - `docs/initial_spec.md` v0.33

## ADR-010: 강제출처 ASK_CLARIFY 승격 + finalize abort write-guard
- 날짜: 2026-03-08
- 결정:
  - `forceSourceMode=FORCED`일 때 `REFUSE`를 제외한 라우팅 결과(`ASK_CLARIFY` 포함)는 `CALL_TOOL(search)`로 승격한다.
  - `finalizeTurn` write-set 반영 시 abort 신호를 단계별 재검사하고, 감지 시 `REQUEST_ABORTED`로 트랜잭션 롤백한다.
  - 강제출처/신뢰도 후처리 로직을 도메인 정책 함수로 통합해 `chatGraph`와 `HandleChatTurnUseCase`가 동일 규칙을 사용한다.
- 근거:
  - 강제출처 요청에서 LLM이 `ASK_CLARIFY`를 반환하면 첫 검색 시도 보장 정책이 깨질 수 있었다.
  - abort 시점이 finalize 직전/중간에 발생하면 문서의 "abort 턴 무저장" 규칙과 어긋날 여지가 있었다.
  - 동일 정책이 두 코드 경로에 중복되어 장기적으로 코드-코드 정합성 리스크가 있었다.
- 영향:
  - 강제출처 요청은 `REFUSE` 외 경로에서 항상 `search` 1회 시도를 우선한다.
  - abort 요청은 finalize 단계에서 부분 저장 없이 롤백된다.
  - 라우팅 정책 변경 시 단일 도메인 정책만 수정하면 된다.
- 코드 근거:
  - `src/domain/policies/routeDecision.ts`
  - `src/application/graph/chatGraph.ts`
  - `src/application/usecases/handleChatTurn.ts`
  - `src/application/ports/repository.ts`
  - `src/infrastructure/sqlite/repository.ts`
  - `docs/initial_spec.md` v0.33
