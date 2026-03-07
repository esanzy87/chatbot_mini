import { describe, expect, it } from "vitest";
import { withToolTimeout } from "@/application/utils/withToolTimeout";

describe("application/utils/withToolTimeout", () => {
  it("throws TOOL_TIMEOUT when timeout controller aborts the tool call", async () => {
    const run = (signal: AbortSignal) =>
      new Promise<never>((_, reject) => {
        signal.addEventListener("abort", () => {
          reject(signal.reason);
        });
      });

    await expect(withToolTimeout(run, 1)).rejects.toThrowError(/TOOL_TIMEOUT/);
  });

  it("throws REQUEST_ABORTED when outer request signal aborts first", async () => {
    const controller = new AbortController();
    const run = (signal: AbortSignal) =>
      new Promise<never>((_, reject) => {
        signal.addEventListener("abort", () => {
          reject(signal.reason);
        });
      });

    const promise = withToolTimeout(run, 1000, controller.signal);
    controller.abort();

    await expect(promise).rejects.toThrowError(/REQUEST_ABORTED/);
  });
});
