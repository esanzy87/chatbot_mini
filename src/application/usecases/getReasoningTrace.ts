import type { TraceRepository } from "@/application/ports/repository";

export class GetReasoningTraceUseCase {
  constructor(private readonly traceRepository: TraceRepository) {}

  async execute(input: {
    sessionId: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: unknown[]; nextCursor: string | null }> {
    const limit = input.limit ?? 20;

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("VALIDATION_ERROR");
    }

    return await this.traceRepository.listReasoningTraces({
      sessionId: input.sessionId,
      limit,
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {})
    });
  }
}
