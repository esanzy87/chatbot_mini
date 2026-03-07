import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("uses app container and returns JSON response", async () => {
    const res = await GET();
    const body = (await res.json()) as { ok: boolean; llmMode: string; searchMode: string };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.llmMode).toBe("stub");
    expect(body.searchMode).toBe("stub");
  });
});
