// SESSION_BUSY policy is intentionally process-local for MVP single-instance runtime.
const inFlightSessionIds = new Set<string>();

export function tryAcquireSession(sessionId: string): boolean {
  if (inFlightSessionIds.has(sessionId)) {
    return false;
  }

  inFlightSessionIds.add(sessionId);
  return true;
}

export function releaseSession(sessionId: string): void {
  inFlightSessionIds.delete(sessionId);
}

export function isSessionInFlight(sessionId: string): boolean {
  return inFlightSessionIds.has(sessionId);
}

export function resetInFlightForTest(): void {
  inFlightSessionIds.clear();
}
