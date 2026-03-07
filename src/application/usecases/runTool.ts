import type { SearchPort } from "@/application/ports/search";
import { z } from "zod";
import { withToolTimeout } from "@/application/utils/withToolTimeout";

export type ToolName = "search" | "transform";

type RunToolInput =
  | {
      toolName: "search";
      allowedTools: ToolName[];
      args: { query: string; topK: number };
      timeoutMs: number;
    }
  | {
      toolName: "transform";
      allowedTools: ToolName[];
      args: { text: string; targetFormat: "summary" | "outline" | "presentation_script" };
      timeoutMs: number;
    };

export class RunToolUseCase {
  constructor(private readonly searchPort: SearchPort) {}

  private readonly searchSchema = z.object({
    query: z.string().trim().min(2).max(300),
    topK: z.number().int().min(1).max(10)
  });

  private readonly transformSchema = z.object({
    text: z.string().trim().min(1).max(5000),
    targetFormat: z.enum(["summary", "outline", "presentation_script"])
  });

  async execute(input: RunToolInput): Promise<unknown> {
    if (!input.allowedTools.includes(input.toolName)) {
      throw new Error("TOOL_NOT_ALLOWED");
    }

    if (input.toolName === "search") {
      const parsed = this.searchSchema.safeParse(input.args);
      if (!parsed.success) {
        throw new Error("VALIDATION_ERROR");
      }

      return await withToolTimeout((signal) => this.searchPort.search(parsed.data, { signal }), input.timeoutMs);
    }

    const parsed = this.transformSchema.safeParse(input.args);
    if (!parsed.success) {
      throw new Error("VALIDATION_ERROR");
    }

    return await withToolTimeout((signal) => this.searchPort.transform(parsed.data, { signal }), input.timeoutMs);
  }
}
