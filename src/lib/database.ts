import { db } from "../platform/desktop-api";
import { generateId } from "./uuid";

type DatabaseLike = {
  execute: (sql: string, params?: unknown[]) => Promise<{ rowsAffected: number }>;
  select: <T>(sql: string, params?: unknown[]) => Promise<T>;
};

let dbPromise: Promise<DatabaseLike> | null = null;

export async function getDb(): Promise<DatabaseLike> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = db as DatabaseLike;
      await initializeSchema(database);
      return database;
    })().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }

  return dbPromise;
}

async function initializeSchema(database: DatabaseLike): Promise<void> {
  await database.execute("PRAGMA journal_mode=WAL");
  await database.execute("PRAGMA foreign_keys=ON");

  await database.execute(`
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
  `);

  await database.execute(`
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
  `);

  await database.execute(`
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
  `);

  await database.execute(`
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
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','utc'))
    )
  `);

  for (const table of ["workspaces", "boards", "files", "captures"]) {
    await database.execute(`
      CREATE TRIGGER IF NOT EXISTS ${table}_updated_at
      AFTER UPDATE ON ${table}
      FOR EACH ROW
      BEGIN
        UPDATE ${table}
        SET updated_at = datetime('now','utc')
        WHERE id = NEW.id;
      END
    `);
  }

  const workspaces = await database.select<Array<{ count: number }>>(
    "SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL",
  );

  if (workspaces[0]?.count === 0) {
    await database.execute(
      "INSERT INTO workspaces (id, name, icon, position) VALUES ($1, $2, $3, $4)",
      [generateId(), "Home", "\u{1F3E0}", 0],
    );
  }
}
