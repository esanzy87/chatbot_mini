export type ScenarioLabel = "DIRECT_ANSWER" | "CALL_TOOL" | "ASK_CLARIFY" | "REFUSE";

export type LengthBucket = "1_30" | "31_200" | "201_800";

export type BenchmarkWorkloadItem = {
  id: string;
  expectedScenario: ScenarioLabel;
  message: string;
  messageLengthBucket: LengthBucket;
  needsSources: boolean;
};

export type BenchmarkRecord = {
  requestIndex: number;
  sessionId: string;
  expectedScenario: ScenarioLabel;
  inStream: boolean;
  firstChunkMs: number;
  doneEmitted: boolean;
  doneOk: boolean;
  recoverableToolError: boolean;
  messageEmitted: boolean;
};
