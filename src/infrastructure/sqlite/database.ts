import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SqliteDatabase = DatabaseSync;

export function openSqliteDatabase(filePath: string): SqliteDatabase {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  return db;
}

export function closeSqliteDatabase(db: SqliteDatabase): void {
  db.close();
}
