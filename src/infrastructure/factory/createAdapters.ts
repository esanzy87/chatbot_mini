import type { AppConfig } from "@/config/env";
import type { LlmPort } from "@/application/ports/llm";
import type { SearchPort } from "@/application/ports/search";
import { StubLlmAdapter } from "@/infrastructure/llm/stubLlmAdapter";
import { GeminiLlmAdapter } from "@/infrastructure/llm/geminiLlmAdapter";
import { StubSearchAdapter } from "@/infrastructure/search/stubSearchAdapter";
import { TavilySearchAdapter } from "@/infrastructure/search/tavilySearchAdapter";
import { RuleTransformAdapter } from "@/infrastructure/tools/ruleTransformAdapter";
import { ToolPortAdapter } from "@/infrastructure/factory/toolPortAdapter";

export function createLlmAdapter(config: AppConfig): LlmPort {
  if (config.llmMode === "live") {
    if (!config.geminiApiKey) {
      throw new Error("GEMINI_API_KEY is required in live mode");
    }
    return new GeminiLlmAdapter(config.geminiApiKey);
  }

  return new StubLlmAdapter();
}

export function createSearchAdapter(config: AppConfig): SearchPort {
  const transformAdapter = new RuleTransformAdapter();

  if (config.searchMode === "live") {
    if (!config.tavilyApiKey) {
      throw new Error("TAVILY_API_KEY is required in live mode");
    }
    return new ToolPortAdapter(new TavilySearchAdapter(config.tavilyApiKey), transformAdapter);
  }

  return new ToolPortAdapter(new StubSearchAdapter(), transformAdapter);
}
