export async function withToolTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  outerSignal?: AbortSignal
): Promise<T> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort(new Error("TOOL_TIMEOUT"));
  }, timeoutMs);

  const relayAbort = () => {
    timeoutController.abort(new Error("REQUEST_ABORTED"));
  };

  const normalizedAbortError = () => {
    const reason = timeoutController.signal.reason;
    if (reason instanceof Error) {
      return reason;
    }
    if (outerSignal?.aborted) {
      return new Error("REQUEST_ABORTED");
    }
    return new Error("TOOL_TIMEOUT");
  };

  if (outerSignal?.aborted) {
    relayAbort();
  } else {
    outerSignal?.addEventListener("abort", relayAbort, { once: true });
  }

  const abortPromise = new Promise<never>((_, reject) => {
    const onAbort = () => {
      reject(normalizedAbortError());
    };
    timeoutController.signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([run(timeoutController.signal), abortPromise]);
  } finally {
    clearTimeout(timeoutId);
    outerSignal?.removeEventListener("abort", relayAbort);
  }
}
