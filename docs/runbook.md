# 운영 가이드 (MVP)

## 1. 환경 변수
- 공통 필수:
  - `INTERNAL_TOOL_TOKEN`
- 선택:
  - `APP_LLM_MODE` (`stub|live`, 기본 `stub`)
  - `APP_SEARCH_MODE` (`stub|live`, 기본 `stub`)
- live 모드 필수:
  - `APP_LLM_MODE=live` -> `GEMINI_API_KEY`
  - `APP_SEARCH_MODE=live` -> `TAVILY_API_KEY`
- 테스트 환경:
  - `NODE_ENV=test`에서 `INTERNAL_TOOL_TOKEN` 미설정 시 `test-internal-token` 자동 적용

## 2. 실행
- 개발 서버:
  - `npm run dev`
- 타입 검사:
  - `npm run typecheck`
- 테스트:
  - `npm run test`
  - `npm run test:coverage`
  - `npm run test:sse-contract`
  - `npm run test:live` (키 설정 시)

## 3. 모드 전환
- 기본(stub):
```bash
APP_LLM_MODE=stub APP_SEARCH_MODE=stub INTERNAL_TOOL_TOKEN=local-token npm run dev
```
- live:
```bash
APP_LLM_MODE=live APP_SEARCH_MODE=live GEMINI_API_KEY=... TAVILY_API_KEY=... INTERNAL_TOOL_TOKEN=local-token npm run dev
```

## 4. 성능 벤치마크
- 실행:
  - `npm run benchmark:stub`
- 결과 파일:
  - `docs/perf_report_stub.md`
  - `docs/perf_report_stub.json`

## 5. 알려진 제한 사항
- `SESSION_BUSY` 락은 단일 Node 프로세스 범위에서만 보장됨
- SQLite 동기 드라이버 기반이라 고부하 멀티 인스턴스 운영에는 부적합
- live 성능/품질 지표는 외부 API 상태와 네트워크 품질에 영향을 받음
