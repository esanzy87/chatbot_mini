import fs from "node:fs/promises";
import path from "node:path";
import { POST as createSession } from "../src/app/api/sessions/route";
import { POST as chatRoute } from "../src/app/api/chat/route";
import { resetContainerForTest } from "../src/composition/container";
import { summarizeFirstChunk, summarizeFixture, summarizeStability } from "../src/perf/metrics";
import { BENCHMARK_WORKLOAD } from "../src/perf/workloadFixture";
import type { BenchmarkRecord } from "../src/perf/types";

type SseEvent = {
  event: string;
  data: Record<string, unknown>;
};

function parseSseEvents(raw: string): SseEvent[] {
  return raw
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const event = lines.find((line) => line.startsWith("event: "))?.replace("event: ", "") ?? "";
      const dataLine = lines.find((line) => line.startsWith("data: "))?.replace("data: ", "") ?? "{}";
      return {
        event,
        data: JSON.parse(dataLine) as Record<string, unknown>
      };
    });
}

async function readResponseStreamWithFirstChunk(
  res: Response,
  requestStartedAtMs: number
): Promise<{
  raw: string;
  firstChunkMs: number;
}> {
  const t0 = requestStartedAtMs;
  if (!res.body) {
    return { raw: "", firstChunkMs: 0 };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let firstAt: number | null = null;
  let raw = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (firstAt === null) {
      firstAt = Date.now();
    }
    raw += decoder.decode(value, { stream: true });
  }

  return {
    raw,
    firstChunkMs: Math.max(0, Math.floor((firstAt ?? Date.now()) - t0))
  };
}

async function createBenchmarkSessions(count: number): Promise<string[]> {
  const sessionIds: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const req = new Request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        masterContext: `성능 측정용 세션 ${i + 1}: 학습코치형 답변, 한국어 고정, 단계적 설명`
      })
    });
    const res = await createSession(req);
    if (!res.ok) {
      throw new Error(`createSession failed at ${i + 1}`);
    }
    const body = (await res.json()) as { sessionId: string };
    sessionIds.push(body.sessionId);
  }
  return sessionIds;
}

async function run(): Promise<void> {
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV ??= "test";
  env.APP_LLM_MODE ??= "stub";
  env.APP_SEARCH_MODE ??= "stub";
  env.INTERNAL_TOOL_TOKEN ??= "test-internal-token";

  resetContainerForTest();

  const warmUpCount = 20;
  const measuredWorkload = BENCHMARK_WORKLOAD;
  const warmUps = measuredWorkload.slice(0, warmUpCount);
  const fullRun = [...warmUps, ...measuredWorkload];

  const sessionIds = await createBenchmarkSessions(20);
  const measuredSessionUsage = new Map<string, number>();
  const records: BenchmarkRecord[] = [];

  for (let i = 0; i < fullRun.length; i += 1) {
    const item = fullRun[i]!;
    const isMeasured = i >= warmUpCount;
    const measuredIndex = i - warmUpCount;
    const sessionId = sessionIds[i % sessionIds.length]!;

    if (isMeasured) {
      measuredSessionUsage.set(sessionId, (measuredSessionUsage.get(sessionId) ?? 0) + 1);
    }

    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: item.message,
        clientOptions: {
          needsSources: item.needsSources,
          debug: false
        }
      })
    });

    const requestStartedAtMs = Date.now();
    const res = await chatRoute(req);
    const contentType = res.headers.get("content-type") ?? "";
    const inStream = res.status === 200 && contentType.includes("text/event-stream");
    const { raw, firstChunkMs } = await readResponseStreamWithFirstChunk(res, requestStartedAtMs);
    const events = parseSseEvents(raw);
    const done = events.find((event) => event.event === "done");
    const doneOk = Boolean(done?.data?.ok);
    const recoverableToolError = events.some(
      (event) => event.event === "tool" && event.data.phase === "error"
    );
    const messageEmitted = events.some((event) => event.event === "message");

    if (isMeasured) {
      records.push({
        requestIndex: measuredIndex,
        sessionId,
        expectedScenario: item.expectedScenario,
        inStream,
        firstChunkMs,
        doneEmitted: Boolean(done),
        doneOk,
        recoverableToolError,
        messageEmitted
      });
    }
  }

  const fixture = summarizeFixture(measuredWorkload);
  const firstChunk = summarizeFirstChunk(records);
  const stability = summarizeStability(records);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: {
      llm: env.APP_LLM_MODE,
      search: env.APP_SEARCH_MODE
    },
    sample: {
      warmUpCount,
      measuredCount: measuredWorkload.length,
      totalExecuted: fullRun.length
    },
    firstChunk,
    stability,
    fixture,
    sessionDistribution: Array.from(measuredSessionUsage.entries()).map(([id, count]) => ({ sessionId: id, count }))
  };

  const markdown = [
    "# Stub Benchmark Report",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- llmMode: ${report.mode.llm}`,
    `- searchMode: ${report.mode.search}`,
    `- totalRequests: ${report.sample.totalExecuted} (warm-up ${report.sample.warmUpCount} + measured ${report.sample.measuredCount})`,
    "",
    "## First Chunk",
    `- p95: ${report.firstChunk.p95}ms`,
    `- measured samples: ${report.firstChunk.samples}`,
    "",
    "## Stability",
    `- done rate: ${(report.stability.doneRate * 100).toFixed(2)}% (${report.stability.doneNumerator}/${report.stability.doneDenominator})`,
    `- fallback rate: ${(report.stability.fallbackRate * 100).toFixed(2)}% (${report.stability.fallbackNumerator}/${report.stability.fallbackDenominator})`,
    "",
    "## Fixture",
    `- scenario counts: ${JSON.stringify(report.fixture.scenarioCounts)}`,
    `- length counts: ${JSON.stringify(report.fixture.lengthBucketCounts)}`,
    `- CALL_TOOL needsSources=true: ${report.fixture.callToolNeedsSourcesTrue}`,
    `- CALL_TOOL needsSources=false: ${report.fixture.callToolNeedsSourcesFalse}`,
    "",
    "## Session Distribution (Measured 200)",
    ...report.sessionDistribution.map((item) => `- ${item.sessionId}: ${item.count}`)
  ].join("\n");

  const docsDir = path.join(process.cwd(), "docs");
  await fs.writeFile(path.join(docsDir, "perf_report_stub.json"), JSON.stringify(report, null, 2), "utf-8");
  await fs.writeFile(path.join(docsDir, "perf_report_stub.md"), `${markdown}\n`, "utf-8");

  process.stdout.write(`${markdown}\n`);
}

void run();
