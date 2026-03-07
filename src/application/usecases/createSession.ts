import { createSessionId } from "@/core/id/ids";
import { nowUtcIso } from "@/core/time/time";
import { codePointLength, trimAndValidateLength } from "@/core/validation/text";
import type { SessionRepository } from "@/application/ports/repository";

function summarizeMasterContext(masterContext: string): string {
  const trimmed = masterContext.trim();
  if (trimmed.length === 0) {
    return "";
  }

  return [...trimmed].slice(0, 120).join("");
}

export class CreateSessionUseCase {
  constructor(private readonly sessionRepository: SessionRepository) {}

  async execute(input: { masterContext: string }): Promise<{
    sessionId: string;
    masterContextSummary: string;
    createdAt: string;
  }> {
    const { trimmed } = trimAndValidateLength(input.masterContext, { min: 20, max: 4000 });

    const sessionId = createSessionId();
    const createdAt = nowUtcIso();
    const summary = summarizeMasterContext(trimmed);
    const safeSummary = codePointLength(summary) === 0 ? [...trimmed].slice(0, 120).join("") : summary;

    await this.sessionRepository.createSession({
      sessionId,
      masterContext: trimmed,
      masterContextSummary: safeSummary,
      createdAt
    });

    return {
      sessionId,
      masterContextSummary: safeSummary,
      createdAt
    };
  }
}
