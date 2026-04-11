import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import type { DispatchAttemptStatus } from "./types";

interface DispatchRecord {
  pluginId: string;
  itemId: string;
  phase: string;
  dedupeKey: string;
  sessionId: string;
  model: string;
}

interface DispatchAttemptStartRecord {
  pluginId: string;
  itemId: string;
  phase: string;
  dedupeKey: string;
  status?: DispatchAttemptStatus;
  reason?: string;
}

interface DispatchAttemptStatusUpdate {
  dedupeKey: string;
  attempt: number;
  status: DispatchAttemptStatus;
  sessionId?: string | null;
  reason?: string | null;
  lastMessageId?: string | null;
  lastTool?: string | null;
  lastToolStatus?: string | null;
  endAttempt?: boolean;
}

export interface ActiveDispatchAttempt {
  id: number;
  pluginId: string;
  itemId: string;
  phase: string;
  dedupeKey: string;
  attempt: number;
  sessionId: string | null;
  status: DispatchAttemptStatus;
  reason: string | null;
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
  lastMessageId: string | null;
  lastTool: string | null;
  lastToolStatus: string | null;
}

export class DispatchStore {
  private readonly db: Database;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath, { create: true });
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dispatches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plugin_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        dedupe_key TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS dispatch_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plugin_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        dedupe_key TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        session_id TEXT,
        status TEXT NOT NULL,
        reason TEXT,
        last_message_id TEXT,
        last_tool TEXT,
        last_tool_status TEXT,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        ended_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(dedupe_key, attempt)
      );

      CREATE INDEX IF NOT EXISTS idx_dispatch_attempts_dedupe
      ON dispatch_attempts(dedupe_key);

      CREATE INDEX IF NOT EXISTS idx_dispatch_attempts_active
      ON dispatch_attempts(ended_at, updated_at);
    `);
  }

  private nextAttemptNumber(dedupeKey: string): number {
    const row = this.db
      .query("SELECT COALESCE(MAX(attempt), 0) + 1 AS next_attempt FROM dispatch_attempts WHERE dedupe_key = ?")
      .get(dedupeKey) as { next_attempt: number } | null;
    return Number(row?.next_attempt ?? 1);
  }

  startDispatchAttempt(record: DispatchAttemptStartRecord): number {
    const attempt = this.nextAttemptNumber(record.dedupeKey);
    const now = new Date().toISOString();

    this.db
      .query(
        `
          INSERT INTO dispatch_attempts (
            plugin_id,
            item_id,
            phase,
            dedupe_key,
            attempt,
            status,
            reason,
            started_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        record.pluginId,
        record.itemId,
        record.phase,
        record.dedupeKey,
        attempt,
        record.status ?? "dispatch_started",
        record.reason ?? null,
        now,
        now
      );

    return attempt;
  }

  updateDispatchAttemptStatus(input: DispatchAttemptStatusUpdate): void {
    const updates: string[] = ["status = ?", "updated_at = ?"];
    const values: unknown[] = [input.status, new Date().toISOString()];

    if (input.sessionId !== undefined) {
      updates.push("session_id = ?");
      values.push(input.sessionId);
    }

    if (input.reason !== undefined) {
      updates.push("reason = ?");
      values.push(input.reason);
    }

    if (input.lastMessageId !== undefined) {
      updates.push("last_message_id = ?");
      values.push(input.lastMessageId);
    }

    if (input.lastTool !== undefined) {
      updates.push("last_tool = ?");
      values.push(input.lastTool);
    }

    if (input.lastToolStatus !== undefined) {
      updates.push("last_tool_status = ?");
      values.push(input.lastToolStatus);
    }

    if (input.endAttempt) {
      updates.push("ended_at = ?");
      values.push(new Date().toISOString());
    }

    values.push(input.dedupeKey, input.attempt);

    this.db
      .query(
        `
          UPDATE dispatch_attempts
          SET ${updates.join(", ")}
          WHERE dedupe_key = ? AND attempt = ?
        `
      )
      .run(...values);
  }

  listActiveDispatchAttempts(limit = 200): ActiveDispatchAttempt[] {
    const rows = this.db
      .query(
        `
          SELECT
            id,
            plugin_id,
            item_id,
            phase,
            dedupe_key,
            attempt,
            session_id,
            status,
            reason,
            started_at,
            updated_at,
            ended_at,
            last_message_id,
            last_tool,
            last_tool_status
          FROM dispatch_attempts
          WHERE ended_at IS NULL
          ORDER BY updated_at ASC
          LIMIT ?
        `
      )
      .all(limit) as Array<{
      id: number;
      plugin_id: string;
      item_id: string;
      phase: string;
      dedupe_key: string;
      attempt: number;
      session_id: string | null;
      status: DispatchAttemptStatus;
      reason: string | null;
      started_at: string;
      updated_at: string;
      ended_at: string | null;
      last_message_id: string | null;
      last_tool: string | null;
      last_tool_status: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      pluginId: row.plugin_id,
      itemId: row.item_id,
      phase: row.phase,
      dedupeKey: row.dedupe_key,
      attempt: Number(row.attempt),
      sessionId: row.session_id,
      status: row.status,
      reason: row.reason,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      endedAt: row.ended_at,
      lastMessageId: row.last_message_id,
      lastTool: row.last_tool,
      lastToolStatus: row.last_tool_status,
    }));
  }

  hasDispatch(dedupeKey: string): boolean {
    const row = this.db
      .query("SELECT 1 FROM dispatches WHERE dedupe_key = ? LIMIT 1")
      .get(dedupeKey);
    return Boolean(row);
  }

  getSessionIdByDedupeKey(dedupeKey: string): string | undefined {
    const row = this.db
      .query("SELECT session_id FROM dispatches WHERE dedupe_key = ? LIMIT 1")
      .get(dedupeKey) as { session_id: string } | null;
    return row?.session_id;
  }

  recordDispatch(record: DispatchRecord): void {
    this.db
      .query(
        `
          INSERT INTO dispatches (
            plugin_id,
            item_id,
            phase,
            dedupe_key,
            session_id,
            model
          ) VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        record.pluginId,
        record.itemId,
        record.phase,
        record.dedupeKey,
        record.sessionId,
        record.model
      );
  }

  close(): void {
    this.db.close();
  }
}
