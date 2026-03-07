import { normalizeReasonSummary } from "@/core/text/reasonSummary";

function takeFirstThreeSentences(value: string): string {
  const matches = value.match(/[^.!?]+[.!?]?/g);
  if (!matches) {
    return value;
  }

  return matches
    .slice(0, 3)
    .join("")
    .trim();
}

function applySummaryTemplate(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }

  return `판단 근거: ${trimmed}`;
}

export function toReasonSummary(raw: string): string {
  const sentenceLimited = takeFirstThreeSentences(raw);
  return normalizeReasonSummary(applySummaryTemplate(sentenceLimited));
}
