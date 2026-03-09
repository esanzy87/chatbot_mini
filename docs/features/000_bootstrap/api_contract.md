# API 계약 문서 (MVP v0)

## 공통
- 응답 헤더: 모든 성공/오류 응답에 `x-request-id` 포함
- 에러 스키마:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "요청 파라미터가 올바르지 않습니다.",
    "requestId": "req_01...",
    "details": {
      "fields": [{ "path": "message", "reason": "length" }]
    }
  }
}
```
- 주요 에러 코드: `VALIDATION_ERROR`, `JSON_PARSE_ERROR`, `INVALID_CURSOR`, `SESSION_BUSY`, `SESSION_NOT_FOUND`, `UNAUTHORIZED_INTERNAL_ACCESS`, `TOOL_TIMEOUT`, `TOOL_EXECUTION_ERROR`, `MODEL_PROVIDER_ERROR`, `INTERNAL_SERVER_ERROR`

## `POST /api/sessions`
- 요청:
```json
{ "masterContext": "..." }
```
- 응답:
```json
{
  "sessionId": "sess_01...",
  "masterContextSummary": "...",
  "createdAt": "2026-03-07T10:00:00.000Z"
}
```

## `GET /api/sessions/{sessionId}`
- 응답:
```json
{
  "sessionId": "sess_01...",
  "masterContext": "...",
  "masterContextSummary": "...",
  "createdAt": "2026-03-07T10:00:00.000Z"
}
```
- 동작 메모:
  - 진로상담 대화에서 누적된 숨은 맥락이 서버에 의해 `masterContext`로 승격되면, 이후 조회 응답의 `masterContext`에도 반영된다.

## `POST /api/tools/search` (내부 전용)
- 헤더: `x-internal-tool-token`
- 사용 경계: `/api/chat` 오케스트레이션은 포트 어댑터를 직접 사용하며, 본 엔드포인트는 내부 점검/테스트용 보호 경로로 유지
- 요청:
```json
{
  "sessionId": "sess_01...",
  "query": "LangGraph orchestration",
  "topK": 5
}
```
- 응답:
```json
{
  "items": [
    {
      "title": "문서 제목",
      "snippet": "요약",
      "bodyText": "링크 본문에서 추출한 텍스트",
      "source": "official-doc",
      "url": "https://example.com/doc"
    }
  ]
}
```

## `POST /api/tools/transform` (내부 전용)
- 헤더: `x-internal-tool-token`
- 사용 경계: `/api/chat` 오케스트레이션은 포트 어댑터를 직접 사용하며, 본 엔드포인트는 내부 점검/테스트용 보호 경로로 유지
- 요청:
```json
{
  "sessionId": "sess_01...",
  "text": "원문",
  "targetFormat": "summary"
}
```
- 응답:
```json
{
  "resultText": "변환 결과",
  "appliedRules": ["format=presentation_script", "tone=neutral"]
}
```

## `POST /api/chat` (SSE)
- 요청:
```json
{
  "sessionId": "sess_01...",
  "message": "질문",
  "clientOptions": {
    "needsSources": false,
    "debug": false
  }
}
```
- 이벤트:
  - `event: token`
  - `event: tool`
  - `event: message`
  - `event: error`
  - `event: done`
- 동작 메모:
  - `event: token`은 실제 모델 생성 중 발생하는 delta를 순서대로 전송하는 것을 우선한다.
  - 단, 모델 스트리밍이 발생하지 않은 경로에서는 최종 텍스트 전체가 단일 `event: token`으로 전송될 수 있다.
  - `event: message.text`는 스트리밍으로 누적된 최종 전체 텍스트다.
- 정상 예시:
```txt
event: token
data: {"turnId":"turn_01...","delta":"부분 텍스트"}

event: message
data: {"turnId":"turn_01...","text":"검색된 문서 본문을 바탕으로 핵심 개념과 차이점을 정리해드리겠습니다.\n\n출처:\n- 문서 제목 (https://example.com/doc)","nextAction":"CALL_TOOL","sources":[{"title":"문서 제목","url":"https://example.com/doc","source":"official-doc"}]}

event: done
data: {"turnId":"turn_01...","ok":true,"latencyMs":120}
```

## `GET /api/sessions/{sessionId}/reasoning-traces`
- 쿼리: `limit`(1~100, 기본 20), `cursor`(base64url)
- 응답:
```json
{
  "nextCursor": "eyJ2IjoxLCJjcmVhdGVkQXQiOiIyMDI2LTAzLTA3VDEwOjEwOjAwLjAwMFoiLCJ0dXJuSWQiOiJ0dXJuXzAxLi4uIn0",
  "items": [
    {
      "turnId": "turn_01...",
      "nextAction": "CALL_TOOL",
      "reasonSummary": "출처 확인이 필요해 검색 도구를 사용",
      "allowedTools": ["search"],
      "toolExecutions": [
        {
          "toolCallId": "tool_01...",
          "toolName": "search",
          "ok": true,
          "latencyMs": 42
        }
      ],
      "createdAt": "2026-03-07T10:20:00.000Z"
    }
  ]
}
```
