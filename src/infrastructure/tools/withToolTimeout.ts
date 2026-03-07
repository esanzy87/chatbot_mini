export async function withToolTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("TOOL_TIMEOUT")), timeoutMs);
    })
  ]);
}
