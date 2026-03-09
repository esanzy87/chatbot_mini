# 테스트 리포트 (v0)

## 실행 환경
- 날짜: 2026-03-09
- 런타임: Node.js v24
- 모드: `APP_LLM_MODE=stub`, `APP_SEARCH_MODE=stub`, `NODE_ENV=test`

## 실행 결과
- `npm run typecheck` : 성공
- `npm run test` : 실패
  - 원인: Vite import-analysis가 `node:sqlite` 내장 모듈을 번들링하지 못해 통합 스위트가 로드 단계에서 중단됨
  - 관찰 결과: `10 failed suites`, `9 passed files`, `89 passed`, `2 skipped`
- 권장 확인 세트 : 성공
  - `test/unit/infrastructure/adapters.test.ts`
  - `test/unit/application/usecases.test.ts`
  - `test/ui/chat-client.test.tsx`
- `npm run test:coverage`, `npm run test:sse-contract`, `npm run test:live` : 이번 점검에서는 재실행하지 않음

## 주요 테스트 범주
- 단위: 도메인 정책, 유스케이스, 환경변수, 공통 유틸, 퍼포먼스 메트릭
- 통합(API): sessions/tools/chat/reasoning-traces/request-id/reason-summary guard
- 통합(DoD): masterContext 반영, fallback 보장률, 라우팅 품질 샘플
- 통합(SQLite): 현재 환경에서는 `node:sqlite` 번들링 이슈로 전체 실행 불가
- UI: `/chat/[sessionId]` 렌더링, SSE 반영, 디버그 토글, 오류 복구
- live smoke: Gemini/Tavily 실제 호출 경로(키 존재 시 실행)

## 메모
- `npm run test` 실패는 애플리케이션 로직 회귀보다 테스트 러너/번들링 구성 이슈에 가깝다.
- 따라서 현재 문서의 기준 검증치는 `typecheck + 선택 실행된 unit/UI 테스트`로 해석해야 한다.

## 성능 측정 산출물
- stub 벤치마크 결과:
  - [perf_report_stub.md](/home/ubuntu/projects/chatbot_mini/docs/features/0_bootstrap/perf_report_stub.md)
  - [perf_report_stub.json](/home/ubuntu/projects/chatbot_mini/docs/features/0_bootstrap/perf_report_stub.json)
