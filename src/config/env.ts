import { z } from "zod";

export type AppMode = "stub" | "live";

export type AppConfig = {
  llmMode: AppMode;
  searchMode: AppMode;
  geminiApiKey?: string;
  tavilyApiKey?: string;
  internalToolToken: string;
  nodeEnv: string;
};

export type ConfigErrorCode =
  | "ENV_MODE_INVALID"
  | "ENV_REQUIRED_MISSING"
  | "ENV_INTERNAL_TOKEN_MISSING";

export class AppConfigError extends Error {
  readonly code: ConfigErrorCode;

  constructor(code: ConfigErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AppConfigError";
  }
}

const modeSchema = z.enum(["stub", "live"]);

function parseMode(rawValue: string | undefined, envName: "APP_LLM_MODE" | "APP_SEARCH_MODE"): AppMode {
  if (rawValue === undefined) {
    return "stub";
  }

  if (rawValue === "") {
    throw new AppConfigError(
      "ENV_MODE_INVALID",
      `${envName} must be one of stub|live; empty string is not allowed.`
    );
  }

  const parsed = modeSchema.safeParse(rawValue);
  if (!parsed.success) {
    throw new AppConfigError("ENV_MODE_INVALID", `${envName} must be one of stub|live.`);
  }

  return parsed.data;
}

function requireNonEmpty(value: string | undefined, envName: string): string {
  if (value === undefined || value === "") {
    throw new AppConfigError("ENV_REQUIRED_MISSING", `${envName} is required.`);
  }
  return value;
}

export function parseAppConfig(rawEnv: NodeJS.ProcessEnv): AppConfig {
  const nodeEnv = rawEnv.NODE_ENV ?? "development";
  const llmMode = parseMode(rawEnv.APP_LLM_MODE, "APP_LLM_MODE");
  const searchMode = parseMode(rawEnv.APP_SEARCH_MODE, "APP_SEARCH_MODE");

  let internalToolToken = rawEnv.INTERNAL_TOOL_TOKEN;
  if ((internalToolToken === undefined || internalToolToken === "") && nodeEnv === "test") {
    internalToolToken = "test-internal-token";
  }

  if (internalToolToken === undefined || internalToolToken === "") {
    throw new AppConfigError(
      "ENV_INTERNAL_TOKEN_MISSING",
      "INTERNAL_TOOL_TOKEN is required outside NODE_ENV=test."
    );
  }

  const geminiApiKey = llmMode === "live" ? requireNonEmpty(rawEnv.GEMINI_API_KEY, "GEMINI_API_KEY") : undefined;
  const tavilyApiKey =
    searchMode === "live" ? requireNonEmpty(rawEnv.TAVILY_API_KEY, "TAVILY_API_KEY") : undefined;

  return {
    llmMode,
    searchMode,
    internalToolToken,
    nodeEnv,
    ...(geminiApiKey !== undefined ? { geminiApiKey } : {}),
    ...(tavilyApiKey !== undefined ? { tavilyApiKey } : {})
  };
}

export type LoggerLike = {
  error: (message: string, meta?: Record<string, unknown>) => void;
};

export function loadAppConfig(
  rawEnv: NodeJS.ProcessEnv = process.env,
  logger: LoggerLike = console
): AppConfig {
  try {
    return parseAppConfig(rawEnv);
  } catch (error) {
    if (error instanceof AppConfigError) {
      logger.error("CONFIG_LOAD_FAILED", {
        code: error.code,
        message: error.message
      });
    }
    throw error;
  }
}
