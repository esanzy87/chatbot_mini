import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("uses app container, returns JSON response, and includes x-request-id", async () => {
    const res = await GET();
    const body = (await res.json()) as { ok: boolean; llmMode: string; searchMode: string };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.llmMode).toBe("stub");
    expect(body.searchMode).toBe("stub");
    expect(res.headers.get("x-request-id")).toMatch(/^req_[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
