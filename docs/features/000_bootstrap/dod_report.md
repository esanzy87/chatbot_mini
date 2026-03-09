# 최종 DoD 검증 리포트

## 상태 요약
- 검증 기준 문서: `docs/features/0_bootstrap/initial_spec.md` v0.34
- 검증 일시: 2026-03-09
- 기본 모드(stub): 완료
- live 모드(실키): API 키 미제공 환경에서는 smoke test skip
- 회귀 테스트 최신 결과: `npm run test`는 현재 실패
- 실패 원인: `node:sqlite` import가 Vite 환경에서 번들되지 않아 통합 스위트 로드 실패

## 항목별 결과

1. DOD-001 4개 `NextAction` E2E
- 상태: 완료
- 근거: `test/integration/chat/prestream.test.ts` (`covers four nextAction routes in stub mode`)

2. DOD-002 도구 allowlist + 스키마 검증
- 상태: 완료
- 근거: `test/unit/application/usecases.test.ts`, `test/integration/api-sessions-tools.test.ts`

3. DOD-003 도구 실패 fallback 보장률
- 상태: 완료 (샘플셋 기준 100%)
- 근거: `test/integration/dod-regression.test.ts` (`keeps recoverable tool failure fallback success rate at 100% on sample set`)

4. DOD-004 MasterContext 반영 회귀
- 상태: 완료
- 근거: `test/integration/dod-regression.test.ts` (`reflects master context in direct answer text`)

5. DOD-005 사고 과정 보기(raw CoT 비노출)
- 상태: 완료
- 근거: `test/integration/reason-summary-exposure.test.ts`, `test/ui/chat-client.test.tsx`

6. DOD-006 API 키 없이 stub 검증
- 상태: 부분 완료
- 근거:
  - `npm run typecheck` 성공
  - `test/unit/infrastructure/adapters.test.ts`, `test/unit/application/usecases.test.ts`, `test/ui/chat-client.test.tsx` 성공
  - 전체 `npm run test`는 `node:sqlite` 번들링 이슈로 실패

7. DOD-007 성능 목표 기록(stub/live p95)
- 상태: 부분 완료
- stub: 완료 (`p95=11ms`) -> [perf_report_stub.md](/home/ubuntu/projects/chatbot_mini/docs/features/0_bootstrap/perf_report_stub.md)
- live: 보류 (키 미제공으로 미측정)

8. DOD-008 SSE done 정상 종료율 99%+
- 상태: 완료 (stub 벤치마크 100%)
- 근거: [perf_report_stub.json](/home/ubuntu/projects/chatbot_mini/docs/features/0_bootstrap/perf_report_stub.json)

9. DOD-009 라우팅 품질 샘플셋 50문장
- 상태: 완료
- 근거: `test/integration/dod-regression.test.ts` (`meets routing quality targets on 50-sample labeled set`)

10. DOD-010 최종 릴리스 체크리스트
- 상태: 부분 완료
- 근거:
  - 테스트/커버리지: [test_report.md](/home/ubuntu/projects/chatbot_mini/docs/features/0_bootstrap/test_report.md)
  - API/DB 문서: [api_contract.md](/home/ubuntu/projects/chatbot_mini/docs/features/0_bootstrap/api_contract.md), [db_schema.md](/home/ubuntu/projects/chatbot_mini/docs/features/0_bootstrap/db_schema.md)
  - 운영 가이드: [runbook.md](/home/ubuntu/projects/chatbot_mini/docs/runbook.md)
  - 단, 전체 테스트 러너 구성 이슈가 남아 있어 최종 릴리스 완료로 단정하지 않음
