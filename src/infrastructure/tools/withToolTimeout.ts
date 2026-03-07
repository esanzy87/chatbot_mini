import { withToolTimeout as withApplicationToolTimeout } from "@/application/utils/withToolTimeout";

export async function withToolTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await withApplicationToolTimeout(() => promise, timeoutMs);
}
