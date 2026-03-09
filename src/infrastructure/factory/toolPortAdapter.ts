import type { SearchPort } from "@/application/ports/search";

export type SearchExecutor = {
  search(args: {
    query: string;
    topK: number;
  }, options?: { signal?: AbortSignal }): Promise<{
    items: Array<{ title: string; snippet: string; url: string; source: string; bodyText: string }>;
  }>;
};

export type TransformExecutor = {
  transform(args: {
    text: string;
    targetFormat: "summary" | "outline" | "presentation_script";
  }, options?: { signal?: AbortSignal }): Promise<{ resultText: string; appliedRules: string[] }>;
};

export class ToolPortAdapter implements SearchPort {
  constructor(
    private readonly searchExecutor: SearchExecutor,
    private readonly transformExecutor: TransformExecutor
  ) {}

  async search(args: {
    query: string;
    topK: number;
  }, options?: { signal?: AbortSignal }): Promise<{
    items: Array<{ title: string; snippet: string; url: string; source: string; bodyText: string }>;
  }> {
    return await this.searchExecutor.search(args, options);
  }

  async transform(args: {
    text: string;
    targetFormat: "summary" | "outline" | "presentation_script";
  }, options?: { signal?: AbortSignal }): Promise<{ resultText: string; appliedRules: string[] }> {
    return await this.transformExecutor.transform(args, options);
  }
}
