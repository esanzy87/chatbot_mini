# AGENTS.md (Minimal)

## 기준 문서
- 우선순위: `docs/features/0_bootstrap/initial_spec.md` > `docs/features/0_bootstrap/prd.md`
- 현재 구현 기준: Scratch MVP (`initial_spec.md` v0.34)

## 구현 범위(요약)
- Next.js App Router + TypeScript
- LangGraph 기반 오케스트레이션
- NextAction 4종: `DIRECT_ANSWER | CALL_TOOL | ASK_CLARIFY | REFUSE`
- Tool 2종: `search | transform`
- 저장소: SQLite
- UI 언어: 한국어 고정

## 필수 구현 규칙
- 클린 아키텍처 + DIP 준수
- raw chain-of-thought 저장/노출 금지(요약형 trace만 허용)
- 도구 실행은 allowlist + 스키마 검증 필수
- `/api/tools/*`는 내부 토큰(`x-internal-tool-token`) 검증 필수

## 소스 코드 레이아웃 (필수)
- 실제 코드 구현은 반드시 `src/` 하위에서 진행한다.
- 권장 구조:
  - `src/app` (Next.js 라우트/페이지, `app/api/*` 포함)
  - `src/domain`
  - `src/application`
  - `src/infrastructure`
  - `src/presentation` (필요 시 UI/SSE 프레젠테이션 분리)

## 기본 API 스코프
- `POST /api/sessions`
- `GET /api/sessions/{sessionId}`
- `POST /api/chat` (SSE)
- `POST /api/tools/search` (내부 전용)
- `POST /api/tools/transform` (내부 전용)
- `GET /api/sessions/{sessionId}/reasoning-traces`

## 실행/테스트 원칙(최소)
- TDD: RED -> GREEN -> REFACTOR
- 기본 모드: `APP_LLM_MODE=stub`, `APP_SEARCH_MODE=stub`
- live 모드 시:
  - `APP_LLM_MODE=live` -> `GEMINI_API_KEY` 필수
  - `APP_SEARCH_MODE=live` -> `TAVILY_API_KEY` 필수
- 핵심 시나리오는 API 키 없이 stub로 검증 가능해야 한다.
