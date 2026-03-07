export type ExternalToolErrorKind = "TIMEOUT" | "PROVIDER_5XX" | "NETWORK" | "SCHEMA_INVALID" | "UNKNOWN";

export type ToolErrorMapping = {
  recoverable: boolean;
  code: "TOOL_TIMEOUT" | "TOOL_EXECUTION_ERROR";
};

export function mapExternalToolError(kind: ExternalToolErrorKind): ToolErrorMapping {
  if (kind === "TIMEOUT") {
    return { recoverable: true, code: "TOOL_TIMEOUT" };
  }

  if (kind === "PROVIDER_5XX" || kind === "NETWORK" || kind === "SCHEMA_INVALID") {
    return { recoverable: true, code: "TOOL_EXECUTION_ERROR" };
  }

  return { recoverable: false, code: "TOOL_EXECUTION_ERROR" };
}
