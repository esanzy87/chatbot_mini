export function toDbIsoUtc(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const iso = date.toISOString();
  return iso;
}
