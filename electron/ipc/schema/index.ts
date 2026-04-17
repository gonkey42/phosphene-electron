import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

let databaseBootstrapped = false;

const WORKSPACES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    layout_config TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
    deleted_at TEXT,
    device_id TEXT
  )
`;

const BOARDS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    canvas_data TEXT,
    thumbnail TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
    deleted_at TEXT,
    device_id TEXT,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
  )
`;

const FILES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    board_id TEXT,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
    deleted_at TEXT,
    device_id TEXT,
    FOREIGN KEY (board_id) REFERENCES boards(id)
  )
`;

const CAPTURES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS captures (
    id TEXT PRIMARY KEY,
    content_type TEXT NOT NULL,
    content TEXT NOT NULL,
    source_url TEXT,
    board_id TEXT,
    processed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
    deleted_at TEXT,
    device_id TEXT,
    FOREIGN KEY (board_id) REFERENCES boards(id)
  )
`;

const SETTINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now','utc'))
  )
`;

const UPDATED_AT_TRIGGER_SQL = (table: string) => `
  CREATE TRIGGER IF NOT EXISTS ${table}_updated_at
  AFTER UPDATE ON ${table}
  FOR EACH ROW
  BEGIN
    UPDATE ${table}
    SET updated_at = datetime('now','utc')
    WHERE id = NEW.id;
  END
`;

const INSERT_WORKSPACE_SQL =
  "INSERT INTO workspaces (id, name, icon, position) VALUES (?, ?, ?, ?)";

function generateId(): string {
  return randomUUID().replace(/-/g, "");
}

export function initializeSchema(database: Database.Database): void {
  if (databaseBootstrapped) {
    return;
  }

  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(WORKSPACES_TABLE_SQL);
  database.exec(BOARDS_TABLE_SQL);
  database.exec(FILES_TABLE_SQL);
  database.exec(CAPTURES_TABLE_SQL);
  database.exec(SETTINGS_TABLE_SQL);

  for (const table of ["workspaces", "boards", "files", "captures"]) {
    database.exec(UPDATED_AT_TRIGGER_SQL(table));
  }

  const workspaceCount = database.prepare(
    "SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL",
  ).get() as { count?: number } | undefined;

  if ((workspaceCount?.count ?? 0) === 0) {
    database.prepare(INSERT_WORKSPACE_SQL).run(generateId(), "Home", "\u{1F3E0}", 0);
  }

  databaseBootstrapped = true;
}

export function resetSchemaBootstrapForTests(): void {
  databaseBootstrapped = false;
}
