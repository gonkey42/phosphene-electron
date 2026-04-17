import type Database from "better-sqlite3";
import type { Migration } from "./types";
import initialSchema from "./migrations/001-initial-schema";

export const MIGRATIONS: readonly Migration[] = [initialSchema];

export function applyConnectionPragmas(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
}

function ensureVersionTable(db: Database.Database): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
}

export function getCurrentVersion(db: Database.Database): number {
  const row = db
    .prepare("SELECT MAX(version) as version FROM schema_version")
    .get() as { version: number | null } | undefined;
  return row?.version ?? 0;
}

export function runMigrations(db: Database.Database): void {
  ensureVersionTable(db);
  let current = getCurrentVersion(db);

  // Backfill: existing v0.2.1 DBs have the schema but no schema_version row
  if (current === 0) {
    const hasWorkspaces = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'",
      )
      .get();
    if (hasWorkspaces) {
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(1);
      current = 1;
    }
  }

  const pending = [...MIGRATIONS]
    .sort((a, b) => a.version - b.version)
    .filter((m) => m.version > current);

  for (const migration of pending) {
    const apply = db.transaction(() => {
      migration.up(db);
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(
        migration.version,
      );
    });
    apply();
  }
}
