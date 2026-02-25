import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";

interface DispatchRecord {
  pluginId: string;
  itemId: string;
  phase: string;
  dedupeKey: string;
  sessionId: string;
  model: string;
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
    `);
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
