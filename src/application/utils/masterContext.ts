export function summarizeMasterContext(masterContext: string): string {
  const trimmed = masterContext.trim();
  if (trimmed.length === 0) {
    return "";
  }

  return [...trimmed].slice(0, 120).join("");
}

export function normalizeMasterContext(masterContext: string): string {
  return masterContext.replace(/\r\n/g, "\n").trim();
}

export function clampMasterContext(masterContext: string, maxCodePoints: number = 4000): string {
  return [...normalizeMasterContext(masterContext)].slice(0, maxCodePoints).join("").trim();
}
