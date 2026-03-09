export type SearchResultItem = {
  title: string;
  snippet: string;
  source: string;
  url: string;
  bodyText: string;
};

export type ToolCallOptions = {
  signal?: AbortSignal;
};

export interface SearchPort {
  search(args: { query: string; topK: number }, options?: ToolCallOptions): Promise<{ items: SearchResultItem[] }>;
  transform(args: {
    text: string;
    targetFormat: "summary" | "outline" | "presentation_script";
  }, options?: ToolCallOptions): Promise<{ resultText: string; appliedRules: string[] }>;
}
