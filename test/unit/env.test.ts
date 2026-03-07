import { describe, expect, it, vi } from "vitest";
import { AppConfigError, loadAppConfig, parseAppConfig } from "@/config/env";

describe("config/env", () => {
  it("defaults both modes to stub when undefined", () => {
    const config = parseAppConfig({
      NODE_ENV: "test"
    });

    expect(config.llmMode).toBe("stub");
    expect(config.searchMode).toBe("stub");
    expect(config.internalToolToken).toBe("test-internal-token");
  });

  it("rejects empty mode string", () => {
    expect(() =>
      parseAppConfig({
        NODE_ENV: "test",
        APP_LLM_MODE: ""
      })
    ).toThrowError(AppConfigError);
  });

  it("rejects unknown mode value", () => {
    expect(() =>
      parseAppConfig({
        NODE_ENV: "test",
        APP_SEARCH_MODE: "staging"
      })
    ).toThrowError(AppConfigError);
  });

  it("requires GEMINI_API_KEY in llm live mode", () => {
    expect(() =>
      parseAppConfig({
        NODE_ENV: "test",
        APP_LLM_MODE: "live"
      })
    ).toThrowError(/GEMINI_API_KEY/);
  });

  it("requires TAVILY_API_KEY in search live mode", () => {
    expect(() =>
      parseAppConfig({
        NODE_ENV: "test",
        APP_SEARCH_MODE: "live"
      })
    ).toThrowError(/TAVILY_API_KEY/);
  });

  it("requires INTERNAL_TOOL_TOKEN outside test env", () => {
    expect(() =>
      parseAppConfig({
        NODE_ENV: "development"
      })
    ).toThrowError(/INTERNAL_TOOL_TOKEN/);
  });

  it("accepts explicit internal token outside test env", () => {
    const config = parseAppConfig({
      NODE_ENV: "development",
      INTERNAL_TOOL_TOKEN: "dev-token"
    });

    expect(config.internalToolToken).toBe("dev-token");
  });

  it("logs structured config load failure", () => {
    const logger = {
      error: vi.fn()
    };

    expect(() => loadAppConfig({ NODE_ENV: "development" }, logger)).toThrowError(AppConfigError);
    expect(logger.error).toHaveBeenCalledWith(
      "CONFIG_LOAD_FAILED",
      expect.objectContaining({ code: "ENV_INTERNAL_TOKEN_MISSING" })
    );
  });
});
