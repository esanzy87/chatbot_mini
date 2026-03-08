# DB 스키마 문서 (SQLite)

## 개요
- 엔진: SQLite (`node:sqlite`)
- 시간 포맷: UTC ISO 8601 TEXT (`YYYY-MM-DDTHH:mm:ss.SSSZ`)
- FK: `PRAGMA foreign_keys=ON`

## 테이블

### `sessions`
- `id TEXT PRIMARY KEY` (`sess_<ULID>`)
- `consecutive_tool_failure_turns INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_tool_failure_turns >= 0)`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### `master_contexts`
- `session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE`
- `content TEXT NOT NULL`
- `summary TEXT NOT NULL`

### `messages`
- `id TEXT PRIMARY KEY` (ULID)
- `session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE`
- `turn_id TEXT NOT NULL` (`turn_<ULID>`)
- `role TEXT NOT NULL CHECK (role IN ('user', 'ai', 'tool', 'system'))`
- `content TEXT NOT NULL`
- `metadata TEXT NOT NULL DEFAULT '{}'`
- `created_at TEXT NOT NULL`

### `tool_executions`
- `id TEXT PRIMARY KEY` (ULID)
- `session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE`
- `turn_id TEXT NOT NULL`
- `tool_call_id TEXT NOT NULL UNIQUE` (`tool_<ULID>`)
- `tool_name TEXT NOT NULL`
- `args TEXT NOT NULL` (JSON)
- `result TEXT NOT NULL` (JSON)
- `ok INTEGER NOT NULL CHECK (ok IN (0,1))`
- `latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0)`
- `created_at TEXT NOT NULL`

### `decision_traces`
- `id TEXT PRIMARY KEY` (ULID)
- `session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE`
- `turn_id TEXT NOT NULL UNIQUE`
- `next_action TEXT NOT NULL`
- `reason_summary TEXT NOT NULL`
- `allowed_tools TEXT NOT NULL` (JSON)
- `created_at TEXT NOT NULL`

## 인덱스
- `idx_messages_session_created_at` on `messages(session_id, created_at)`
- `idx_tool_exec_session_turn` on `tool_executions(session_id, turn_id)`
- `idx_tool_exec_tool_call_id` on `tool_executions(tool_call_id)`
- `idx_trace_session_created_turn` on `decision_traces(session_id, created_at, turn_id)`

## 트랜잭션 규칙
- `createSession`: `sessions + master_contexts` 원자 저장
- `finalizeTurn`: `messages + tool_executions + decision_traces + sessions(updated_at/counter)` 원자 저장
- 트랜잭션 시작: `BEGIN IMMEDIATE`
