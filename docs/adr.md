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
  - MVP v0.30의 `CALL_TOOL` 경로는 모델 raw `tool_calls` 파싱 루프 대신, 서버 결정적 선택기(`allowedTools` 기반)로 단일 도구를 선택해 실행한다.
  - 동일 턴 도구 실행은 최대 2회 루프(재시도 포함) 정책을 유지한다.
- 근거:
  - Scratch 단계에서 구조화된 라우팅 결과와 도구 실행 안정성(검증/타임아웃/fallback) 확보를 우선한다.
  - 모델별 tool-call payload 차이와 파싱 변동성을 초기 MVP 범위에서 분리해 복잡도를 낮춘다.
- 영향:
  - `callModelWithTools` 노드는 모델 호출 노드가 아니라 서버 측 도구 선택 노드로 동작한다.
  - 추후 확장 시 model-native tool call 루프를 별도 ADR로 도입한다.
- 코드 근거:
  - `src/application/graph/chatGraph.ts` (`chooseTool`, `callModelWithTools`, `toolNode`)
  - `docs/initial_spec.md` v0.30

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
  - `docs/initial_spec.md` v0.30

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
  - `docs/initial_spec.md` v0.30
