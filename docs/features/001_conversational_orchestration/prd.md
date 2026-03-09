# 대화형 오케스트레이션 개선 PRD

## Executive summary

현재 챗봇은 기본 기능은 동작하지만, 실제 OpenAI/Gemini 웹앱과 비교하면 응답이 분류기처럼 딱딱하고 도구 사용 흐름이 기계적으로 느껴진다. 특히 `CALL_TOOL(search)` 경로에서 검색어 재작성 없이 사용자 원문을 그대로 사용하고, 검색 결과를 바탕으로 한 재판단 없이 곧바로 최종 답변을 생성하는 구조가 대화 품질 저하의 핵심 원인이다.

본 feature의 목표는 기존 MVP의 안전성, allowlist, 스키마 검증, reasoning trace 정책은 유지하면서도 다음을 개선하는 것이다.

- 검색 전 의도 기반 검색 계획 수립
- 검색 후 결과 적합성 재판단
- `ASK_CLARIFY` 남용 감소
- 대화 히스토리 전달 방식 개선
- 검색 후 답변을 "문서 요약"이 아니라 "대화형 응답"에 가깝게 조정

핵심 방향은 "모델이 더 자연스럽게 대화를 운영하도록 하되, 실제 실행 권한과 보안 경계는 서버가 계속 통제"하는 것이다.

## Problem statement

현재 사용자 체감 문제는 다음과 같다.

- 애매한 질문에서 너무 빨리 `ASK_CLARIFY`로 빠진다.
- `CALL_TOOL(search)` 시 검색어가 부정확하거나 지나치게 넓다.
- 검색 결과를 읽은 뒤에도 응답이 자연스러운 대화라기보다 정리문처럼 느껴진다.
- 이전 맥락이 있어도 히스토리 반영이 약해 웹앱형 챗봇의 연속성이 부족하다.
- 도구 호출이 모델 주도형이 아니라 서버 고정 규칙에 가까워 상황 적응성이 낮다.

## Goals

- 검색 경로의 답변 체감 품질을 명확히 개선한다.
- 검색어 재작성과 2차 검색 판단을 지원해 검색 정확도를 높인다.
- 불필요한 `ASK_CLARIFY`를 줄이고, 가능한 경우 가정을 명시한 뒤 먼저 도움을 제공한다.
- 검색 후 답변을 사용자의 질문에 먼저 직접 답하는 구조로 바꾼다.
- 기존 보안 규칙(allowlist, 도구 스키마 검증, 내부 토큰, raw CoT 비노출)은 유지한다.

## Non-goals

- model-native tool call 전체 전환
- 멀티툴 동시 호출
- 신규 외부 도구 추가
- UI 전면 개편
- LangSmith 등 외부 관측 도구 추가

## Users and primary scenarios

- 진로/학습 질문에서 바로 조언을 받고 싶은 사용자
- 최신 정보나 출처가 필요한 질문을 하는 사용자
- 모호하지만 대략적인 방향부터 알고 싶은 사용자

주요 시나리오:

1. 사용자가 비교/최신/출처성 질문을 한다.
2. 시스템은 질문을 바로 검색하지 않고 검색 의도와 쿼리를 재작성한다.
3. 검색 결과를 수집한 뒤 충분성/적합성을 다시 판단한다.
4. 필요하면 좁혀진 2차 검색 또는 조건부 추가질문으로 이어간다.
5. 최종 답변은 먼저 직접 답하고, 그 뒤 근거와 출처를 덧붙인다.

## Success metrics

- `CALL_TOOL(search)` 경로에서 사용자 원문 그대로 검색하는 비율 20% 이하
- 검색 경로 응답에서 `ASK_CLARIFY`로 종료되는 비율 30% 이상 감소
- 수동 평가셋에서 "웹앱형 챗봇과 유사한 자연스러움" 주관 점수 개선
- 검색 경로의 최종 응답에서 "첫 문단이 직접 답변" 규칙 준수율 90% 이상
- 기존 SSE 안정성/도구 실패 fallback/출처 정책 회귀 없음

### Metric protocol

- 평가 단위는 `CALL_TOOL(search)`로 진입한 턴으로 한정한다.
- "사용자 원문 그대로 검색"은 `trim + 공백정규화 + 소문자화` 후 planner가 선택한 최종 query와 userMessage가 완전히 같을 때로 판정한다.
- `ASK_CLARIFY` 감소율은 bootstrap 기준 샘플셋과 동일한 질문군 또는 동등한 고정 평가셋으로 비교한다.
- 자연스러움 평가는 고정 샘플 20문장에 대해 1~5점 척도로 수동 평가한다.
- "첫 문단이 직접 답변"은 최종 응답의 첫 문단이 단순 메타 문구("검색해보니", "자료를 정리하면", "검색 결과를 바탕으로")로만 시작하지 않고 질문에 대한 직접 답변을 포함할 때 충족으로 본다.
- 안정성 회귀는 기존 `000_bootstrap`의 SSE 종료, fallback, sources 포함 테스트를 재사용해 판정한다.

## Scope

### In scope

- 검색 계획 생성 프롬프트/스키마 추가
- 검색 후 재판단 프롬프트/스키마 추가
- `ASK_CLARIFY` fallback 정책 조정
- Gemini 입력에서 role 기반 multi-turn 전달 방식 개선
- 검색 답변 프롬프트를 대화형 응답 중심으로 수정
- 기존 reasoning trace 문자열에 검색 계획/재판단 요약을 안전한 수준에서 합성 반영

### Out of scope

- transform 도구의 고도화
- 세션 메모리 정책 대규모 개편
- 검색 엔진 교체
- 프런트의 새로운 정보 구조 추가

## Constraints

- 기존 `DIRECT_ANSWER | CALL_TOOL | ASK_CLARIFY | REFUSE` 계약은 유지한다.
- 도구 실행은 서버 allowlist + zod 검증을 유지한다.
- raw chain-of-thought 저장/노출은 계속 금지한다.
- `/api/chat` SSE 계약은 가능하면 유지하고, 변경이 필요하면 하위 호환을 우선한다.
- `docs/features/000_bootstrap/initial_spec.md`와 충돌할 경우, 이 feature에서 명시적으로 바꾼 항목만 `001_conversational_orchestration` 문서를 우선한다.

## Deliverables

- `docs/features/001_conversational_orchestration/initial_spec.md`
- `docs/features/001_conversational_orchestration/todo.md`
- `docs/features/001_conversational_orchestration/adr.md`
- 구현 코드 및 테스트
