import path from "node:path";
import { loadAppConfig } from "@/config/env";
import type { AppConfig } from "@/config/env";
import type { LlmPort } from "@/application/ports/llm";
import type { SearchPort } from "@/application/ports/search";
import type {
  ChatTurnRepository,
  SessionRepository,
  TraceRepository
} from "@/application/ports/repository";
import { CreateSessionUseCase } from "@/application/usecases/createSession";
import { GetSessionUseCase } from "@/application/usecases/getSession";
import { HandleChatTurnUseCase } from "@/application/usecases/handleChatTurn";
import { RunToolUseCase } from "@/application/usecases/runTool";
import { GetReasoningTraceUseCase } from "@/application/usecases/getReasoningTrace";
import { openSqliteDatabase } from "@/infrastructure/sqlite/database";
import { applySchema } from "@/infrastructure/sqlite/schema";
import { SqliteRepository } from "@/infrastructure/sqlite/repository";
import { createLlmAdapter, createSearchAdapter } from "@/infrastructure/factory/createAdapters";

export type AppContainer = {
  config: AppConfig;
  llmPort: LlmPort;
  searchPort: SearchPort;
  sessionRepository: SessionRepository;
  traceRepository: TraceRepository;
  chatTurnRepository: ChatTurnRepository;
  sqliteRepository: SqliteRepository;
  useCases: {
    createSession: CreateSessionUseCase;
    getSession: GetSessionUseCase;
    handleChatTurn: HandleChatTurnUseCase;
    runTool: RunToolUseCase;
    getReasoningTrace: GetReasoningTraceUseCase;
  };
};

let containerSingleton: AppContainer | null = null;

function resolveDbPath(config: AppConfig): string {
  if (config.nodeEnv === "test") {
    return ":memory:";
  }

  return path.join(process.cwd(), "data", "chatbot_mini.sqlite");
}

export function createContainer(): AppContainer {
  const config = loadAppConfig();
  const db = openSqliteDatabase(resolveDbPath(config));
  applySchema(db);

  const sqliteRepository = new SqliteRepository(db);
  const llmPort = createLlmAdapter(config);
  const searchPort = createSearchAdapter(config);

  return {
    config,
    llmPort,
    searchPort,
    sessionRepository: sqliteRepository,
    traceRepository: sqliteRepository,
    chatTurnRepository: sqliteRepository,
    sqliteRepository,
    useCases: {
      createSession: new CreateSessionUseCase(sqliteRepository),
      getSession: new GetSessionUseCase(sqliteRepository),
      handleChatTurn: new HandleChatTurnUseCase(llmPort, sqliteRepository, sqliteRepository),
      runTool: new RunToolUseCase(searchPort),
      getReasoningTrace: new GetReasoningTraceUseCase(sqliteRepository)
    }
  };
}

export function getContainer(): AppContainer {
  if (!containerSingleton) {
    containerSingleton = createContainer();
  }
  return containerSingleton;
}

export function resetContainerForTest(): void {
  containerSingleton = null;
}
