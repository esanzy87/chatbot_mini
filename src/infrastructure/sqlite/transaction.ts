import type { SqliteDatabase } from "@/infrastructure/sqlite/database";

type ExecutableDb = Pick<SqliteDatabase, "exec">;

export function withImmediateTransaction<T>(db: ExecutableDb, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
