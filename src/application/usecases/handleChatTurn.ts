import type { LlmPort } from "@/application/ports/llm";
import type { MessageRepository, SessionRepository } from "@/application/ports/repository";
import { applyConfidenceFallback, validateRouteDecision } from "@/domain/policies/routeDecision";
import { decideForceSourceMode } from "@/domain/policies/sourceMode";
import { trimAndValidateLength } from "@/core/validation/text";

export class HandleChatTurnUseCase {
  constructor(
    private readonly llmPort: LlmPort,
    private readonly sessionRepository: SessionRepository,
    private readonly messageRepository: MessageRepository
  ) {}

  async execute(input: {
    sessionId: string;
    message: string;
    needsSources: boolean;
  }): Promise<{
    forceSourceMode: "FORCED" | "NOT_FORCED";
    routeDecision: ReturnType<typeof applyConfidenceFallback>;
    sessionMasterContext: string;
    history: Array<{ role: string; content: string }>;
  }> {
    const { trimmed } = trimAndValidateLength(input.message, { min: 1, max: 2000 });

    const session = await this.sessionRepository.getSession(input.sessionId);
    if (!session) {
      throw new Error("SESSION_NOT_FOUND");
    }

    const history = await this.messageRepository.listMessages(input.sessionId);
    const forceSourceMode = decideForceSourceMode({
      needsSources: input.needsSources,
      message: trimmed
    });

    const planned = await this.llmPort.planNextAction({
      sessionId: input.sessionId,
      message: trimmed,
      masterContext: session.masterContext,
      forceSourceMode,
      history
    });

    const validated = validateRouteDecision(planned);
    const routeDecision = applyConfidenceFallback(validated);

    return {
      forceSourceMode,
      routeDecision,
      sessionMasterContext: session.masterContext,
      history
    };
  }
}
