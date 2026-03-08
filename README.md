# chatbot_mini

Next.js + LangGraph 기반 최소 오케스트레이션 챗봇 MVP.

현재 기본 챗봇 퍼소나는 `샛별(Saetbyul)`이다.
- 한국인 UC버클리 Life Science 전공 1학년 선배 캐릭터
- 한국어 반말, 밝고 현실적인 진로/학습 코칭 톤
- 완성본 대필 대신 방향 설계와 구조화된 도움을 우선
- 진로상담에서 3~5턴 정도 누적해 파악한 핵심 맥락은 세션 `masterContext`에 메모로 축적되어 다음 턴 프롬프트에 재사용된다

## Quick Start
```bash
npm install
INTERNAL_TOOL_TOKEN=local-token APP_LLM_MODE=stub APP_SEARCH_MODE=stub npm run dev
```

## Env File
루트에 `.env.local`(권장) 또는 `.env` 파일을 만들고 아래처럼 설정합니다.

```env
# 필수
INTERNAL_TOOL_TOKEN=local-token

# 선택 (기본: stub)
APP_LLM_MODE=stub
APP_SEARCH_MODE=stub
```

live 모드 사용 시 추가:

```env
APP_LLM_MODE=live
APP_SEARCH_MODE=live
GEMINI_API_KEY=your_gemini_key
TAVILY_API_KEY=your_tavily_key
```

## Check
```bash
npm run typecheck
npm run test
```

## API
- `POST /api/sessions`
- `GET /api/sessions/{sessionId}`
- `POST /api/chat` (SSE)
- `GET /api/sessions/{sessionId}/reasoning-traces`
- `POST /api/tools/search` (internal)
- `POST /api/tools/transform` (internal)

## Docs
- `docs/features/0_bootstrap/initial_spec.md` (기준 문서)
- `docs/features/0_bootstrap/prd.md`
- `docs/runbook.md`
