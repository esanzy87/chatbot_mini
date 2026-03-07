import type { ForceSourceMode } from "@/domain/models";

const SOURCE_KEYWORDS = ["출처", "근거", "레퍼런스", "참고문헌", "citation", "source", "링크"];
const TRANSFORM_KEYWORDS = ["요약", "개요", "발표 대본", "형식", "문체", "정리", "변환", "다듬어"];
const FACT_KEYWORDS = [
  "최신",
  "오늘",
  "최근",
  "통계",
  "수치",
  "비율",
  "퍼센트",
  "몇 명",
  "공식 발표",
  "팩트체크",
  "검증",
  "비교"
];
const REFUSE_KEYWORDS = ["답안 그대로", "대필", "컨닝", "부정행위", "제출용 작성", "숙제 대신", "리포트 대신 써줘"];

export function normalizeForSourceDecision(message: string): string {
  const normalized = message.trim().normalize("NFKC").replace(/\s+/g, " ");
  return normalized.toLowerCase();
}

export function isRefusePrecheck(message: string): boolean {
  const normalized = normalizeForSourceDecision(message);
  return REFUSE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function includesAny(normalizedMessage: string, keywords: string[]): boolean {
  return keywords.some((keyword) => normalizedMessage.includes(keyword));
}

export function decideForceSourceMode(params: {
  needsSources: boolean;
  message: string;
}): ForceSourceMode {
  if (!params.needsSources) {
    return "NOT_FORCED";
  }

  const normalized = normalizeForSourceDecision(params.message);

  if (isRefusePrecheck(normalized)) {
    return "NOT_FORCED";
  }

  if (includesAny(normalized, SOURCE_KEYWORDS)) {
    return "FORCED";
  }

  if (includesAny(normalized, TRANSFORM_KEYWORDS)) {
    return "NOT_FORCED";
  }

  if (includesAny(normalized, FACT_KEYWORDS)) {
    return "FORCED";
  }

  return "NOT_FORCED";
}
