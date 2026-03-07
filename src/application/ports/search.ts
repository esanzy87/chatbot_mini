export type SearchResultItem = {
  title: string;
  snippet: string;
  source: string;
  url: string;
};

export interface SearchPort {
  search(args: { query: string; topK: number }): Promise<{ items: SearchResultItem[] }>;
  transform(args: {
    text: string;
    targetFormat: "summary" | "outline" | "presentation_script";
  }): Promise<{ resultText: string; appliedRules: string[] }>;
}
