import type { SearchResultItem } from "@/application/ports/search";
import { extractBodyText } from "@/infrastructure/search/extractBodyText";

export class TavilySearchAdapter {
  constructor(private readonly apiKey: string) {}

  private async fetchBodyText(url: string, signal?: AbortSignal): Promise<string> {
    try {
      const response = await fetch(url, {
        method: "GET",
        ...(signal ? { signal } : {})
      });

      if (!response.ok) {
        return "";
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html")) {
        return "";
      }

      const html = await response.text();
      return extractBodyText(html);
    } catch {
      return "";
    }
  }

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

    const baseItems = (payload.results ?? []).map((result) => ({
      title: (result.title ?? "제목 없음").trim() || "제목 없음",
      snippet: (result.content ?? "").trim().slice(0, 300),
      url: result.url ?? "https://example.com",
      source: "tavily"
    }));

    const items: SearchResultItem[] = [];
    for (const item of baseItems) {
      const bodyText = await this.fetchBodyText(item.url, options?.signal);
      items.push({
        ...item,
        bodyText: bodyText || item.snippet
      });
    }

    return {
      items
    };
  }
}
