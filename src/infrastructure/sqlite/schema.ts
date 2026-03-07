import type { SqliteDatabase } from "@/infrastructure/sqlite/database";

export function applySchema(db: SqliteDatabase): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  consecutive_tool_failure_turns INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_tool_failure_turns >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS master_contexts (
  session_id TEXT PRIMARY KEY NOT NULL,
  content TEXT NOT NULL,
  summary TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','ai','tool','system')),
  content TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tool_executions (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  tool_call_id TEXT NOT NULL UNIQUE,
  tool_name TEXT NOT NULL,
  args TEXT NOT NULL,
  result TEXT NOT NULL,
  ok INTEGER NOT NULL CHECK (ok IN (0,1)),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS decision_traces (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL UNIQUE,
  next_action TEXT NOT NULL,
  reason_summary TEXT NOT NULL,
  allowed_tools TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session_created_at ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tool_exec_session_turn ON tool_executions(session_id, turn_id);
CREATE INDEX IF NOT EXISTS idx_tool_exec_tool_call_id ON tool_executions(tool_call_id);
CREATE INDEX IF NOT EXISTS idx_trace_session_created_turn ON decision_traces(session_id, created_at, turn_id);
`);
}
