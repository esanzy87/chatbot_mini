# chatbot_mini

Next.js + LangGraph 기반 최소 오케스트레이션 챗봇 MVP.

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
- `docs/initial_spec.md` (기준 문서)
- `docs/runbook.md`
