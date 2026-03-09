# chatbot_mini 초기 구현 스펙 (Scratch MVP v0.34)

## 1. 문서 목적
- `docs/features/0_bootstrap/prd.md`를 기반으로, 스크래치에서 시작해 "실행 가능한 최소 완성 코드"를 만들기 위한 최초 구현 스펙을 정의한다.
- 이 문서는 구현 착수용이며, 현재 결정된 항목은 마지막 "확정 상태"에 명시한다.

## 2. 완료 정의 (Definition of Done)
- 단일 채팅 화면에서 사용자 입력을 보내면 서버가 `NextAction`을 결정하고, 필요 시 도구를 호출한 뒤 최종 답변을 스트리밍으로 반환한다.
- `NextAction` 4종(`DIRECT_ANSWER`, `CALL_TOOL`, `ASK_CLARIFY`, `REFUSE`)이 모두 동작한다.
- 도구 2종(`search`, `transform`)이 allowlist + 스키마 검증 하에서만 실행된다.
- 도구 실패 시 사용자 fallback 응답이 보장된다.
- 세션별 `MasterContext`가 매 턴 라우팅/답변 생성에 반영된다.
- 답변 생성 경로는 특정 인물 퍼소나 없이 일반적인 AI 챗봇 톤을 유지한다.
- 클린 아키텍처 + 의존성역전(DIP) 구조에서 도메인/애플리케이션 계층이 인프라 구현체에 직접 의존하지 않는다.
- UI에서 "사고 과정 보기" 토글로 턴별 의사결정 요약(행동, 이유, 도구 실행 로그)을 확인할 수 있다.
- `GEMINI_API_KEY`, `TAVILY_API_KEY`가 없어도 stub 기반 단위 테스트와 핵심 시나리오 검증이 가능하다.
- 핵심 유스케이스는 TDD(RED -> GREEN -> REFACTOR) 흐름으로 구현한다.

### 2.1 정량 완료 기준
- 응답 성능: `/api/chat` 기준 p95 첫 SSE 청크 시간
  - stub 모드: 1.5초 이하
  - live 모드: 3.0초 이하(외부 API 지연 포함)
  - 측정 구간: 서버가 요청 본문을 수신 완료한 시점(`t0`)부터 첫 SSE 이벤트(`token|tool|message|error`)를 기록한 시점(`t_first`)까지
- 안정성:
  - 툴 실패 시 fallback 응답 제공률 100%
    - 모수: `CALL_TOOL`로 진입했고 recoverable tool 오류가 1회 이상 발생한 in-stream 요청(연결 종료 제외)
  - SSE 스트림 `done` 이벤트 정상 종료율 99% 이상
    - 모수: pre-stream 오류와 클라이언트 연결 종료 케이스를 제외한 in-stream 요청
- 라우팅 품질(샘플 평가셋 50문장):
  - `CALL_TOOL` 필요 케이스에서 도구 경로 진입률 85% 이상
  - `DIRECT_ANSWER` 가능 케이스에서 불필요 도구 호출률 10% 이하

### 2.2 성능 측정 프로토콜(고정)
- 대상 지표: `2.1`의 `/api/chat` p95 첫 SSE 청크 시간
- 공통 조건:
  - 단일 Node.js 인스턴스, `SESSION_BUSY` 회피를 위해 동시성 1로 측정
  - 측정 대상 요청은 정상 in-stream 요청(`sessionId` 유효, pre-stream 에러/연결 종료 제외)
  - 측정 구간은 `2.1` 정의(`t0 -> t_first`)를 그대로 사용
  - in-process benchmark 스크립트에서는 구현 제약상 `t0`를 `chatRoute` 호출 직전 시점으로 근사 측정한다.
- 샘플 수:
  - 모드별(`stub`, `live`) 총 220요청 수행
  - 처음 20요청은 warm-up으로 제외, 이후 200요청으로 p95 산출
- 세션 분포:
  - 20개 세션을 사전 생성하고 round-robin으로 요청을 분산한다.
- 워크로드 구성(고정, 유효 샘플 200 기준):
  - 시나리오 비율: `DIRECT_ANSWER 80`, `CALL_TOOL 80`, `ASK_CLARIFY 20`, `REFUSE 20`
  - `CALL_TOOL` 80건 중 `needsSources=true` 40건, `needsSources=false` 40건
  - 메시지 길이 분포(Unicode code point): `1~30` 60건, `31~200` 100건, `201~800` 40건
  - 유효 샘플 구간에서 세션별 요청 수는 정확히 10건(총 20세션 x 10건)
  - 워크로드 입력은 사전 고정된 benchmark fixture(요청 200개, 기대 시나리오 라벨 포함)를 재생한다.
  - 시나리오 비율 충족 여부는 **실제 라우팅 결과가 아닌 fixture의 기대 라벨 분포**로 판정한다.

## 3. MVP 범위 (확정)
- 프레임워크: Next.js App Router + TypeScript.
- 오케스트레이션: LangGraph 상태 그래프.
- 아키텍처 원칙: 클린 아키텍처 + 의존성역전(DIP).
- 모델 공급자: Gemini (`GEMINI_API_KEY` 사용).
- 프런트: `/chat/[sessionId]` 단일 페이지.
- UI 언어: 한국어 고정.
- 챗봇 스타일: 특정 인물 퍼소나 없이 동작
  - 한국어로 응답하는 일반 목적 AI 챗봇
  - 친절하고 명확한 존댓말 톤으로 진로/학습 고민을 돕는다
- 백엔드 엔드포인트:
  - `POST /api/sessions`
  - `GET /api/sessions/{sessionId}`
  - `POST /api/chat`
  - `POST /api/tools/search` (내부 전용)
  - `POST /api/tools/transform` (내부 전용)
- 검색 도구: Tavily API 연동.
- 저장 전략: 백엔드 `SQLite` 확정.
- `MasterContext` 입력 방식: 세션 생성 시 1회 입력 후 재사용.
- 진로상담 메모리: 3~5턴 내에서 축적된 지속 맥락을 `MasterContext`에 누적 가능.
- "사고 과정 보기": raw chain-of-thought가 아닌 요약형 의사결정 트레이스 제공.
- 관측(최소 구현): 서버 콘솔 또는 파일 로그에 요청 지연시간, 라우팅 결과, 툴 성공/실패 기록.

### 3.1 환경변수 계약
- 필수(공통): `INTERNAL_TOOL_TOKEN`
- 선택(미설정 시 기본값 적용): `APP_LLM_MODE`, `APP_SEARCH_MODE`
- 모드 값 제약:
  - `APP_LLM_MODE`, `APP_SEARCH_MODE`는 `stub | live`만 허용(소문자 고정)
  - 환경변수 미설정(undefined)일 때만 기본값(`stub`) 적용
  - 빈 문자열 또는 허용 외 값이면 앱 시작 실패(fail-fast)
- live 모드 필수:
  - `APP_LLM_MODE=live` -> `GEMINI_API_KEY`
  - `APP_SEARCH_MODE=live` -> `TAVILY_API_KEY`
- 기본값:
  - `APP_LLM_MODE=stub`
  - `APP_SEARCH_MODE=stub`
- 내부 툴 토큰 부트스트랩:
  - `NODE_ENV=test`에서는 `INTERNAL_TOOL_TOKEN=test-internal-token` 기본값 허용
  - 그 외 환경(dev/prod)에서 `INTERNAL_TOOL_TOKEN` 미설정 시 앱 시작 실패(fail-fast)

## 4. 비범위 (초기 버전 제외)
- 사용자 인증/권한.
- 정식 DB(PostgreSQL 등) 및 마이그레이션.
- LangSmith 연동 대시보드.
- 멀티 유저 동시성 최적화, 고급 레이트리밋.
- 다국어 UI 지원.
- 모델의 raw 사고 원문(chain-of-thought) 저장/노출.

## 5. 핵심 아키텍처

### 5.1 요청-응답 흐름
1. 클라이언트가 `POST /api/chat`로 `sessionId`, `message` 전송.
2. 서버가 세션 컨텍스트(`MasterContext`, 메시지 히스토리)를 로드.
3. 서버가 `forceSourceMode`를 선계산한다(`needsSources=false`면 즉시 `NOT_FORCED`, `needsSources=true`면 `6.7 강제 대상 판정 알고리즘` 적용).
4. `planNextAction` 노드가 `forceSourceMode`를 입력으로 받아 구조화 출력 `RouteDecision` 생성.
5. 조건 분기:
   - `DIRECT_ANSWER`: 답변 생성 후 종료.
   - `CALL_TOOL`: 서버 결정적 도구 선택(`allowedTools` 기반) -> 도구 실행 -> 검색 도구인 경우 링크 본문 수집 후 교육형 답변 생성 -> 동일 턴 재시도 루프(최대 2회).
   - `ASK_CLARIFY`: 추가 질문 반환 후 종료.
   - `REFUSE`: 거절 + 대안 반환 후 종료.
6. 결과를 SSE로 스트리밍하여 UI에 표시.
   - `DIRECT_ANSWER` 및 검색 후 최종 답변 생성 단계는 모델 토큰 delta를 `event: token`으로 즉시 전달한다.

### 5.2 그래프 노드
- `loadSessionContext`
- `planNextAction`
- `directAnswer`
- `askClarify`
- `refuse`
- `callModelWithTools`
  - 역할: `allowedTools`/요청 문맥을 입력으로 이번 루프에서 실행할 단일 도구와 인자를 서버에서 결정
  - `search` 경로:
    - 검색 결과 목록 확보
    - 각 결과 링크 본문 확인
    - 수집한 본문을 근거로 최종 요약 답변 생성
  - 주의: MVP v0.34는 모델 raw `tool_calls`를 직접 파싱/재호출하지 않으며, 해당 패턴은 후속 버전 확장 항목으로 둔다.
- `toolNode`
- `finalize`

### 5.3 루프/예외 정책
- 도구 루프 최대 횟수: 2회.
- 도구 타임아웃: 8초.
- 도구 실패 시 fallback:
  - 판정 단위: 동일 `sessionId`의 연속 도구 실패 턴 수(`consecutiveToolFailureTurns`).
  - 동일 턴 내부에서는 recoverable 오류에 한해 도구 루프 한도(최대 2회) 내 재시도한다.
  - 우선순위 규칙:
    - `needsSources=true` AND 출처 강제 대상 요청에서 유효 출처 확보 실패 시, 연속 실패 턴 수와 무관하게 `ASK_CLARIFY`를 우선 적용한다.
    - 위 조건이 아닌 일반 `CALL_TOOL` 실패에만 연속 실패 2턴차 `DIRECT_ANSWER` fallback 규칙을 적용한다.
  - 턴 종료 시점 정책:
    - 연속 실패 1턴차: `ASK_CLARIFY` 메시지로 종료.
    - 연속 실패 2턴차 이상: 안전한 범위의 `DIRECT_ANSWER`로 종료.
  - reset 규칙: 도구 호출 성공 턴 또는 `CALL_TOOL`이 아닌 정상 종료 턴에서 `consecutiveToolFailureTurns=0`.
  - 실패 유형: 타임아웃, 외부 API 오류(`5xx`/네트워크), 스키마 검증 실패.
- 라우터 출력 파싱 실패 시 기본값 `ASK_CLARIFY`.

### 5.4 클린 아키텍처 + DIP 구조
- `domain`
  - 엔티티/값객체/정책(`RouteDecision`, 가드레일 규칙, refusal 정책)
- `application`
  - 유스케이스(`CreateSession`, `GetSession`, `HandleChatTurn`, `RunTool`, `GetReasoningTrace`)
  - 포트 인터페이스(`LlmPort`, `SearchPort`, `SessionRepository`, `MessageRepository`, `TraceRepository`)
- `infrastructure`
  - 어댑터(`GeminiLlmAdapter`, `TavilySearchAdapter`, `SqliteRepository`, `StubLlmAdapter`, `StubSearchAdapter`)
- `presentation`
  - Next.js Route Handler, UI 컴포넌트, SSE 이벤트 처리
- 의존성 방향: `presentation -> application -> domain` / `infrastructure -> application(port)` 역방향 주입.
- Route Handler는 인프라 구현체(`SqliteRepository` 등)에 직접 접근하지 않고, application 유스케이스/포트 경계로만 접근한다.
- composition root:
  - 의존성 조립 전용 `composition` 계층(또는 동등한 루트)은 infra 구현체를 생성하고 application 포트에 주입할 수 있다.
  - `domain`/`application` 비즈니스 코드(유스케이스/정책)는 infra 구체 구현체 import를 금지한다.

### 5.5 사고 과정 보기 정책
- 제공 정보:
  - 선택된 `NextAction`
  - `reason` 요약(1~3문장)
  - 허용 도구 목록, 실제 실행 도구, 실행 결과 상태(성공/실패/지연시간)
- 비제공 정보:
  - 모델 raw 추론 텍스트, 내부 chain-of-thought 원문
- 생성 규칙:
  - `reasonSummary`는 서버 후처리 템플릿으로 생성하고 최대 200자로 제한
  - 프롬프트/내부 추론 문자열이 포함되면 마스킹 후 저장
  - `RouteDecision.reason` 원문은 런타임 메모리에서만 사용하고 DB/API 응답에는 저장/노출하지 않음
  - 문장 수 규칙(고정):
    - 초안이 3문장을 초과하면 문장 경계(마침표/물음표/느낌표 기준) 앞 3문장만 유지한다.
    - 최종 하드 제약 우선순위는 `6.10`(치환/정규화/200자 절단/빈값 대체)이며, 문장 수 규칙과 충돌 시 `6.10`을 우선한다.
- UI 노출 방식:
  - 기본 숨김, 사용자가 토글 시 확장

### 5.6 프롬프트 정책
- 프롬프트는 인프라 계층의 별도 파일에서 관리하며, LLM 어댑터 내부 하드코딩 문자열로 분산하지 않는다.
- 프롬프트 종류:
  - 채팅 세션 응답용 시스템 프롬프트
  - `planNextAction` 라우터용 시스템 프롬프트
- 채팅 세션 응답 프롬프트 규칙:
  - 특정 인물 퍼소나를 연기하지 않는다.
  - 한국어만 사용하고, 친절하고 명확한 존댓말을 사용한다.
  - 이모지는 사용하지 않는다.
  - 진로/학습 상담은 사용자의 숨은 맥락을 3~5턴 안에서 파악하는 소크라틱 대화를 우선한다.
  - 세특/탐구/보고서 요청은 교육적 경로 설계를 돕되, 제출물 완성본 대필은 금지한다.
- 라우터 프롬프트 규칙:
  - 출력은 반드시 `RouteDecision` JSON만 허용한다.
  - `search`는 최신 정보, 외부 근거, 출처, 사실 확인이 필요할 때만 허용한다.
  - `transform`은 사용자가 원문 텍스트를 제공한 상태의 형식 변환에만 허용한다.
  - 진로상담/탐구설계처럼 맥락이 중요한 질문에서 정보가 부족하면 `ASK_CLARIFY`를 우선 고려한다.
  - 제출물 통째 작성, 부정행위, 표절 유도 요청은 `REFUSE`로 분기한다.
- 프롬프트 비노출 규칙:
  - 시스템 프롬프트 원문은 DB, API, reasoning trace, debug payload에 저장/노출하지 않는다.
  - 프롬프트 관련 문자열은 `reasonSummary` 정규화 규칙으로 마스킹 대상에 포함된다.
- 검색 후 답변 생성 규칙:
  - `CALL_TOOL(search)` 후에는 검색 결과 제목 나열만으로 종료하지 않는다.
  - 서버는 확보한 링크 본문을 읽고, 그 내용을 바탕으로 교육적으로 정리된 최종 응답을 생성한다.
  - 최종 응답에는 `sources` 배열로 출처를 포함한다.
  - 단, 검색 후 답변 생성 단계에서 모델 제공자 오류가 발생하면 제목 목록 기반의 축약 응답으로 fallback할 수 있다.

### 5.7 MasterContext 메모리 정책
- 기본 `MasterContext`는 세션 생성 시 입력된다.
- 추가 메모리 갱신:
  - 진로상담/학습상담 대화에서 3턴 이상 누적된 뒤 지속 활용 가치가 있는 숨은 맥락이 드러난 경우, 서버는 턴 종료 시 `MasterContext` 갱신을 시도할 수 있다.
  - 갱신 대상 예시: 관심 전공, 희망 진로, 현재 학년/상황, 중요 제약, 선호 활동 축, 이미 정한 목표
  - 갱신 비대상 예시: 일회성 잡담, 인사, 감정표현, 프롬프트 관련 문구, 대필/부정행위 요청
- 저장 형식:
  - 기존 `MasterContext` 원문은 유지하고, 추가 정보는 `[상담 메모]` 섹션의 bullet 형태로 누적한다.
  - 동일 의미의 메모가 이미 있으면 중복 저장하지 않는다.
  - 전체 `MasterContext`는 기존 길이 상한(4000 code points)을 넘지 않도록 절단한다.
- 사용 규칙:
  - 갱신된 `MasterContext`는 이후 턴의 라우터 프롬프트와 채팅 세션 시스템 프롬프트에 모두 주입한다.
  - 같은 턴의 답변 생성에는 필수 반영 대상이 아니며, 다음 턴부터 세션 컨텍스트로 사용한다.

## 6. 상태/스키마 계약

### 6.1 RouteDecision
```ts
type NextAction = "DIRECT_ANSWER" | "CALL_TOOL" | "ASK_CLARIFY" | "REFUSE";

type RouteDecision = {
  nextAction: NextAction;
  allowedTools: Array<"search" | "transform">;
  clarifyQuestion?: string | null;
  refuseReason?: string | null;
  confidence: number; // 0~1
  reason: string; // runtime-only(debug), persist/response 금지
};
```

### 6.2 Graph State
```ts
type ConversationState = {
  sessionId: string;
  messages: BaseMessage[];
  masterContext: string;
  forceSourceMode: "FORCED" | "NOT_FORCED"; // pre-routing runtime-only
  consecutiveToolFailureTurns: number;
  routeDecision?: RouteDecision;
  allowedTools: string[];
  debug?: {
    traceId?: string;
    latencyMs?: number;
    toolCalls?: number;
  };
};
```

### 6.3 Reasoning Trace View 모델
```ts
type ReasoningTrace = {
  turnId: string;
  nextAction: NextAction;
  reasonSummary: string;
  allowedTools: string[];
  toolExecutions: Array<{
    toolCallId: string;
    toolName: string;
    ok: boolean;
    latencyMs: number;
  }>;
  createdAt: string;
};
```

### 6.4 입력 제약(검증)
- `POST /api/sessions.masterContext`: 20~4000자
- `POST /api/chat.message`: 1~2000자
- `POST /api/tools/search.sessionId`: `^sess_[0-9A-HJKMNP-TV-Z]{26}$`
- `POST /api/tools/search.query`: 2~300자
- `POST /api/tools/search.topK`: 1~10 (기본값 5)
- `POST /api/tools/transform.sessionId`: `^sess_[0-9A-HJKMNP-TV-Z]{26}$`
- `POST /api/tools/transform.text`: 1~5000자
- `POST /api/tools/transform.targetFormat`: `summary | outline | presentation_script`
- 문자열 길이 검증 공통 규칙(요청 입력):
  - 대상: `masterContext`, `message`, `query`, `text`
  - `trim()` 적용 후 길이를 검사한다.
  - 길이 단위는 Unicode code point 기준(UTF-8 byte 길이 아님)으로 계산한다.
  - `trim()` 결과 빈 문자열이면 최소 길이 미달로 `422` + `VALIDATION_ERROR` 처리한다.

### 6.5 `turn_id` 생성/전파 규칙
- 생성 시점: `POST /api/chat` 요청 수신 직후 턴 시작 시 생성
- 포맷: ULID 문자열(`turn_<ulid>`)
- 전파 규칙:
  - 동일 턴에서 발생한 `messages`, `tool_executions`, `decision_traces`, SSE 이벤트(`token/tool/message/error/done`)에 동일 `turnId` 사용
  - 응답 파싱/디버그/회귀테스트는 `turnId`를 기준으로 상호 매칭

### 6.6 RouteDecision 유효성 규칙
- `nextAction=CALL_TOOL`
  - `allowedTools.length >= 1` 필수
  - `allowedTools`는 `search | transform`만 허용
- `nextAction=DIRECT_ANSWER | ASK_CLARIFY | REFUSE`
  - `allowedTools=[]` 필수
- `nextAction=ASK_CLARIFY`
  - `clarifyQuestion` 필수(1~300자)
- `nextAction=REFUSE`
  - `refuseReason` 필수(1~200자)
- `confidence` 정책
  - `confidence < 0.55`면 서버 후처리에서 `ASK_CLARIFY` 강제
  - 예외: `forceSourceMode=FORCED`이고 서버 강제 정책으로 `CALL_TOOL(search)`가 확정된 경우, 첫 검색 시도 보장을 위해 confidence fallback을 적용하지 않는다.

### 6.7 `needsSources` 동작 규칙
- 입력: `POST /api/chat.clientOptions.needsSources` (기본 `false`)
- `needsSources=true`일 때:
  - 아래 강제 대상은 `CALL_TOOL(search)` 우선 시도
    - 사실 단정/검증 요청
    - 최신 정보/통계/수치 요청
    - 출처/근거/레퍼런스 명시 요청
    - 비교/평가 요청 중 근거 필요 항목
  - 아래 비강제 대상은 search 강제 제외
    - 순수 텍스트 변환(`transform`)
    - 정책상 거절(`REFUSE`)
    - 개인 의견/창작 요청
  - 강제 대상 요청:
    - 라우팅 후처리 우선순위:
      - `CALL_TOOL(search)` 강제 정책을 confidence fallback보다 먼저 적용한다.
      - 강제 정책으로 확정된 `CALL_TOOL(search)`는 low-confidence라 하더라도 첫 도구 시도 전 `ASK_CLARIFY`로 대체하지 않는다.
      - `REFUSE`를 제외한 라우팅 결과(`DIRECT_ANSWER`, `ASK_CLARIFY`, `CALL_TOOL(transform)` 등)는 강제 정책 단계에서 `CALL_TOOL(search)`로 승격한다.
    - 최종 `event: message` payload에 `sources` 배열 필수
    - 유효 출처가 없으면 "출처 부족"을 명시하고 `ASK_CLARIFY`로 종료
    - 유효 출처 기준은 `7.3.1 sources 아이템 스키마`를 따른다.
    - 출처 정규화 규칙:
      - 각 항목의 `title/url/source`는 `trim()` 후 평가한다.
      - 스키마 위반 항목은 제거(drop)한다.
      - 중복 `url`은 첫 항목만 유지한다.
    - 정규화 후 `sources.length=0`이면 `ASK_CLARIFY`로 종료한다.
    - 이 규칙은 `5.3`의 연속 실패 fallback보다 우선한다(강제 대상에서는 `DIRECT_ANSWER` fallback 금지)
  - 비강제 대상 요청:
    - `sources`는 선택 필드(생략 가능)
    - 스키마 위반/중복 항목은 제거하고, 정규화 결과가 0개면 `sources` 필드를 생략한다.
- `needsSources=false`일 때:
  - `sources` 필드는 생략 가능
  - `forceSourceMode`는 `NOT_FORCED`로 고정한다.
  - 키워드 기반 강제 대상 판정 알고리즘(`6.7` 하단)은 실행하지 않는다.
- 강제 대상 판정 알고리즘(고정, `needsSources=true`에만 적용):
  - 실행 시점: `planNextAction` 이전(요청 진입 후 1회) 수행하며 `routeDecision` 값을 참조하지 않는다.
  - 입력 정규화:
    - `trim()` 적용
    - Unicode NFKC 정규화
    - 연속 공백을 1칸으로 축약
    - 영문은 소문자로 변환
  - 키워드 매칭 기준(고정):
    - 모든 키워드는 정규화된 `message` 문자열에 대해 부분문자열(`includes`) 매칭으로 판정한다.
    - 문장부호/기호는 제거하지 않는다.
  - 판정 순서(위에서 아래로 최초 매치 1회 적용):
    - 1순위 비강제: 요청이 `11.2 REFUSE 사전 판정 규칙` 대상이면 비강제.
    - 2순위 강제: 아래 "출처 명시 요구" 키워드가 1개 이상 포함되면 강제.
      - `출처`, `근거`, `레퍼런스`, `참고문헌`, `citation`, `source`, `링크`
    - 3순위 비강제: 아래 "변환 중심 요청" 키워드가 1개 이상 포함되고 2순위 키워드가 없으면 비강제.
      - `요약`, `개요`, `발표 대본`, `형식`, `문체`, `정리`, `변환`, `다듬어`
    - 4순위 강제: 아래 "사실/최신/검증" 키워드가 1개 이상 포함되면 강제.
      - `최신`, `오늘`, `최근`, `통계`, `수치`, `비율`, `퍼센트`, `몇 명`, `공식 발표`, `팩트체크`, `검증`, `비교`
    - 5순위 비강제: 위 조건에 모두 해당하지 않으면 비강제.

### 6.8 ID/시간 포맷 규칙
- `sessionId`: `sess_<ulid>`
- `turnId`: `turn_<ulid>`
- `toolCallId`: `tool_<ulid>`
- `requestId`: `req_<ulid>`
- `createdAt`/`updatedAt`: UTC ISO 8601 문자열
- `latencyMs`: 정수 밀리초(ms)
- ID 검증 정규식(고정):
  - `sessionId`: `^sess_[0-9A-HJKMNP-TV-Z]{26}$`
  - `turnId`: `^turn_[0-9A-HJKMNP-TV-Z]{26}$`
  - `toolCallId`: `^tool_[0-9A-HJKMNP-TV-Z]{26}$`
  - `requestId`: `^req_[0-9A-HJKMNP-TV-Z]{26}$`
- 대소문자 정책:
  - 서버가 생성하는 ID(`sessionId`, `turnId`, `toolCallId`, `requestId`)는 대문자 ULID를 사용한다.
  - 입력 ID는 자동 대소문자 정규화(upper/lower 변환)하지 않는다.
  - 소문자/혼합 대소문자 ID 입력은 정규식 불일치로 `422` + `VALIDATION_ERROR` 처리한다.

### 6.9 `requestId` 생성/전파 규칙
- 생성 시점: 각 HTTP 요청 수신 직후(라우트 핸들러 진입 시점) 1회 생성
- 포맷: `req_<ulid>` (`^req_[0-9A-HJKMNP-TV-Z]{26}$`)
- 전파 규칙:
  - 모든 HTTP 응답(성공/에러, SSE handshake 포함)에 `x-request-id` 헤더를 포함한다.
  - JSON 에러 응답에서는 `error.requestId` 필드를 필수로 포함한다.
  - 로그 기록 시 동일 `requestId`를 필수로 포함한다.
- 입력 헤더 처리:
  - 클라이언트가 전달한 `x-request-id` 값은 신뢰하지 않고 서버 생성값으로 덮어쓴다.

### 6.10 `reasonSummary` 정규화 규칙(고정)
- 대상: `decision_traces.reason_summary`, `event: message.debug.reasonSummary`
- 생성 단계:
  - 서버 템플릿 후처리 결과에 `trim()` 적용
  - Unicode code point 기준 최대 200자로 절단
- 금지/대체 규칙:
  - 빈 문자열이 되면 고정 문구 `"판단 요약을 생성하지 못했습니다."`로 대체
  - 줄바꿈(`\r`, `\n`)은 공백 1칸으로 정규화
  - 프롬프트/내부 추론 문자열 탐지 시 해당 매치 구간은 `[REDACTED_REASON]`으로 치환
- 탐지 패턴(대소문자 무시, 고정):
  - `system prompt`
  - `developer message`
  - `chain[- ]of[- ]thought|cot`
  - `internal reasoning`
  - `내부 추론|사고 과정 원문`
- 적용 순서(고정):
  - 패턴 탐지/치환 -> 줄바꿈 정규화 -> `trim()` -> 200자 절단 -> 빈 문자열 대체

## 7. API 계약

### 7.1 `POST /api/sessions`
- Request
```json
{
  "masterContext": "이번 과제는 AI 오케스트레이션 MVP 구현이며, 표절 없이 과정 중심으로 작성해야 한다."
}
```
- Response
```json
{
  "sessionId": "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
  "masterContextSummary": "AI 오케스트레이션 MVP 구현, 과정 중심 작성",
  "createdAt": "2026-03-07T10:00:00.000Z"
}
```
- 응답 필드 규칙
  - `masterContextSummary`는 항상 non-null 문자열로 반환한다.
  - 요약 생성 실패 시 `masterContext`를 `trim()`한 뒤 Unicode code point 기준 앞 120자로 절단해 대체한다.
  - 위 대체 문자열에는 말줄임표(`...`)를 자동 추가하지 않는다.
- 저장 원자성/실패 전파 규칙(고정)
  - `sessions` + `master_contexts` 생성은 단일 트랜잭션으로 처리한다.
  - 트랜잭션 중간 실패 시 두 테이블 변경을 모두 롤백한다(부분 생성 금지).
  - 실패 응답은 HTTP `500` + `INTERNAL_SERVER_ERROR` 공통 에러 스키마를 사용한다.

### 7.2 `GET /api/sessions/{sessionId}`
- 목적: 세션 재진입 시 `MasterContext`/요약 복구
- Response
```json
{
  "sessionId": "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
  "masterContext": "이번 과제는 AI 오케스트레이션 MVP 구현이며, 표절 없이 과정 중심으로 작성해야 한다.",
  "masterContextSummary": "AI 오케스트레이션 MVP 구현, 과정 중심 작성",
  "createdAt": "2026-03-07T10:00:00.000Z"
}
```
- 응답 필드 규칙
  - `masterContextSummary`는 `POST /api/sessions`와 동일하게 항상 non-null 문자열을 반환한다.

### 7.3 `POST /api/chat`
- Request
```json
{
  "sessionId": "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
  "message": "관련 자료 찾아줘",
  "clientOptions": {
    "needsSources": true,
    "debug": false
  }
}
```
- 규칙
  - `clientOptions` 생략 가능
  - `clientOptions.needsSources` 기본값은 `false`
  - `clientOptions.debug` 기본값은 `false`
  - `sessionId` 누락/빈값은 pre-stream 단계에서 `422` JSON 에러(`code: VALIDATION_ERROR`) 반환
  - `sessionId` 형식 불일치(정규식 위반)는 pre-stream 단계에서 `422` JSON 에러(`code: VALIDATION_ERROR`) 반환
  - `sessionId` 형식은 유효하지만 리소스가 없으면 pre-stream 단계에서 `404` JSON 에러(`code: SESSION_NOT_FOUND`) 반환
  - 동일 `sessionId`에 대해 in-stream `/api/chat` 요청이 이미 진행 중이면 새 요청은 pre-stream `409` JSON 에러(`code: SESSION_BUSY`) 반환
  - `SESSION_BUSY` 판정 범위는 동일 Node.js 프로세스(단일 인스턴스) 내 in-flight 상태 기준
  - 멀티 인스턴스 분산 락은 MVP 비범위(추후 확장)
  - in-flight 해제 시점: `event: done` 전송 완료, 스트림 예외 종료, 클라이언트 연결 종료 중 먼저 발생한 시점
  - 클라이언트 연결 종료 처리:
    - 서버는 `AbortController` 신호를 그래프/도구 실행에 전파해 중단을 시도한다.
    - 도구 어댑터(`SearchPort.search/transform`) 호출에도 동일 abort 신호를 전달한다.
    - abort 감지 이후 추가 `tool`/`message` 이벤트 생성은 금지한다.
    - transport 종료로 `done` 전송이 불가능한 경우에도 in-flight 상태는 반드시 해제한다.
  - 에러 전송 규칙:
    - 스트림 시작 전 검증/인증 실패는 HTTP JSON 에러로 반환(`4xx/5xx`, SSE 미시작)
    - 스트림 시작 후 **복구 가능한 오류(recoverable)** 는 `event: tool(phase=error)`로만 전송하고 그래프를 계속 진행
    - 스트림 시작 후 **복구 불가능 오류(unrecoverable)** 는 SSE `event:error` + `event:done(ok=false)`로 종료(HTTP 상태 `200`)
      - `TOOL_EXECUTION_ERROR` 승격 조건:
        - 도구 노드 레벨 예외로 그래프 진행(재시도/대체 응답)이 불가능해 턴 종료가 필요한 상태
        - `toolCallId` 귀속 가능 여부와 무관하게 위 조건을 만족하면 승격 가능
    - 단, 클라이언트 연결 종료/transport 종료 예외는 `7.7.3 SSE 종료 규칙`을 따른다
- `sessionId` 형식 검증 적용 범위:
  - `POST /api/chat`
  - `GET /api/sessions/{sessionId}`
  - `GET /api/sessions/{sessionId}/reasoning-traces`
  - `POST /api/tools/search`
  - `POST /api/tools/transform`
  - 위 엔드포인트에서 정규식 불일치는 모두 `422` + `VALIDATION_ERROR` 처리
- Response
  - `text/event-stream`
  - 이벤트 타입: `token`, `tool`, `message`, `error`, `done`

#### 7.3.1 SSE 이벤트 payload 계약(고정)
- `event: token`
```json
{ "turnId": "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M", "delta": "부분 텍스트" }
```
- 전송 규칙:
  - 실제 모델 생성 중 발생하는 delta를 순서대로 전송하는 것을 우선한다.
  - 단, 모델 스트리밍이 없는 경로에서는 최종 텍스트 전체를 단일 `token` 이벤트로 전송할 수 있다.
  - 최종 `event: message.text`는 누적 완료된 전체 텍스트와 일치해야 한다.
- `event: tool`
```json
{
  "turnId": "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M",
  "toolCallId": "tool_01HW8K6M2K4VQX3D4N0Y7AZ9HS",
  "phase": "start",
  "toolName": "search",
  "args": { "query": "langgraph", "topK": 5 }
}
```
- `event: tool` (성공)
```json
{
  "turnId": "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M",
  "toolCallId": "tool_01HW8K6M2K4VQX3D4N0Y7AZ9HS",
  "phase": "success",
  "toolName": "search",
  "latencyMs": 420
}
```
- `event: tool` (실패)
```json
{
  "turnId": "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M",
  "toolCallId": "tool_01HW8K6M2K4VQX3D4N0Y7AZ9HS",
  "phase": "error",
  "toolName": "search",
  "errorCode": "TOOL_TIMEOUT",
  "message": "도구 호출 시간이 초과되었습니다."
}
```
- `event: message`
```json
{
  "turnId": "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M",
  "text": "최종 응답 텍스트",
  "nextAction": "CALL_TOOL",
  "sources": [
    { "title": "문서 제목", "url": "https://example.com/doc", "source": "official-doc" }
  ]
}
```
- `event: message` 필드 규칙
  - `sources`는 선택 필드
  - 단, `needsSources=true` AND "강제 대상" 요청에서는 `sources.length >= 1` 또는 `ASK_CLARIFY` fallback 중 하나를 만족해야 함
  - `transform`/`REFUSE`/개인의견·창작 요청에서는 `sources` 없이도 유효
- `sources` 아이템 스키마(고정)
  - `title`: 문자열, `trim()` 기준 1~120자
  - `url`: 절대 URL, `http|https` 스킴만 허용
  - `source`: 문자열, 1~40자, 정규식 `^[a-z0-9_-]+$`
  - 검색 도구 내부 결과에는 위 필드 외 `bodyText`를 포함할 수 있으며, 이는 최종 답변 생성용 내부 데이터로 사용한다.
- `sources` 배열 규칙
  - 최대 5개
  - 동일 `url` 문자열 중복 금지
  - "유효 출처"는 위 아이템 스키마를 만족하는 항목으로 정의한다.
  - 정규화/중복 제거 후 6개 이상이면 **입력 순서 기준 앞에서 5개만 유지**한다.
- `event: tool` 필드 규칙
  - `phase=start`에서 `args`는 `debug=true`일 때 필수, `debug=false`일 때 선택
  - `phase=success|error`에서는 `args` 생략 가능
- SSE 이벤트 타입별 필수 필드(고정)
  - `token`: `turnId`, `delta`
  - `tool`: `turnId`, `toolCallId`, `phase`, `toolName`
    - `phase=start`면 `args`는 `debug=true`일 때 필수
    - `phase=success`면 `latencyMs` 필수
    - `phase=error`면 `errorCode`, `message` 필수
  - `message`: `turnId`, `text`, `nextAction`
  - `error`: `turnId`, `code`, `message`
  - `done`: `turnId`, `ok`, `latencyMs` (`ok=false`면 `errorCode` 추가 필수)
- SSE payload 엄격성 규칙(고정)
  - `token|tool|error|done` 이벤트는 정의된 필드 외 top-level 필드를 허용하지 않는다.
  - `message` 이벤트의 top-level 허용 필드는 `turnId|text|nextAction|sources|debug`로 제한한다.
  - `message.debug` 객체 허용 필드는 `traceId|reasonSummary|requestId`로 제한한다.
  - `debug=true`일 때 `event: message.debug.requestId`는 필수이며, 응답 헤더 `x-request-id`와 동일해야 한다.
- `event: error`
```json
{ "turnId": "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M", "code": "MODEL_PROVIDER_ERROR", "message": "모델 공급자 오류로 요청을 완료하지 못했습니다." }
```
- `event: done`
```json
{ "turnId": "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M", "ok": true, "latencyMs": 1240 }
```
- `event: done` 필드 규칙
  - 공통 필수: `turnId`, `ok`, `latencyMs`
  - `latencyMs` 측정 구간: 서버가 요청 본문 수신을 완료한 시점(`t0`)부터 `event: done` payload 직렬화 직전 시점(`t_done`)까지
  - `latencyMs` 계산식: `max(0, floor(t_done - t0))`
  - `ok=true`:
    - `errorCode` 필드 금지
  - `ok=false`:
    - `errorCode` 필수
    - 허용 값: `MODEL_PROVIDER_ERROR | INTERNAL_SERVER_ERROR | TOOL_EXECUTION_ERROR`

#### 7.3.2 Tool 이벤트 수명주기 규칙
- 정상 연결이 유지된 in-stream 요청에서 각 `toolCallId`는 `start -> (success | error)` 순서를 정확히 1회 보장
- `success`와 `error`는 상호 배타적
- 동일 턴에서 다중 tool call 가능하므로 UI는 `(turnId, toolCallId)`를 키로 상태 관리
- 정상 연결이 유지된 요청에서는 `done` 이벤트 전에 시작된 모든 `toolCallId`가 종료 이벤트(`success|error`)를 가져야 함
- 클라이언트 연결 종료/abort 케이스에서는 `start` 이후 종료 이벤트 생략을 허용한다

#### 7.3.3 `debug` 옵션 동작 규칙
- `debug=false`(기본):
  - SSE 표준 필드만 전송(`token/tool/message/error/done`)
  - `tool.args`, 라우팅 사유 상세, 내부 trace 식별자는 생략 가능
- `debug=true`:
  - `tool.args` 포함
  - `event: message`에 `debug` 객체를 포함한다.
  - `debug.requestId`는 필수이며, 요청의 `x-request-id`와 동일해야 한다.
```json
{
  "debug": {
    "requestId": "req_01HW8KAA7S9P3Y2D4Q6N1M8R5T",
    "traceId": "trace_01HW8K9...",
    "reasonSummary": "검색이 필요한 질의로 판단"
  }
}
```

#### 7.3.4 SSE 이벤트 cardinality 규칙
- 적용 범위:
  - 본 규칙은 SSE 스트림이 실제 시작된 요청(in-stream)에만 적용한다.
  - pre-stream 오류(`4xx/5xx` JSON 응답)에는 적용하지 않는다.
- 각 in-stream `/api/chat` 요청(= `turnId`) 기준:
  - `event: token` -> `0..N`회(비스트리밍/즉시 응답 경로에서는 0회 허용)
  - `event: tool` -> 각 `toolCallId`별 `1..2`회
    - 정상 연결이 유지된 요청에서는 정확히 2회(`start` + `success|error`)
    - 클라이언트 연결 종료/abort 케이스에서는 `start`만 관측되어 1회일 수 있음
  - `event: message` -> `0..1`회
    - 정상 종료(`event: done.ok=true`)에서는 정확히 1회
    - 복구 불가능 오류 종료(`event: done.ok=false`)에서는 0회
  - `event: error` -> `0..1`회
    - `event: done.ok=false`인 경우 `event: error`는 정확히 1회
    - `event: done.ok=true`인 경우 `event: error`는 0회
    - `event:error.code`는 `MODEL_PROVIDER_ERROR | INTERNAL_SERVER_ERROR | TOOL_EXECUTION_ERROR`만 허용
    - `TOOL_TIMEOUT`/도구 개별 실패는 `event: tool(phase=error)`로만 전송
  - `event: done` -> `0..1`회
    - 정상 연결이 유지된 in-stream 요청에서는 정확히 1회(항상 마지막 이벤트)
    - 클라이언트 연결 종료로 transport가 닫힌 경우 0회 허용

#### 7.3.5 최종 응답 커밋/전송 순서 규칙(고정)
- 적용 대상: `/api/chat` in-stream 요청 중 **`event: message` 전송 후보가 있는 종료 경로**
- 순서:
  1. 최종 응답 텍스트/도구 실행 결과를 계산한다.
  2. `10.4`의 턴 종료 트랜잭션(`messages/tool_executions/decision_traces/sessions`)을 commit 시도한다.
  3. commit 성공 시에만 `event: message`를 전송하고, 이어서 `event: done(ok=true)`를 전송한다.
  4. commit 실패 시 `event: error(code=INTERNAL_SERVER_ERROR)` 후 `event: done(ok=false)`로 종료한다.
- 비적용 경로:
  - `MODEL_PROVIDER_ERROR`/노드 레벨 `TOOL_EXECUTION_ERROR` 등 `event:error`로 즉시 종료되는 경로는 본 규칙 대신 `7.7.3`을 우선 적용한다.
- 금지 규칙:
  - commit 실패 경로에서 `event: message` 전송 금지
  - `event: done`은 항상 마지막 이벤트
- 부연:
  - `event: token`은 임시 표시용이며 commit 성공을 보장하지 않는다.

### 7.4 `POST /api/tools/search`
- Headers
```http
x-internal-tool-token: <INTERNAL_TOOL_TOKEN>
```
- Request
```json
{
  "sessionId": "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
  "query": "LangGraph orchestration",
  "topK": 5
}
```
- Response
```json
{
  "items": [
    {
      "title": "문서 제목",
      "snippet": "요약",
      "source": "official-doc",
      "url": "https://example.com/doc"
    }
  ]
}
```
- 검증/에러 규칙
  - `sessionId` 누락/빈값은 `422` + `VALIDATION_ERROR`
  - `sessionId` 형식 불일치(정규식 위반)는 `422` + `VALIDATION_ERROR`
  - `sessionId` 형식은 유효하지만 리소스가 없으면 `404` + `SESSION_NOT_FOUND`

### 7.5 `POST /api/tools/transform`
- Headers
```http
x-internal-tool-token: <INTERNAL_TOOL_TOKEN>
```
- Request
```json
{
  "sessionId": "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P",
  "text": "원문",
  "targetFormat": "presentation_script"
}
```
- Response
```json
{
  "resultText": "변환 결과",
  "appliedRules": ["format=presentation_script", "tone=neutral"]
}
```
- 검증/에러 규칙
  - `sessionId` 누락/빈값은 `422` + `VALIDATION_ERROR`
  - `sessionId` 형식 불일치(정규식 위반)는 `422` + `VALIDATION_ERROR`
  - `sessionId` 형식은 유효하지만 리소스가 없으면 `404` + `SESSION_NOT_FOUND`

### 7.6 `GET /api/sessions/{sessionId}/reasoning-traces`
- 목적: "사고 과정 보기" 패널 데이터 제공.
- Query
  - `limit` (선택, 정수, 기본 20, 최소 1, 최대 100)
  - `cursor` (선택, 이전 응답의 `nextCursor`; `base64url(JSON UTF-8, no padding)` 문자열)
- 정렬
  - 기본 `createdAt DESC`
- 안정 정렬 tie-break
  - `createdAt DESC, turnId DESC`
- `items[].toolExecutions` 정렬 규칙(고정)
  - 각 아이템 내부 `toolExecutions` 배열은 `tool_executions.created_at ASC, tool_call_id ASC` 순서로 직렬화한다.
  - 페이지네이션 규칙
  - 더 이상 다음 페이지가 없으면 `nextCursor: null`
  - 결과가 0건이면 항상 `{ "nextCursor": null, "items": [] }`를 반환한다.
  - `limit`가 정수가 아니거나 범위(1~100)를 벗어나면 `422` + `error.code: VALIDATION_ERROR`
  - 잘못된 `cursor` 형식/복호화 실패 시 `400` + `error.code: INVALID_CURSOR`
  - `cursor`가 빈 문자열(`?cursor=`)이면 `400` + `error.code: INVALID_CURSOR`
  - `cursor`는 base64url 문자셋(`A-Z a-z 0-9 - _`)만 허용하며 `=` padding은 허용하지 않는다.
  - `cursor` JSON 스키마(고정): `{ "v": 1, "createdAt": "<ISO8601 UTC>", "turnId": "<turnId>" }`
    - `v`가 없거나 `1`이 아니면 `400` + `INVALID_CURSOR`
    - `createdAt`/`turnId`가 스키마 불일치이면 `400` + `INVALID_CURSOR`
  - `cursor`는 `createdAt + turnId`를 인코딩하고 조회 조건은 아래를 사용:
    - `(createdAt < cursor.createdAt) OR (createdAt = cursor.createdAt AND turnId < cursor.turnId)`
  - 조회/응답 규칙(고정):
    - 서버는 내부적으로 `limit+1`건을 조회해 다음 페이지 존재 여부를 판정한다.
    - 조회 결과가 `<= limit`이면 조회 결과 전체를 `items`로 반환하고 `nextCursor=null`.
    - 조회 결과가 `limit+1`이면 앞 `limit`건만 `items`로 반환하고, `items` 마지막 원소의 `(createdAt, turnId)`를 인코딩해 `nextCursor`로 반환한다.
- Response
```json
{
  "nextCursor": "eyJ2IjoxLCJjcmVhdGVkQXQiOiIyMDI2LTAzLTA3VDEwOjEwOjAwLjAwMFoiLCJ0dXJuSWQiOiJ0dXJuXzAxSFc4SzYifQ",
  "items": [
    {
      "turnId": "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M",
      "nextAction": "CALL_TOOL",
      "reasonSummary": "출처 요청이 있어 검색 도구가 필요함",
      "allowedTools": ["search"],
      "toolExecutions": [
        {
          "toolCallId": "tool_01HW8K6M2K4VQX3D4N0Y7AZ9HS",
          "toolName": "search",
          "ok": true,
          "latencyMs": 420
        }
      ],
      "createdAt": "2026-03-07T10:20:00.000Z"
    }
  ]
}
```

### 7.7 API 에러 응답 계약(공통)
- 공통 에러 스키마
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "요청 파라미터가 올바르지 않습니다.",
    "requestId": "req_01HW8KAA7S9P3Y2D4Q6N1M8R5T",
    "details": {
      "fields": [{ "path": "message", "reason": "minLength" }]
    }
  }
}
```
- `error.requestId` 규칙
  - JSON 에러 응답에서 `error.requestId`는 필수다.
  - 값은 응답 헤더 `x-request-id`와 동일해야 한다.
- `error.details` 규칙
  - `details`는 선택 필드이며, 부가 정보가 없으면 생략한다.
  - `VALIDATION_ERROR`:
    - `details.fields` 배열 사용
    - 항목 스키마: `{ path: string, reason: string }`
  - `INVALID_CURSOR`:
    - `details.cursor`에 원본 cursor(최대 120자 절단) 포함 가능
  - 그 외 코드:
    - 기본적으로 `details` 생략(민감정보/내부 스택 노출 금지)
- 상태 코드 규칙
  - `400`: 잘못된 요청(JSON 파싱 실패, 잘못된 cursor)
  - `401`: 내부 전용 API 인증 실패
  - `409`: 동일 세션의 동시 채팅 요청 충돌
  - `404`: 없는 세션/리소스
  - `422`: 스키마 검증 실패(zod validation error, 필수 필드 누락 포함)
  - `502`: 외부 모델/도구 공급자 오류
  - `504`: 도구 호출 타임아웃
  - `500`: 내부 서버 오류(예상치 못한 예외)
- 적용 엔드포인트:
  - 기본: `POST /api/sessions`, `GET /api/sessions/{sessionId}`, `POST /api/tools/*`, `GET /api/sessions/{sessionId}/reasoning-traces`
  - `POST /api/chat`는 **스트림 시작 전(pre-stream)** 단계에만 동일 규칙 적용

### 7.7.3 SSE 종료 규칙
- 정상/오류와 무관하게 **연결이 유지된** 각 `/api/chat` in-stream 요청당 `event: done`은 정확히 1회 전송
- 복구 가능한 오류(도구 실패)는 `event: tool(phase=error)` 후 진행 가능
- 복구 불가능 오류는 `event: error` 전송 후 `event: done`(`ok=false`) 전송
- 복구 불가능 오류 경로에서 `event: error`는 정확히 1회 전송한다
- 복구 불가능 오류 경로에서는 `event: message`를 전송하지 않는다
- 복구 불가능 오류가 도구 실행 중 발생한 경우 `event: tool(phase=error)` 후 `event:error`가 이어질 수 있다.
- `event:error` 코드 정책:
  - 허용 코드: `MODEL_PROVIDER_ERROR | INTERNAL_SERVER_ERROR | TOOL_EXECUTION_ERROR`
  - `TOOL_TIMEOUT`은 복구 가능한 도구 실패로 간주하며 `event: tool(phase=error)`에만 사용
  - 일반 도구 호출 실패(특정 `toolCallId`로 귀속 가능)는 `event: tool(phase=error)` 경로를 우선 사용
  - `TOOL_EXECUTION_ERROR`는 노드 레벨 예외(진행 불가)일 때 `event:error`로 사용
- 도구 실패 분류 매트릭스(고정):
  - recoverable -> `event: tool(phase=error)` 후 그래프 진행:
    - `TOOL_TIMEOUT`(특정 `toolCallId` 귀속 가능)
    - 외부 API `5xx`/네트워크 오류(특정 `toolCallId` 귀속 가능)
    - 도구 결과 스키마 검증 실패(특정 `toolCallId` 귀속 가능)
  - unrecoverable -> `event:error(code=TOOL_EXECUTION_ERROR)` 후 `done(ok=false)`:
    - 도구 노드 내부 예외로 재시도/대체응답 경로 선택이 불가능
    - `toolCallId` 귀속 가능한 실패에서도 진행 불가면 승격 가능
- `done.ok` 판정 기준:
  - `ok=true`: 사용자에게 최종 응답 `event: message`를 성공적으로 전달한 경우(일반 경로 + recoverable tool 오류 후 fallback 포함)
  - `ok=false`: 복구 불가능 오류로 `event: message` 없이 종료한 경우
- `done` 이벤트 이후 서버는 스트림을 종료한다
- 본 규칙은 **스트림 시작 이후(in-stream)** 에만 적용한다
- 클라이언트 연결 종료로 transport가 닫힌 경우 `done` 미전송 종료를 허용한다(서버는 in-flight 해제 및 abort 전파 수행)
- `done` 오류 예시
```json
{ "turnId": "turn_01HW8K6K8C8Q4A9R9N4V2N7Q3M", "ok": false, "latencyMs": 980, "errorCode": "MODEL_PROVIDER_ERROR" }
```

### 7.7.1 에러 코드 카탈로그(고정 enum)
- `VALIDATION_ERROR`
- `JSON_PARSE_ERROR`
- `INVALID_CURSOR`
- `SESSION_BUSY`
- `SESSION_NOT_FOUND`
- `UNAUTHORIZED_INTERNAL_ACCESS`
- `TOOL_TIMEOUT`
- `TOOL_EXECUTION_ERROR`
- `MODEL_PROVIDER_ERROR`
- `INTERNAL_SERVER_ERROR`

### 7.7.2 에러 코드-상태코드 매핑
- `VALIDATION_ERROR` -> `422`
- `JSON_PARSE_ERROR` -> `400`
- `INVALID_CURSOR` -> `400`
- `SESSION_BUSY` -> `409`
- `SESSION_NOT_FOUND` -> `404`
- `UNAUTHORIZED_INTERNAL_ACCESS` -> `401`
- `TOOL_TIMEOUT` -> `504`
- `TOOL_EXECUTION_ERROR` -> `502`
- `MODEL_PROVIDER_ERROR` -> `502`
- `INTERNAL_SERVER_ERROR` -> `500`
- 적용 범위 고정:
  - 본 매핑은 HTTP JSON 에러 응답 경로(`POST /api/sessions`, `GET /api/sessions/{sessionId}`, `POST /api/tools/*`, `GET /api/sessions/{sessionId}/reasoning-traces`, `POST /api/chat` pre-stream)에만 적용한다.
  - `/api/chat` in-stream에서는 HTTP 상태를 `200`으로 유지하고, `TOOL_TIMEOUT`은 `event: tool(phase=error)`의 `errorCode`로만 전송한다.

### 7.8 내부 전용 툴 API 보호 규칙
- 대상: `POST /api/tools/search`, `POST /api/tools/transform`
- 인증 방식:
  - 내부 호출 주체(운영 점검/테스트 도구/백오피스)만 `x-internal-tool-token` 헤더를 포함해 호출
  - 헤더 값은 `INTERNAL_TOOL_TOKEN` 환경변수와 일치해야 함
- 실행 경계(고정):
  - `/api/chat` 오케스트레이션 경로는 포트 어댑터를 직접 호출해 도구를 실행한다.
  - `/api/tools/*`는 내부 전용 보호 엔드포인트로 유지하며, 직접 호출 시에도 동일 인증 규칙을 적용한다.
- 검증 실패 응답:
  - `401` + 공통 에러 스키마(`code: UNAUTHORIZED_INTERNAL_ACCESS`)
- 처리 순서(고정):
  - 1단계: `x-internal-tool-token` 인증 검사
  - 2단계: 인증 성공 요청에 한해 요청 바디 스키마 검증
  - 인증 실패(`401`) 응답에서는 바디 검증 에러(`422`)를 함께 반환하지 않는다.

## 8. 도구 스펙

### 8.0 API DTO vs 도메인 인자 경계
- `/api/tools/*` 요청 DTO는 `sessionId`를 포함한다.
- 도메인 도구 실행 인자는 순수 도구 인자만 사용하고 `sessionId`를 포함하지 않는다.
- 매핑 규칙:
  - `/api/tools/search` DTO `{ sessionId, query, topK }` -> 도메인 `search` 인자 `{ query, topK }`
  - `/api/tools/transform` DTO `{ sessionId, text, targetFormat }` -> 도메인 `transform` 인자 `{ text, targetFormat }`
- `sessionId`는 세션 존재 검증, 권한 경계(내부 호출), 로그 상관관계 용도로만 사용한다.

### 8.1 `search`
- 목적: 자료/근거/논문/출처 요청 대응.
- 도메인 입력 스키마:
```ts
{
  query: string;
  topK?: number; // default 5
}
```
- 최소 구현: Tavily 검색 API 호출 결과를 상위 `topK`로 정리해 반환.

### 8.2 `transform`
- 목적: 입력 텍스트 포맷 변환.
- 도메인 입력 스키마:
```ts
{
  text: string;
  targetFormat: "summary" | "outline" | "presentation_script";
}
```
- 최소 구현: 규칙 기반 템플릿 변환(모델 호출 없이도 동작 가능).

## 9. UI 초기 스펙
- 경로: `/chat/[sessionId]`
- 기본 언어: 한국어(레이블/버튼/시스템 메시지 포함).
- 영역:
  - 상단: 세션 ID, `학습 맥락` 요약 토글.
  - 우측 패널: `사고 과정 보기` 토글 및 턴별 트레이스 리스트.
  - 본문: 메시지 리스트.
  - 하단: 입력창, 전송 버튼, `근거 필요` 체크박스.
- 상태 표시:
  - 스트리밍 중 `생성 중...`
  - 툴 실행 중 `자료 조회 중...`
- 디버그 모드일 때 tool 이벤트 + reasoning trace 상세 노출.
- `사고 과정 보기` 패널은 항목당 3줄/200자 제한으로 렌더링.
- 스트리밍 렌더링 규칙(고정):
  - `event: token` 수신 중에는 token을 누적해 임시 본문으로 표시한다.
  - `event: message` 수신 시 누적 token 버퍼를 폐기하고 `message.text`로 최종 본문을 원자적으로 교체한다.
  - token 누적값과 `message.text`가 불일치하면 `message.text`를 정답으로 간주하고 경고 로그를 1회 남긴다.

## 10. 저장/로그 스펙

### 10.1 SQLite 저장 구조 (확정)
- `sessions`
  - `id` (PK)
  - `consecutive_tool_failure_turns` (integer, NOT NULL, default 0)
  - `created_at`
  - `updated_at`
- `master_contexts`
  - `session_id` (PK, FK -> sessions.id)
  - `content`
  - `summary` (NOT NULL)
- `messages`
  - `id` (PK)
  - `session_id` (FK)
  - `turn_id` (index)
  - `role` (`user` | `ai` | `tool` | `system`)
  - `content`
  - `metadata` (JSON text)
  - `created_at`
- `tool_executions`
  - `id` (PK)
  - `session_id` (FK)
  - `turn_id` (index)
  - `tool_call_id` (unique)
  - `tool_name`
  - `args` (JSON text)
  - `result` (JSON text)
  - `ok` (boolean)
  - `latency_ms`
  - `created_at`
- `decision_traces`
  - `id` (PK)
  - `session_id` (FK)
  - `turn_id` (unique per assistant turn)
  - `next_action`
  - `reason_summary`
  - `allowed_tools` (JSON text)
  - `created_at`

### 10.1.1 시간 컬럼 저장 포맷 규칙(고정)
- 대상 컬럼: `sessions.created_at/updated_at`, `messages.created_at`, `tool_executions.created_at`, `decision_traces.created_at`
- 저장 타입: SQLite `TEXT`
- 저장 포맷: UTC ISO 8601(`YYYY-MM-DDTHH:mm:ss.SSSZ`)
- 정렬 전제:
  - 위 포맷 문자열의 사전식 정렬과 시간 정렬이 일치해야 한다.
- `updated_at` 갱신 규칙:
  - `sessions` 행이 갱신될 때마다 현재 UTC 시각으로 `updated_at`를 갱신한다.

### 10.1.2 `tool_executions` 저장 규칙(고정)
- `ok=true`:
  - `result`는 도구 정상 출력 JSON 객체를 문자열로 저장한다.
- `ok=false`:
  - `result`는 에러 객체 JSON 문자열로 저장한다.
  - 에러 객체 스키마: `{ "errorCode": string, "message": string }`
- `latency_ms`:
  - 항상 정수 `>= 0`
  - 타임아웃 실패 시 timeout 임계 시점까지의 경과시간(ms)을 저장한다.
  - 실행 전 단계에서 실패해 측정값이 없으면 `0`을 저장한다.
- `args`/`result`:
  - JSON text로 저장하며 직렬화 실패 시 DB 쓰기를 중단하고 요청을 실패 처리한다.
- 직렬화/DB 쓰기 실패 전파 규칙:
  - pre-stream 경로에서 발생 시 HTTP `500` + `INTERNAL_SERVER_ERROR` JSON 에러 반환
  - in-stream(`/api/chat`) 경로에서 발생 시 `event:error(code=INTERNAL_SERVER_ERROR)` 후 `event:done(ok=false)`로 종료
  - 위 실패는 recoverable로 취급하지 않으며, 동일 턴 내 재시도하지 않는다.

### 10.1.3 컬럼 제약/ID 생성 상세 규칙(고정)
- ID 생성:
  - `sessions.id`는 API `sessionId`와 동일 값(`sess_<ulid>`)을 저장한다.
  - `messages.id`, `tool_executions.id`, `decision_traces.id`는 서버가 대문자 ULID(26자, 정규식 `^[0-9A-HJKMNP-TV-Z]{26}$`)로 생성한다.
- `NOT NULL` 규칙:
  - 모든 PK/FK 컬럼은 `NOT NULL`
  - 시간 컬럼(`created_at`, `updated_at`)은 `NOT NULL`
  - `master_contexts.content`, `master_contexts.summary`, `messages.content`, `tool_executions.tool_name`, `tool_executions.args`, `tool_executions.result`, `decision_traces.next_action`, `decision_traces.reason_summary`, `decision_traces.allowed_tools`는 `NOT NULL`
- 기본값 규칙:
  - `sessions.consecutive_tool_failure_turns` 기본값 `0`
  - `messages.metadata`는 기본값 `'{}'`(JSON text)

### 10.2 최소 로그 필드
- `requestId`
- `sessionId`
- `nextAction`
- `toolName` (있을 때)
- `ok`
- `latencyMs`

### 10.3 SQLite 제약/인덱스 규칙
- FK 제약:
  - `master_contexts.session_id -> sessions.id`
  - `messages.session_id -> sessions.id`
  - `tool_executions.session_id -> sessions.id`
  - `decision_traces.session_id -> sessions.id`
- 삭제 규칙:
  - `sessions` 삭제 시 하위 테이블 레코드 `ON DELETE CASCADE`
- 유니크/체크:
  - `sessions.consecutive_tool_failure_turns >= 0` 체크
  - `decision_traces(turn_id)` unique
  - `tool_executions(tool_call_id)` unique
  - `tool_executions.ok IN (0,1)` 체크
  - `tool_executions.latency_ms >= 0` 체크
  - `messages.role` 체크(`user|ai|tool|system`)
  - 현재 애플리케이션 계층이 실제로 append 하는 역할은 `user|ai`
- 인덱스(최소):
  - `idx_messages_session_created_at (session_id, created_at)`
  - `idx_tool_exec_session_turn (session_id, turn_id)`
  - `idx_tool_exec_tool_call_id (tool_call_id)`
  - `idx_trace_session_created_turn (session_id, created_at, turn_id)`

### 10.4 `consecutiveToolFailureTurns` 저장/복원 규칙
- 로드:
  - `loadSessionContext`에서 `sessions.consecutive_tool_failure_turns` 값을 읽어 `ConversationState.consecutiveToolFailureTurns`로 주입한다.
- 갱신:
  - 턴 종료 시(`finalize`) 단일 트랜잭션으로 아래 write-set을 **조건부 insert/update** 형태로 원자적으로 반영한다.
    - `messages` insert
    - `tool_executions` insert
    - `decision_traces` insert
    - `sessions.consecutive_tool_failure_turns` update
    - `sessions.updated_at` update
  - 이번 턴이 도구 실패 종료(`ASK_CLARIFY` fallback)면 `min(prev+1, 2)`로 증가(상한 2)
  - 이번 턴이 도구 성공 또는 `CALL_TOOL` 비경로 정상 종료면 `0`으로 reset
  - 2차 fallback(`DIRECT_ANSWER`) 적용 턴도 종료 후 `0`으로 reset
  - 이번 턴이 복구 불가능 오류(`event: done.ok=false`)로 종료되면 값은 변경하지 않는다(유지)
  - 이번 턴이 클라이언트 연결 종료/abort로 끝나면 값은 변경하지 않는다(유지)
- 턴 저장 cardinality 규칙(고정):
  - 종료 상태별 write 매트릭스:
    - `done.ok=true` + commit 성공: `messages(user=1, ai=1)`, `tool_executions(start 발생 call 수만큼)`, `decision_traces=1`
    - `done.ok=false` + commit 성공(예: `MODEL_PROVIDER_ERROR`/`TOOL_EXECUTION_ERROR`): `messages(user=1, ai=0)`, `tool_executions(start 발생 call 수만큼)`, `decision_traces=0`
    - 연결 종료/abort 또는 트랜잭션 rollback: `messages=0`, `tool_executions=0`, `decision_traces=0`
  - `messages`:
    - 턴 종료 트랜잭션 commit 성공 턴에서 `role=user` 메시지는 정확히 1건 저장한다.
    - 턴 종료 트랜잭션 실패(롤백) 또는 연결 종료/abort 턴에서는 해당 턴의 `messages`를 저장하지 않는다(0건).
    - `done.ok=true` 턴에서 `role=ai` 메시지는 정확히 1건 저장한다.
    - `done.ok=false` 또는 연결 종료/abort 턴에서는 `role=ai` 메시지를 저장하지 않는다.
    - MVP에서는 `role=tool` 메시지를 저장하지 않는다(도구 실행 결과는 `tool_executions`로만 저장).
  - `tool_executions`:
    - 각 `toolCallId`당 정확히 1행 저장한다.
    - 저장 대상은 해당 턴에서 `event: tool(phase=start)`가 발생한 호출로 한정한다.
    - `event: tool(phase=start)` 미발생 호출은 저장하지 않는다.
    - 연결 종료/abort 또는 트랜잭션 rollback 턴에서는 저장하지 않는다(0행).
  - `decision_traces`:
    - `done.ok=true` 턴에서 정확히 1건 저장한다.
    - `done.ok=false` 또는 연결 종료/abort 턴에서는 저장하지 않는다.
- 롤백 규칙:
  - 위 트랜잭션 내 어느 단계에서라도 실패하면 전체 변경을 롤백한다(부분 반영 금지).
  - 롤백된 턴은 `10.1.2 직렬화/DB 쓰기 실패 전파 규칙`을 따른다.
- abort write-guard 규칙(고정):
  - `finalize`는 DB write-set 반영 전에 abort 신호를 재검사한다.
  - 트랜잭션 write 중에도 단계별 재검사를 수행하고 abort 감지 시 `REQUEST_ABORTED`로 롤백한다.
  - abort로 롤백된 턴은 `messages/tool_executions/decision_traces`를 저장하지 않는다.
- 동시성:
  - 같은 `sessionId`에 대한 갱신은 `BEGIN IMMEDIATE` 트랜잭션으로 직렬화한다.
- 전송 순서 연계 규칙:
  - `10.4` 트랜잭션 commit 완료 전에는 `event: message`를 전송하지 않는다(`7.3.5` 준수).

## 11. 보안/가드레일
- 서버 측 allowlist 재검증 없는 툴 실행 금지.
- 모든 툴 인자는 zod 검증 후 실행.
- 로그 저장 전 PII(이메일/전화번호) 마스킹.
- `/api/tools/*`는 내부 오케스트레이션 전용이며 `x-internal-tool-token` 검증 실패 시 차단한다.
- `REFUSE` 정책:
  - 제출용 답안 대필, 부정행위 조장 요청은 거절.
  - 일반적인 한국어 존댓말 톤으로 대안(개요, 힌트, 학습 가이드) 제공.
- 운영 전제:
  - `SESSION_BUSY` 정책 정확성을 위해 MVP 운영은 단일 Node.js 인스턴스(프로세스 1)로 제한한다.
  - 수평 확장(멀티 인스턴스) 시 분산 락/세션 조정 메커니즘 도입 전까지 `SESSION_BUSY` 보장을 주장하지 않는다.

### 11.1 PII 마스킹 규칙(고정)
- 적용 대상:
  - 애플리케이션 로그의 `message/content/tool.args/tool.result/error.details`
- 탐지 패턴(정규식):
  - 이메일: `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}`
  - 전화번호(대한민국): `(?:\\+82[- ]?)?0?1[0-9][- ]?\\d{3,4}[- ]?\\d{4}`
- 치환 규칙:
  - 이메일 -> `[REDACTED_EMAIL]`
  - 전화번호 -> `[REDACTED_PHONE]`
- 적용 순서:
  - 이메일 -> 전화번호 순으로 적용(중복 치환 방지)
- 운영 규칙:
  - 마스킹은 로그 기록 직전에 수행하며, 원문 PII를 로그에 남기지 않는다
  - 동일 문자열에 재적용해도 결과가 변하지 않아야 한다(idempotent)

### 11.2 REFUSE 사전 판정 규칙(고정)
- 목적:
  - `6.7`의 강제 대상 판정 1순위(비강제)에서 사용할 결정 가능한 규칙 제공
- 입력 정규화:
  - `6.7`과 동일한 정규화(`trim` + NFKC + 공백축약 + 영문 소문자) 사용
- 판정 규칙:
  - 아래 키워드 중 1개 이상 부분문자열(`includes`) 매치 시 `refusePrecheck=true`
  - 키워드: `답안 그대로`, `대필`, `컨닝`, `부정행위`, `제출용 작성`, `숙제 대신`, `리포트 대신 써줘`
  - 그 외는 `refusePrecheck=false`

## 12. 테스트 최소 세트
- 테스트 하네스: `vitest` + `@testing-library/react` + `supertest`(또는 Next Route Handler 호출 헬퍼).
- TDD 규칙:
  - RED: 유스케이스/어댑터 계약 테스트를 먼저 실패 상태로 작성.
  - GREEN: 최소 구현으로 테스트 통과.
  - REFACTOR: 인터페이스/코드 정리 후 회귀 테스트 통과 유지.
- API 키 부재 시 전략:
  - `APP_LLM_MODE=stub|live`로 LLM 어댑터를 명시적으로 선택(기본 `stub`).
  - `APP_SEARCH_MODE=stub|live`로 검색 어댑터를 명시적으로 선택(기본 `stub`).
  - `APP_LLM_MODE=live`일 때 `GEMINI_API_KEY` 필수.
  - `APP_SEARCH_MODE=live`일 때 `TAVILY_API_KEY` 필수.
  - 키가 없는데 `live` 설정이면 앱 시작 시 fail-fast로 종료.
  - CI 기본 파이프라인은 stub 모드에서 동작.
- 모드 설정 검증 케이스:
  - `APP_LLM_MODE`/`APP_SEARCH_MODE`가 허용 외 값이면 앱 시작 fail-fast 검증
  - 두 모드가 미설정(undefined)일 때 기본값 `stub` 적용 검증
- 선택 실행:
  - 실 API 연동 테스트는 키가 있을 때만 별도 태그(`integration:live`)로 실행.
- 품질 게이트(최소):
  - `domain` + `application` 라인 커버리지 80% 이상
  - 핵심 유스케이스 4종(`DIRECT_ANSWER`, `CALL_TOOL`, `ASK_CLARIFY`, `REFUSE`) 경로 테스트 100%
  - SSE 이벤트 계약(`token`, `tool`, `message`, `error`, `done`) 테스트 100%
- 성능 측정 체크(수동):
  - `2.2` 프로토콜(220요청, warm-up 20 제외, 유효 샘플 200, 동시성 1, 20세션 round-robin) 준수 여부 점검
  - `2.2` 워크로드 구성(시나리오 비율/`needsSources` 비율/길이 분포/세션별 10건) 준수 여부 점검
  - `stub/live` 각각 p95 첫 SSE 청크 시간 목표 충족 여부 기록
- 실행 명령(표준):
  - `pnpm test`: 단위 + 통합(stub 모드)
  - `pnpm test:coverage`: 커버리지 리포트 생성 및 임계치 검증
  - `pnpm test:live`: live 어댑터 통합 테스트(`integration:live` 태그)
- CI 실패 조건:
  - 테스트 실패 1건 이상
  - 커버리지 임계치 미달
  - SSE 계약 테스트 실패
- `CALL_TOOL`: "관련 논문 찾아줘" -> `search` 실행 -> 요약 응답.
- `DIRECT_ANSWER`: "이 개념 설명해줘" -> 도구 없이 답변.
- `ASK_CLARIFY`: "발표 대본으로 바꿔줘" + 원문 없음 -> 추가 질문.
- `REFUSE`: "숙제 답안 그대로 작성해줘" -> 거절 + 대안.
- recoverable 도구 실패(`TOOL_TIMEOUT`/귀속 가능한 실행 실패) -> fallback 메시지 확인.
- unrecoverable 오류(`MODEL_PROVIDER_ERROR`/`INTERNAL_SERVER_ERROR`/승격된 `TOOL_EXECUTION_ERROR`) -> `event:error` + `done(ok=false)` 종료 확인.
- 보안 케이스:
  - `x-internal-tool-token` 없이 `/api/tools/*` 호출 시 `401` 반환
  - 잘못된 `x-internal-tool-token`으로 `/api/tools/*` 호출 시 `401` 반환
- 입력 경계값 케이스:
  - `masterContext` 19자/20자/4000자/4001자
  - `message` 0자/1자/2000자/2001자
  - `search.topK` 0/1/10/11
  - `transform.text` 0자/1자/5000자/5001자
  - 공백-only 입력(`\"   \"`)이 `trim()` 후 최소 길이 미달로 `422` 처리되는지 검증
  - 멀티바이트 문자열(예: 한글/이모지) 길이 검증이 code point 기준으로 동작하는지 검증
- 페이지네이션 케이스:
  - `reasoning-traces` `nextCursor` 연속 조회 성공
  - 동일 `createdAt` 데이터에서 `turnId DESC` tie-break 정렬 검증
  - `INVALID_CURSOR` 반환 검증
  - `cursor.v` 누락/버전 불일치(`v!=1`) 시 `INVALID_CURSOR` 반환 검증
  - `cursor`에 `=` padding 포함 또는 non-base64url 문자 포함 시 `INVALID_CURSOR` 반환 검증
  - `limit` 경계값 `0/1/100/101`에 대해 `422/200/200/422` 동작 검증
  - 내부 `limit+1` 조회 기준으로 마지막 페이지에서 `nextCursor=null`이 되는지 검증
  - 내부 조회 결과가 `limit+1`일 때 앞 `limit`건만 반환되고 `nextCursor`가 생성되는지 검증
- 출처 강제 케이스:
  - `needsSources=true` + 강제 대상 요청에서 `event: message.sources` 포함 또는 `ASK_CLARIFY` fallback 검증
  - `needsSources=true` + 비강제 대상 요청(`transform`/`REFUSE`/개인의견·창작)에서 `sources` 생략 허용 검증
  - `needsSources=false`일 때 `event: message.sources` 생략 허용 검증
  - 출처 확보 실패 시 `ASK_CLARIFY` fallback 검증
  - `sources` 아이템 스키마 위반(`http/https` 외 URL, 빈 title, invalid source, URL 중복, 6개 이상) 시 유효 출처로 인정하지 않는지 검증
  - 강제 대상에서 invalid/중복 항목 제거 후 1개 이상이면 `event: message.sources`로 진행, 0개면 `ASK_CLARIFY` 검증
  - 정규화/중복 제거 후 6개 이상이면 입력 순서 기준 앞 5개만 유지되는지 검증
- Tool 수명주기 케이스:
  - 정상 연결 유지 케이스에서 `toolCallId`별 `start -> success|error` 정확히 1회 검증
  - 연결 종료/abort 케이스에서 `toolCallId`별 `start` 단독(종료 이벤트 없음) 허용 검증
  - 동일 턴에서 동일 도구 다중 호출 시 `toolCallId`로 개별 매칭 검증
- SSE payload 스키마 케이스:
  - `token/tool/message/error/done` 이벤트별 필수 필드 누락 시 계약 위반으로 테스트 실패 검증
  - `tool.phase=success`에서 `latencyMs` 필수, `tool.phase=error`에서 `errorCode/message` 필수 검증
  - 각 이벤트에서 정의 외 top-level 필드가 송신되지 않는지 검증
  - `debug=true`에서 `event: message.debug.requestId` 필수 및 `x-request-id`와 동일성 검증
- 세션 검증 케이스:
  - `sessionId` 누락/빈값으로 `/api/chat` 요청 시 pre-stream `422` + `VALIDATION_ERROR` 반환 검증
  - `sessionId` 형식 불일치로 `/api/chat` 요청 시 pre-stream `422` + `VALIDATION_ERROR` 반환 검증
  - 소문자/혼합 대소문자 `sessionId` 요청 시 pre-stream `422` + `VALIDATION_ERROR` 반환 검증
  - 존재하지 않는 `sessionId`로 `/api/chat` 요청 시 pre-stream `404` + `SESSION_NOT_FOUND` 반환 검증
  - 동일 `sessionId` 동시 `/api/chat` 요청 시 후행 요청 pre-stream `409` + `SESSION_BUSY` 반환 검증
  - `GET /api/sessions/{sessionId}` 경로에서 `sessionId` 형식 불일치 시 `422` + `VALIDATION_ERROR` 반환 검증
  - `GET /api/sessions/{sessionId}/reasoning-traces` 경로에서 `sessionId` 형식 불일치 시 `422` + `VALIDATION_ERROR` 반환 검증
  - `/api/tools/search` 요청에서 `sessionId` 형식 불일치 시 `422` + `VALIDATION_ERROR` 반환 검증
  - `/api/tools/transform` 요청에서 `sessionId` 형식 불일치 시 `422` + `VALIDATION_ERROR` 반환 검증
  - `/api/tools/*` 요청에서 존재하지 않는 `sessionId` 입력 시 `404` + `SESSION_NOT_FOUND` 반환 검증
- SSE cardinality 케이스:
  - 정상 경로에서 `event: message` 정확히 1회, `event: done(ok=true)` 검증
  - 복구 불가능 오류 경로에서 `event: message` 0회, `event: error` 정확히 1회 후 `event: done(ok=false)` 검증
- SSE 커밋/전송 순서 케이스:
  - 턴 종료 트랜잭션 commit 성공 후에만 `event: message`가 전송되는지 검증
  - 턴 종료 트랜잭션 실패 시 `event: message` 미전송 + `event:error(INTERNAL_SERVER_ERROR)` + `done(ok=false)` 검증
- `done` payload 계약 케이스:
  - `done.ok=true` 경로에서 `errorCode` 미포함, `latencyMs` 포함 검증
  - `done.ok=false` 경로에서 `errorCode` 포함, `latencyMs` 포함 검증
  - `latencyMs`가 `max(0, floor(t_done - t0))` 규칙으로 계산되는지 검증(가짜 타이머 기반)
- 도구 실패 분류 케이스:
  - `toolCallId` 귀속 가능한 도구 실패(`TOOL_TIMEOUT`/외부 API 5xx/스키마 실패)는 `event: tool(phase=error)`로 처리되고 `event:error` 미전송 검증
  - 노드 레벨 예외로 그래프 진행이 불가능한 경로에서는 `toolCallId` 귀속 가능 여부와 무관하게 `event:error(code=TOOL_EXECUTION_ERROR)` + `done(ok=false)` 전송 검증
- HTTP/SSE 매핑 경계 케이스:
  - `/api/tools/*` 직접 호출 타임아웃 시 HTTP `504` + `TOOL_TIMEOUT` 반환 검증
  - `/api/chat` in-stream 도구 타임아웃 시 HTTP `200` 유지 + `event: tool(phase=error, errorCode=TOOL_TIMEOUT)` 검증
- 연결 종료 케이스:
  - 클라이언트 연결 종료 시 서버 abort 전파 및 in-flight 해제 검증
  - 연결 종료 케이스는 `done` 미전송 종료 허용 검증
- `done.ok` 판정 케이스:
  - recoverable 도구 오류 후 fallback 응답 성공 시 `done.ok=true` 검증
  - 복구 불가능 오류 종료 시 `done.ok=false` 검증
- 인증/검증 우선순위 케이스:
  - `/api/tools/*`에서 토큰 누락 + invalid body 동시 입력 시 `401` 우선 반환 검증(`422` 미반환)
  - `/api/tools/*`에서 토큰 유효 + invalid body 입력 시 `422` 반환 검증
- 공통 에러 `details` 케이스:
  - `VALIDATION_ERROR`에서 `details.fields[].path/reason` 포함 검증
  - `INVALID_CURSOR`에서 `details.cursor` 절단(최대 120자) 규칙 검증
  - 비검증성 에러 코드에서 `details` 생략 검증
- `requestId` 전파 케이스:
  - 모든 HTTP 응답(성공/에러/SSE handshake)에 `x-request-id` 헤더 포함 및 정규식 일치 검증
  - JSON 에러 응답에서 `error.requestId`가 헤더 `x-request-id`와 동일한지 검증
- DB 제약 케이스:
  - `10.1.3`에서 정의한 `NOT NULL/default` 제약이 마이그레이션에 반영되는지 검증
  - `sessions.id == sessionId` 저장 규칙 검증
  - `master_contexts.content`/`master_contexts.summary`가 `NOT NULL`로 강제되는지 검증
- 세션 생성 원자성 케이스:
  - `POST /api/sessions`에서 `sessions`+`master_contexts`가 단일 트랜잭션으로 함께 commit되는지 검증
  - 중간 단계 실패 시 두 테이블 변경 모두 롤백되는지 검증
- `needsSources` 우선순위 케이스:
  - `needsSources=true` 강제 대상에서 출처 확보 실패가 2턴 연속이어도 `DIRECT_ANSWER`로 전환하지 않고 `ASK_CLARIFY` 유지 검증
  - 강제 대상 판정 알고리즘의 순서(1~5순위)가 선언된 우선순위대로 동작하는지 검증
  - 강제 대상 판정이 `planNextAction` 이전 1회 수행되고 `routeDecision` 값을 참조하지 않는지 검증
  - 1순위 비강제가 `11.2 refusePrecheck` 결과를 참조하는지 검증
  - 변환 중심 키워드 + 출처 키워드 미포함 입력이 3순위 비강제로 판정되는지 검증
  - 출처 키워드/사실·최신 키워드 입력이 강제로 판정되는지 검증
  - 키워드 매칭이 정규화 문자열(`trim` + NFKC + 공백축약 + 영문 소문자)에 대한 부분문자열(`includes`) 기준으로 동작하는지 검증
- REFUSE 사전 판정 케이스:
  - `11.2` 키워드 입력 시 `refusePrecheck=true` 판정 검증
  - 비키워드 입력 시 `refusePrecheck=false` 판정 검증
- 요약/트레이스 정규화 케이스:
  - `masterContextSummary` fallback이 `trim()` + code point 120자 절단 규칙을 따르는지 검증
  - `reasonSummary`에서 금지 패턴(`system prompt`, `developer message`, `chain-of-thought|cot`, `internal reasoning`, `내부 추론|사고 과정 원문`)이 `[REDACTED_REASON]`로 치환되는지 검증
  - `reasonSummary` 정규화 파이프라인(치환 -> 줄바꿈 정규화 -> trim -> 200자 절단 -> 빈값 대체) 순서 검증
  - `reasonSummary` 4문장 입력 시 앞 3문장만 유지되고, 이후 `6.10` 하드 제약이 우선 적용되는지 검증
- API DTO/도메인 인자 분리 케이스:
  - `/api/tools/*` 핸들러가 도메인 도구 실행 시 `sessionId`를 도구 인자에 전달하지 않는지 검증
- UI 토큰/메시지 결합 케이스:
  - `token` 누적 후 `message.text` 수신 시 최종 표시가 `message.text`로 치환되는지 검증
  - token 누적값과 `message.text` 불일치 시 `message.text` 우선 + 경고 로그 1회 검증
- PII 마스킹 케이스:
  - 이메일 로그 입력이 `[REDACTED_EMAIL]`로 치환되는지 검증
  - 전화번호 로그 입력이 `[REDACTED_PHONE]`로 치환되는지 검증
  - 동일 로그에 마스킹 2회 적용해도 결과 불변(idempotent) 검증
- 연속 실패 카운터 케이스:
  - 동일 세션의 비강제 대상(`needsSources=false` 또는 비강제 요청)에서 도구 실패 턴 연속 2회 시 2턴차 fallback이 `DIRECT_ANSWER`인지 검증
  - 도구 실패 3턴 이상 연속 발생 조건에서도 `consecutiveToolFailureTurns` 저장값이 2를 초과하지 않는지 검증
  - 도구 성공 턴 이후 `consecutiveToolFailureTurns`가 0으로 reset되는지 검증
  - 복구 불가능 오류 턴 이후 `consecutiveToolFailureTurns` 값 유지 검증
  - 클라이언트 연결 종료/abort 턴 이후 `consecutiveToolFailureTurns` 값 유지 검증
- `tool_executions` 저장 케이스:
  - 성공 실행 시 `ok=1` + 정상 `result` JSON 저장 검증
  - 실패 실행 시 `ok=0` + `{errorCode,message}` 형태 `result` 저장 검증
  - 실패/성공 모두 `latency_ms >= 0` 저장, 미측정 실패 시 `0` 저장 검증
  - `args/result` 직렬화 또는 DB 쓰기 실패 시 pre-stream `500(INTERNAL_SERVER_ERROR)` / in-stream `event:error(INTERNAL_SERVER_ERROR)+done(ok=false)` 검증
- 턴 원자성 케이스:
  - `messages/tool_executions/decision_traces/sessions(updated_at, counter)`가 단일 트랜잭션으로 함께 commit되는지 검증
  - 중간 단계 실패 시 5개 변경 모두 롤백되는지 검증
- 턴 저장 cardinality 케이스:
  - 턴 종료 트랜잭션 commit 성공 턴에서만 `role=user` 메시지가 정확히 1건 저장되는지 검증
  - 턴 종료 트랜잭션 실패(롤백)/연결 종료 턴에서 `messages`가 0건 저장되는지 검증
  - `done.ok=true` 턴에서 `role=ai` 메시지가 정확히 1건 저장되는지 검증
  - `done.ok=false`/연결 종료 턴에서 `role=ai` 메시지가 저장되지 않는지 검증
  - `event: tool(phase=start)`가 발생한 `toolCallId`만 `tool_executions`에 1행씩 저장되는지 검증
  - `done.ok=true`에서만 `decision_traces` 1건 저장, `done.ok=false`/연결 종료에서는 미저장 검증
- reasoning-traces 직렬화 케이스:
  - `items[].toolExecutions`가 `created_at ASC, tool_call_id ASC` 순서로 반환되는지 검증

## 13. 구현 순서 (초기)
1. Next.js 프로젝트 생성 및 App Router 기본 구조 설정.
2. 테스트 하네스(vitest/react-testing-library) 구성 및 기본 RED 테스트 작성.
3. 클린 아키텍처 폴더 구조 + 포트 인터페이스 정의(의존성 주입 구성 포함).
4. SQLite 스키마 생성(`sessions`, `master_contexts`, `messages`, `tool_executions`, `decision_traces`) 및 저장 레이어 구현.
5. `POST /api/sessions`, `GET /api/sessions/{sessionId}` 구현(`MasterContext` 저장/복구).
6. Gemini/Tavily 어댑터 + Stub 어댑터 구현(모드 기반 선택).
7. LangGraph 상태/노드/엣지 + `POST /api/chat` SSE 구현(SSE 이벤트 계약 준수).
8. `GET /api/sessions/{sessionId}/reasoning-traces` 및 "사고 과정 보기" UI 구현(커서 페이지네이션 포함).
9. RED-GREEN-REFACTOR 사이클로 핵심 유스케이스 완성 후 회귀 테스트 통과.

## 14. 확정 상태
- 저장소: 백엔드 `SQLite`
- `MasterContext`: 세션 생성 시 1회 입력 후 자동 재사용
- 아키텍처: 클린 아키텍처 + 의존성역전(DIP)
- 사고 과정 보기: 요약형 reasoning trace 제공(raw chain-of-thought 미노출)
- 테스트 전략: TDD(RED-GREEN-REFACTOR) + API 키 부재 시 Stub 기반 검증
- 내부 툴 API 보호: `x-internal-tool-token` + `INTERNAL_TOOL_TOKEN` 검증
- 세션 복구 API: `GET /api/sessions/{sessionId}` 제공
