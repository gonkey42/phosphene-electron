import type { Migration } from "../types";

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

const migration: Migration = {
  version: 1,
  description:
    "Initial schema: workspaces, boards, files, captures, settings + hot-path indexes",
  up(db) {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(WORKSPACES_TABLE_SQL);
    db.exec(BOARDS_TABLE_SQL);
    db.exec(FILES_TABLE_SQL);
    db.exec(CAPTURES_TABLE_SQL);
    db.exec(SETTINGS_TABLE_SQL);

    for (const table of ["workspaces", "boards", "files", "captures"]) {
      db.exec(UPDATED_AT_TRIGGER_SQL(table));
    }

    db.exec(
      "CREATE INDEX IF NOT EXISTS boards_workspace_id_idx ON boards(workspace_id)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS boards_position_idx ON boards(workspace_id, position)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS boards_deleted_at_idx ON boards(deleted_at)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS files_board_id_idx ON files(board_id)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS captures_board_id_idx ON captures(board_id)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS workspaces_position_idx ON workspaces(position)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS workspaces_deleted_at_idx ON workspaces(deleted_at)",
    );
  },
};

export default migration;
