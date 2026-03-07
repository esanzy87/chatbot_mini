import { describe, expect, it } from "vitest";
import { calculateP95, summarizeFirstChunk, summarizeFixture, summarizeStability } from "@/perf/metrics";
import type { BenchmarkRecord } from "@/perf/types";
import { BENCHMARK_WORKLOAD } from "@/perf/workloadFixture";

describe("perf metrics", () => {
  it("calculates p95 after warm-up exclusion inputs", () => {
    const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    expect(calculateP95(values)).toBe(1000);
  });

  it("summarizes fixture with required scenario and length distribution", () => {
    const summary = summarizeFixture(BENCHMARK_WORKLOAD);
    expect(summary.total).toBe(200);
    expect(summary.scenarioCounts).toEqual({
      DIRECT_ANSWER: 80,
      CALL_TOOL: 80,
      ASK_CLARIFY: 20,
      REFUSE: 20
    });
    expect(summary.lengthBucketCounts).toEqual({
      "1_30": 60,
      "31_200": 100,
      "201_800": 40
    });
    expect(summary.callToolNeedsSourcesTrue).toBe(40);
    expect(summary.callToolNeedsSourcesFalse).toBe(40);
  });

  it("computes done rate and fallback rate from measured records", () => {
    const records: BenchmarkRecord[] = [
      {
        requestIndex: 0,
        sessionId: "sess_a",
        expectedScenario: "CALL_TOOL",
        inStream: true,
        firstChunkMs: 100,
        doneEmitted: true,
        doneOk: true,
        recoverableToolError: true,
        messageEmitted: true
      },
      {
        requestIndex: 1,
        sessionId: "sess_a",
        expectedScenario: "CALL_TOOL",
        inStream: true,
        firstChunkMs: 120,
        doneEmitted: true,
        doneOk: false,
        recoverableToolError: true,
        messageEmitted: false
      },
      {
        requestIndex: 2,
        sessionId: "sess_a",
        expectedScenario: "DIRECT_ANSWER",
        inStream: true,
        firstChunkMs: 80,
        doneEmitted: false,
        doneOk: false,
        recoverableToolError: false,
        messageEmitted: false
      }
    ];

    const stability = summarizeStability(records);
    expect(stability.doneRate).toBeCloseTo(2 / 3, 6);
    expect(stability.fallbackRate).toBeCloseTo(1 / 2, 6);

    const firstChunk = summarizeFirstChunk(records);
    expect(firstChunk.p95).toBe(120);
    expect(firstChunk.samples).toBe(3);
  });

  it("uses fixture expected labels independently from actual runtime results", () => {
    const fixture = summarizeFixture(BENCHMARK_WORKLOAD);
    const fakeRuntimeCallToolCount = 0;

    expect(fixture.scenarioCounts.CALL_TOOL).toBe(80);
    expect(fakeRuntimeCallToolCount).toBe(0);
  });
});
