import { ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";

let db: Database.Database | null = null;
let databaseBootstrapped = false;

type BackupFailureReason = "permission-denied" | "destination-missing" | "backup-failed";

export type DatabaseBackupResult =
  | {
      status: "created";
      destinationPath: string;
    }
  | {
      status: "skipped";
      reason: "already-exists";
      destinationPath: string;
    }
  | {
      status: "failed";
      reason: BackupFailureReason;
      destinationPath: string;
      message: string;
    };

function createIPCContractError(channel: string, message: string): Error {
  return new Error(`[IPC ${channel}] Invalid payload: ${message}`);
}

function assertStringPayload(channel: string, value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw createIPCContractError(channel, `expected ${name} to be a string`);
  }

  return value;
}

function assertNullableStringPayload(channel: string, value: unknown, name: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw createIPCContractError(channel, `expected ${name} to be a string or null`);
  }

  return value;
}

function assertParamsPayload(channel: string, value: unknown): unknown[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw createIPCContractError(channel, "expected params to be an array");
  }

  return value;
}

function assertStringArrayPayload(channel: string, value: unknown, name: string): string[] {
  if (!Array.isArray(value)) {
    throw createIPCContractError(channel, `expected ${name} to be an array of strings`);
  }

  for (const entry of value) {
    if (typeof entry !== "string") {
      throw createIPCContractError(channel, `expected ${name} to be an array of strings`);
    }
  }

  return value;
}

const CREATE_BOARD_POSITION_SQL_NULL =
  "SELECT COALESCE(MAX(position), -1) + 1 as position FROM boards WHERE deleted_at IS NULL AND workspace_id IS NULL";
const CREATE_BOARD_POSITION_SQL =
  "SELECT COALESCE(MAX(position), -1) + 1 as position FROM boards WHERE deleted_at IS NULL AND workspace_id = ?";
const INSERT_BOARD_SQL =
  "INSERT INTO boards (id, workspace_id, name, position) VALUES (?, ?, ?, ?)";
const CREATE_WORKSPACE_POSITION_SQL =
  "SELECT COALESCE(MAX(position), -1) + 1 as position FROM workspaces WHERE deleted_at IS NULL";
const INSERT_WORKSPACE_SQL =
  "INSERT INTO workspaces (id, name, icon, position) VALUES (?, ?, ?, ?)";
const REORDER_WORKSPACE_SQL =
  "UPDATE workspaces SET position = ? WHERE id = ? AND deleted_at IS NULL";
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

export function getDatabase(userDataPath: string): Database.Database {
  if (db) return db;

  const dbPath = path.join(userDataPath, "phosphene.db");
  db = new Database(dbPath);
  try {
    initializeSchema(db);
  } catch (error) {
    db.close();
    db = null;
    databaseBootstrapped = false;
    throw error;
  }

  return db;
}

/**
 * Translate `$1`, `$2`, ... positional placeholders to `?` anonymous placeholders.
 * The existing codebase uses Tauri's `$N` positional syntax, but `better-sqlite3`
 * treats `$N` as named parameters (expecting an object like `{ 1: val }`).
 * Anonymous `?` placeholders work with positional spread arguments.
 */
function translateParams(sql: string, params?: unknown[]): { sql: string; params: unknown[] } {
  const orderedParams: unknown[] = [];
  const translatedSql = sql.replace(/\$(\d+)/g, (_match, indexText: string) => {
    const index = Number.parseInt(indexText, 10) - 1;
    orderedParams.push(params?.[index]);
    return "?";
  });

  return {
    sql: translatedSql,
    params: orderedParams,
  };
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function isMissingPathError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === "ENOENT" || code === "ENOTDIR";
}

function isPermissionError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === "EACCES" || code === "EPERM";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function classifyBackupFailure(error: unknown): BackupFailureReason {
  if (isPermissionError(error)) {
    return "permission-denied";
  }

  if (isMissingPathError(error)) {
    return "destination-missing";
  }

  return "backup-failed";
}

function generateId(): string {
  return randomUUID().replace(/-/g, "");
}

function initializeSchema(database: Database.Database): void {
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

export function createBoard(
  database: Database.Database,
  name: string,
  workspaceId: string | null,
): string {
  const runCreateBoard = database.transaction((boardName: string, boardWorkspaceId: string | null) => {
    const nextPositionRow =
      boardWorkspaceId === null
        ? (database.prepare(CREATE_BOARD_POSITION_SQL_NULL).get() as { position?: number } | undefined)
        : (database.prepare(CREATE_BOARD_POSITION_SQL).get(boardWorkspaceId) as
            | { position?: number }
            | undefined);
    const position = nextPositionRow?.position ?? 0;
    const id = generateId();

    database.prepare(INSERT_BOARD_SQL).run(id, boardWorkspaceId, boardName, position);

    return id;
  });

  return runCreateBoard(name, workspaceId);
}

export function createWorkspace(
  database: Database.Database,
  name: string,
  icon: string | null,
): string {
  const runCreateWorkspace = database.transaction((workspaceName: string, workspaceIcon: string | null) => {
    const nextPositionRow = database.prepare(CREATE_WORKSPACE_POSITION_SQL).get() as
      | { position?: number }
      | undefined;
    const position = nextPositionRow?.position ?? 0;
    const id = generateId();

    database.prepare(INSERT_WORKSPACE_SQL).run(id, workspaceName, workspaceIcon, position);

    return id;
  });

  return runCreateWorkspace(name, icon);
}

export function reorderWorkspaces(database: Database.Database, orderedIds: string[]): void {
  const runReorderWorkspaces = database.transaction((workspaceIds: string[]) => {
    for (let index = 0; index < workspaceIds.length; index += 1) {
      const result = database.prepare(REORDER_WORKSPACE_SQL).run(index, workspaceIds[index]) as {
        changes: number;
      };

      if (result.changes !== 1) {
        throw new Error(`Workspace reorder affected ${result.changes} rows`);
      }
    }
  });

  runReorderWorkspaces(orderedIds);
}

export async function backupDatabase(
  database: Database.Database,
  destinationPath: string,
): Promise<DatabaseBackupResult> {
  try {
    await fs.access(destinationPath);
    return {
      status: "skipped",
      reason: "already-exists",
      destinationPath,
    };
  } catch (error) {
    if (!isMissingPathError(error)) {
      return {
        status: "failed",
        reason: classifyBackupFailure(error),
        destinationPath,
        message: getErrorMessage(error),
      };
    }
  }

  try {
    await database.backup(destinationPath);
    return {
      status: "created",
      destinationPath,
    };
  } catch (error) {
    return {
      status: "failed",
      reason: classifyBackupFailure(error),
      destinationPath,
      message: getErrorMessage(error),
    };
  }
}

export function registerDatabaseIPC(userDataPath: string): void {
  const database = getDatabase(userDataPath);

  ipcMain.handle("db:execute", async (_event, sql: unknown, params?: unknown) => {
    const validatedSql = assertStringPayload("db:execute", sql, "sql");
    const validatedParams = assertParamsPayload("db:execute", params);
    const translated = translateParams(validatedSql, validatedParams);
    const statement = database.prepare(translated.sql);
    const result = statement.run(...translated.params);
    return { rowsAffected: result.changes };
  });

  ipcMain.handle("db:select", async (_event, sql: unknown, params?: unknown) => {
    const validatedSql = assertStringPayload("db:select", sql, "sql");
    const validatedParams = assertParamsPayload("db:select", params);
    const translated = translateParams(validatedSql, validatedParams);
    const statement = database.prepare(translated.sql);

    if (translated.params.length > 0) {
      return statement.all(...translated.params);
    }

    return statement.all();
  });

  ipcMain.handle("db:backup", async (_event, destinationPath: unknown): Promise<DatabaseBackupResult> => {
    const validatedDestinationPath = assertStringPayload("db:backup", destinationPath, "destinationPath");
    return backupDatabase(database, validatedDestinationPath);
  });

  ipcMain.handle("boards:create", async (_event, name: unknown, workspaceId?: unknown) => {
    const validatedName = assertStringPayload("boards:create", name, "name");
    const validatedWorkspaceId = assertNullableStringPayload("boards:create", workspaceId, "workspaceId");
    return createBoard(database, validatedName, validatedWorkspaceId);
  });

  ipcMain.handle("workspaces:create", async (_event, name: unknown, icon?: unknown) => {
    const validatedName = assertStringPayload("workspaces:create", name, "name");
    const validatedIcon = assertNullableStringPayload("workspaces:create", icon, "icon");
    return createWorkspace(database, validatedName, validatedIcon);
  });

  ipcMain.handle("workspaces:reorder", async (_event, orderedIds: unknown) => {
    const validatedOrderedIds = assertStringArrayPayload(
      "workspaces:reorder",
      orderedIds,
      "orderedIds",
    );
    reorderWorkspaces(database, validatedOrderedIds);
  });
}

export function closeDatabase(): void {
  db?.close();
  db = null;
  databaseBootstrapped = false;
}
