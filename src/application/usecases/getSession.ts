import type { SessionRecord, SessionRepository } from "@/application/ports/repository";

export class GetSessionUseCase {
  constructor(private readonly sessionRepository: SessionRepository) {}

  async execute(input: { sessionId: string }): Promise<SessionRecord | null> {
    return await this.sessionRepository.getSession(input.sessionId);
  }
}
