import type { BenchmarkRecord, BenchmarkWorkloadItem, LengthBucket, ScenarioLabel } from "@/perf/types";

export function calculateP95(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1));
  return sorted[index] ?? 0;
}

export function summarizeFixture(workload: BenchmarkWorkloadItem[]): {
  total: number;
  scenarioCounts: Record<ScenarioLabel, number>;
  lengthBucketCounts: Record<LengthBucket, number>;
  callToolNeedsSourcesTrue: number;
  callToolNeedsSourcesFalse: number;
} {
  const scenarioCounts: Record<ScenarioLabel, number> = {
    DIRECT_ANSWER: 0,
    CALL_TOOL: 0,
    ASK_CLARIFY: 0,
    REFUSE: 0
  };

  const lengthBucketCounts: Record<LengthBucket, number> = {
    "1_30": 0,
    "31_200": 0,
    "201_800": 0
  };

  let callToolNeedsSourcesTrue = 0;
  let callToolNeedsSourcesFalse = 0;

  for (const item of workload) {
    scenarioCounts[item.expectedScenario] += 1;
    lengthBucketCounts[item.messageLengthBucket] += 1;

    if (item.expectedScenario === "CALL_TOOL") {
      if (item.needsSources) {
        callToolNeedsSourcesTrue += 1;
      } else {
        callToolNeedsSourcesFalse += 1;
      }
    }
  }

  return {
    total: workload.length,
    scenarioCounts,
    lengthBucketCounts,
    callToolNeedsSourcesTrue,
    callToolNeedsSourcesFalse
  };
}

export function summarizeStability(records: BenchmarkRecord[]): {
  doneRate: number;
  fallbackRate: number;
  fallbackNumerator: number;
  fallbackDenominator: number;
  doneNumerator: number;
  doneDenominator: number;
} {
  const connected = records.filter((item) => item.inStream);
  const doneNumerator = connected.filter((item) => item.doneEmitted).length;
  const doneDenominator = connected.length;

  const fallbackDenominator = connected.filter((item) => item.recoverableToolError).length;
  const fallbackNumerator = connected.filter(
    (item) => item.recoverableToolError && item.doneOk && item.messageEmitted
  ).length;

  return {
    doneRate: doneDenominator === 0 ? 1 : doneNumerator / doneDenominator,
    fallbackRate: fallbackDenominator === 0 ? 1 : fallbackNumerator / fallbackDenominator,
    fallbackNumerator,
    fallbackDenominator,
    doneNumerator,
    doneDenominator
  };
}

export function summarizeFirstChunk(records: BenchmarkRecord[]): {
  p95: number;
  samples: number;
} {
  const values = records.filter((item) => item.inStream).map((item) => item.firstChunkMs);
  return {
    p95: calculateP95(values),
    samples: values.length
  };
}
