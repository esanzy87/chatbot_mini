# 테스트 리포트 (v0)

## 실행 환경
- 날짜: 2026-03-07
- 런타임: Node.js v24
- 모드: `APP_LLM_MODE=stub`, `APP_SEARCH_MODE=stub`, `NODE_ENV=test`

## 실행 결과
- `npm run typecheck` : 성공
- `npm run test` : 성공 (`141` passed, `2` skipped `integration:live`)
- `npm run test:coverage` : 성공
  - coverage gate (`domain + application >= 80%`) 통과
  - lines `87.63%`, branches `80.36%`, functions `96.49%`, statements `87.45%`
- `npm run test:sse-contract` : 성공
- `npm run test:live` : 기본 환경에서 skip (키 미설정 시 smoke test skip)

## 주요 테스트 범주
- 단위: 도메인 정책, 유스케이스, 환경변수, 공통 유틸, 퍼포먼스 메트릭
- 통합(API): sessions/tools/chat/reasoning-traces/request-id/reason-summary guard
- 통합(DoD): masterContext 반영, fallback 보장률, 라우팅 품질 샘플
- 통합(SQLite): schema 제약, 트랜잭션 원자성, repository 동작
- UI: `/chat/[sessionId]` 렌더링, SSE 반영, 디버그 토글, 오류 복구
- live smoke: Gemini/Tavily 실제 호출 경로(키 존재 시 실행)

## 성능 측정 산출물
- stub 벤치마크 결과:
  - [perf_report_stub.md](/home/dev/projects/chatbot_mini/docs/perf_report_stub.md)
  - [perf_report_stub.json](/home/dev/projects/chatbot_mini/docs/perf_report_stub.json)
