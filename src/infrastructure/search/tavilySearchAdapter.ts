import type { SearchResultItem } from "@/application/ports/search";

export class TavilySearchAdapter {
  constructor(private readonly apiKey: string) {}

  async search(
    args: { query: string; topK: number },
    options?: { signal?: AbortSignal }
  ): Promise<{ items: SearchResultItem[] }> {
    let response: Response;
    try {
      response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        ...(options?.signal ? { signal: options.signal } : {}),
        body: JSON.stringify({
          api_key: this.apiKey,
          query: args.query,
          max_results: args.topK
        })
      });
    } catch {
      throw new Error("TOOL_NETWORK_ERROR");
    }

    if (!response.ok) {
      throw new Error("TOOL_PROVIDER_ERROR");
    }

    const payload = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };

    const items: SearchResultItem[] = (payload.results ?? []).map((result) => ({
      title: (result.title ?? "제목 없음").trim() || "제목 없음",
      snippet: (result.content ?? "").trim().slice(0, 300),
      url: result.url ?? "https://example.com",
      source: "tavily"
    }));

    return {
      items
    };
  }
}
