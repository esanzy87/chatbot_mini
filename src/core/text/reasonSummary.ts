import { codePointLength } from "@/core/validation/text";

const FALLBACK_REASON_SUMMARY = "판단 요약을 생성하지 못했습니다.";

const REDACT_PATTERNS: RegExp[] = [
  /system prompt/gi,
  /developer message/gi,
  /chain[- ]of[- ]thought|cot/gi,
  /internal reasoning/gi,
  /내부 추론|사고 과정 원문/gi
];

function truncateCodePoints(value: string, max: number): string {
  if (codePointLength(value) <= max) {
    return value;
  }

  return [...value].slice(0, max).join("");
}

export function normalizeReasonSummary(input: string): string {
  let result = input;

  for (const pattern of REDACT_PATTERNS) {
    result = result.replace(pattern, "[REDACTED_REASON]");
  }

  result = result.replace(/[\r\n]+/g, " ");
  result = result.trim();
  result = truncateCodePoints(result, 200);

  if (result.length === 0) {
    return FALLBACK_REASON_SUMMARY;
  }

  return result;
}

export { FALLBACK_REASON_SUMMARY };
