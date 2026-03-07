import type { BenchmarkWorkloadItem, LengthBucket, ScenarioLabel } from "@/perf/types";

const SCENARIO_TARGET: Record<ScenarioLabel, number> = {
  DIRECT_ANSWER: 80,
  CALL_TOOL: 80,
  ASK_CLARIFY: 20,
  REFUSE: 20
};

const LENGTH_TARGET: Record<LengthBucket, number> = {
  "1_30": 60,
  "31_200": 100,
  "201_800": 40
};

function buildSequence<T extends string>(target: Record<T, number>): T[] {
  const result: T[] = [];
  for (const key of Object.keys(target) as T[]) {
    for (let i = 0; i < target[key]; i += 1) {
      result.push(key);
    }
  }
  return result;
}

function deterministicShuffle<T>(items: T[]): T[] {
  const out = [...items];
  let seed = 20260307;
  for (let i = out.length - 1; i > 0; i -= 1) {
    seed = (seed * 48271) % 2147483647;
    const j = seed % (i + 1);
    const temp = out[i];
    out[i] = out[j] as T;
    out[j] = temp as T;
  }
  return out;
}

function targetLengthByBucket(bucket: LengthBucket): number {
  if (bucket === "1_30") {
    return 24;
  }
  if (bucket === "31_200") {
    return 120;
  }
  return 280;
}

function baseMessageForScenario(scenario: ScenarioLabel, index: number): string {
  if (scenario === "CALL_TOOL") {
    return `검색이 필요한 학습 질문 ${index + 1}`;
  }
  if (scenario === "ASK_CLARIFY") {
    return `변환 요청 ${index + 1} 원문이 없어 추가 확인이 필요합니다`;
  }
  if (scenario === "REFUSE") {
    return `숙제 대신 해줘 요청 ${index + 1}`;
  }
  return `개념 설명 요청 ${index + 1}`;
}

function padToLength(base: string, length: number): string {
  if (base.length >= length) {
    return base.slice(0, length);
  }

  let value = base;
  while (value.length < length) {
    value += "가";
  }
  return value.slice(0, length);
}

function buildFixture(): BenchmarkWorkloadItem[] {
  const scenarioPlan = deterministicShuffle(buildSequence(SCENARIO_TARGET));
  const lengthPlan = deterministicShuffle(buildSequence(LENGTH_TARGET));

  let callToolNeedsSourcesTrue = 0;

  return scenarioPlan.map((scenario, index) => {
    const bucket = lengthPlan[index] as LengthBucket;
    const message = padToLength(baseMessageForScenario(scenario, index), targetLengthByBucket(bucket));
    const needsSources =
      scenario === "CALL_TOOL"
        ? callToolNeedsSourcesTrue++ < 40
        : false;

    return {
      id: `w_${String(index + 1).padStart(3, "0")}`,
      expectedScenario: scenario,
      message,
      messageLengthBucket: bucket,
      needsSources
    };
  });
}

export const BENCHMARK_WORKLOAD: BenchmarkWorkloadItem[] = buildFixture();
