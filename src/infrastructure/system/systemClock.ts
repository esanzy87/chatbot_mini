import type { ClockPort } from "@/application/ports/system";

export class SystemClock implements ClockPort {
  nowIso(): string {
    return new Date().toISOString();
  }
}
