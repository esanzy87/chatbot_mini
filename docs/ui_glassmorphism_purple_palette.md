# UI 컬러 팔레트 정의 (Purple Glassmorphism)

## 1. 목적
- 채팅 UI를 보라 계열 glassmorphism 톤으로 통일한다.
- 단색 배경 대신 다층 배경 + 반투명 카드 + 글로우 하이라이트를 기본 스타일로 사용한다.
- 한국어 UI 가독성을 위해 텍스트 대비를 확보한다.

## 2. 핵심 팔레트 (Base)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--pg-bg-900` | `#0F0A1F` | 앱 최외곽 배경 |
| `--pg-bg-800` | `#1A1233` | 메인 그라디언트 중간톤 |
| `--pg-bg-700` | `#26184B` | 메인 그라디언트 강조톤 |
| `--pg-accent-500` | `#A876FF` | 주요 액션/강조 |
| `--pg-accent-400` | `#C295FF` | hover/글로우 보조 |
| `--pg-accent-300` | `#DCC1FF` | 약한 하이라이트 |
| `--pg-cyan-400` | `#7EDBFF` | 보조 강조(링크/상태) |

## 3. Glass 레이어 토큰

| 토큰 | 값 | 용도 |
|---|---|---|
| `--pg-glass-fill-strong` | `rgba(173, 132, 255, 0.24)` | 포커스 카드 배경 |
| `--pg-glass-fill` | `rgba(173, 132, 255, 0.16)` | 기본 카드 배경 |
| `--pg-glass-fill-soft` | `rgba(173, 132, 255, 0.10)` | 보조 카드 배경 |
| `--pg-glass-stroke` | `rgba(235, 223, 255, 0.32)` | 카드 테두리 |
| `--pg-glass-stroke-soft` | `rgba(235, 223, 255, 0.18)` | 구분선 |
| `--pg-glow` | `rgba(168, 118, 255, 0.45)` | 외곽 글로우 |
| `--pg-shadow` | `rgba(7, 4, 19, 0.55)` | 카드 그림자 |

## 4. 텍스트/아이콘 토큰

| 토큰 | 값 | 용도 |
|---|---|---|
| `--pg-text-primary` | `#F7F1FF` | 본문/헤더 |
| `--pg-text-secondary` | `#D5C8EC` | 보조 설명 |
| `--pg-text-muted` | `#AA9AC8` | 비활성 텍스트 |
| `--pg-text-on-accent` | `#140A2A` | accent 버튼 위 텍스트 |

## 5. 상태 색상 토큰

| 토큰 | 값 | 용도 |
|---|---|---|
| `--pg-success` | `#63E6BE` | 성공 상태 |
| `--pg-warning` | `#FFD27A` | 경고 상태 |
| `--pg-error` | `#FF8FA3` | 오류 상태 |
| `--pg-info` | `#7EDBFF` | 정보 상태 |

## 6. 배경/카드 조합 규칙
- 앱 배경: `--pg-bg-900 -> --pg-bg-700 -> --pg-bg-800` 다중 그라디언트 조합을 기본으로 사용.
- 기본 카드: `--pg-glass-fill + backdrop-filter(blur)` 조합.
- 활성 카드/패널: `--pg-glass-fill-strong`, `--pg-glow`를 약하게 추가.
- 보더는 불투명 실선 대신 `--pg-glass-stroke` 1px 사용.

## 7. 최소 접근성 기준
- 본문 텍스트 대비(배경 대비) `4.5:1` 이상 유지.
- 버튼/입력 포커스 링은 `--pg-accent-400` 또는 `--pg-cyan-400` 사용.
- 상태 색상은 텍스트+아이콘(또는 라벨) 동시 표기.

## 8. CSS 변수 예시

```css
:root {
  --pg-bg-900: #0f0a1f;
  --pg-bg-800: #1a1233;
  --pg-bg-700: #26184b;
  --pg-accent-500: #a876ff;
  --pg-accent-400: #c295ff;
  --pg-accent-300: #dcc1ff;
  --pg-cyan-400: #7edbff;

  --pg-glass-fill-strong: rgba(173, 132, 255, 0.24);
  --pg-glass-fill: rgba(173, 132, 255, 0.16);
  --pg-glass-fill-soft: rgba(173, 132, 255, 0.1);
  --pg-glass-stroke: rgba(235, 223, 255, 0.32);
  --pg-glass-stroke-soft: rgba(235, 223, 255, 0.18);
  --pg-glow: rgba(168, 118, 255, 0.45);
  --pg-shadow: rgba(7, 4, 19, 0.55);

  --pg-text-primary: #f7f1ff;
  --pg-text-secondary: #d5c8ec;
  --pg-text-muted: #aa9ac8;
  --pg-text-on-accent: #140a2a;

  --pg-success: #63e6be;
  --pg-warning: #ffd27a;
  --pg-error: #ff8fa3;
  --pg-info: #7edbff;
}
```

## 9. 우선 적용 대상
- `/chat/[sessionId]` 페이지 배경/헤더/메시지 카드/trace 패널
- 입력창/전송 버튼/토글 버튼/상태 배지
