import { describe, expect, it } from "vitest";
import { createContainer, resetContainerForTest } from "@/composition/container";

describe("bootstrap smoke", () => {
  it("creates DI container", () => {
    resetContainerForTest();
    const container = createContainer();
    expect(container.config.llmMode).toBe("stub");
  });
});
