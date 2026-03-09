import type { SearchResultItem } from "@/application/ports/search";

export class StubSearchAdapter {
  async search(
    args: { query: string; topK: number },
    _options?: { signal?: AbortSignal }
  ): Promise<{ items: SearchResultItem[] }> {
    if (args.query.includes("__TIMEOUT__")) {
      throw new Error("TOOL_TIMEOUT");
    }

    if (args.query.includes("__UNRECOVERABLE__")) {
      throw new Error("NODE_EXCEPTION");
    }

    if (args.query.includes("__NO_SOURCE__")) {
      return { items: [] };
    }

    const items: SearchResultItem[] = Array.from({ length: args.topK }).map((_, index) => ({
      title: `Stub 검색 결과 ${index + 1}`,
      snippet: `Stub 요약 ${index + 1}: ${args.query}`,
      bodyText: `Stub 본문 ${index + 1}: ${args.query}에 대한 설명입니다. 핵심 개념과 예시, 주의할 점을 포함한 테스트용 본문입니다.`,
      url: `https://example.com/stub/${encodeURIComponent(args.query)}/${index + 1}`,
      source: "stub-search"
    }));

    return { items };
  }
}
