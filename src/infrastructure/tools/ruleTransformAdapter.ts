export class RuleTransformAdapter {
  async transform(
    args: {
      text: string;
      targetFormat: "summary" | "outline" | "presentation_script";
    },
    _options?: { signal?: AbortSignal }
  ): Promise<{ resultText: string; appliedRules: string[] }> {
    const base = args.text.trim();

    if (args.targetFormat === "summary") {
      return {
        resultText: base.slice(0, 240),
        appliedRules: ["format=summary", "maxChars=240"]
      };
    }

    if (args.targetFormat === "outline") {
      const lines = base
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 8)
        .map((line, i) => `${i + 1}. ${line}`);

      return {
        resultText: lines.join("\n"),
        appliedRules: ["format=outline", "maxItems=8"]
      };
    }

    return {
      resultText: `안녕하세요. 좋아, 발표할 때는 이런 흐름으로 풀면 자연스러워!\n\n${base}`,
      appliedRules: ["format=presentation_script", "tone=casual"]
    };
  }
}
