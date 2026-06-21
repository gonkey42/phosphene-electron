import { ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { initializeSchema, resetSchemaBootstrapForTests } from "./schema";

let db: Database.Database | null = null;

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

function assertObjectPayload(channel: string, value: unknown, name: string): object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw createIPCContractError(channel, `expected ${name} to be an object`);
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
const LIST_ACTIVE_WORKSPACE_IDS_SQL =
  "SELECT id FROM workspaces WHERE deleted_at IS NULL ORDER BY position";
const LIST_BOARDS_SQL =
  "SELECT id, workspace_id, name, description, position, updated_at FROM boards WHERE deleted_at IS NULL ORDER BY position";
const LIST_BOARDS_BY_WORKSPACE_SQL =
  "SELECT id, workspace_id, name, description, position, updated_at FROM boards WHERE deleted_at IS NULL AND workspace_id = ? ORDER BY position";
const GET_BOARD_SQL =
  "SELECT id, workspace_id, name, description, canvas_data, thumbnail, position, created_at, updated_at, deleted_at FROM boards WHERE id = ? AND deleted_at IS NULL LIMIT 1";
const RENAME_BOARD_SQL = "UPDATE boards SET name = ? WHERE id = ? AND deleted_at IS NULL";
const DELETE_BOARD_SQL =
  "UPDATE boards SET deleted_at = datetime('now','utc') WHERE id = ? AND deleted_at IS NULL";
const SAVE_BOARD_CANVAS_DATA_SQL =
  "UPDATE boards SET canvas_data = ? WHERE id = ? AND deleted_at IS NULL";
const SAVE_BOARD_THUMBNAIL_SQL =
  "UPDATE boards SET thumbnail = ? WHERE id = ? AND deleted_at IS NULL";
const LIST_WORKSPACES_SQL =
  "SELECT id, name, icon, position FROM workspaces WHERE deleted_at IS NULL ORDER BY position";
const GET_WORKSPACE_SQL =
  "SELECT id, name, icon, position, layout_config, created_at, updated_at, deleted_at FROM workspaces WHERE id = ? AND deleted_at IS NULL LIMIT 1";
const RENAME_WORKSPACE_SQL =
  "UPDATE workspaces SET name = ? WHERE id = ? AND deleted_at IS NULL";
const DELETE_WORKSPACE_COUNT_SQL =
  "SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL";
const DELETE_WORKSPACE_SQL =
  "UPDATE workspaces SET deleted_at = datetime('now','utc') WHERE id = ? AND deleted_at IS NULL";
const GET_WORKSPACE_LAYOUT_SQL =
  "SELECT layout_config FROM workspaces WHERE id = ? AND deleted_at IS NULL LIMIT 1";
const SAVE_WORKSPACE_LAYOUT_SQL =
  "UPDATE workspaces SET layout_config = ? WHERE id = ? AND deleted_at IS NULL";
const GET_ACTIVE_WORKSPACE_ID_SQL =
  "SELECT value FROM settings WHERE key = ? LIMIT 1";
const UPSERT_ACTIVE_WORKSPACE_ID_SQL = `
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now','utc'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now','utc')
    `;

type BoardListRow = {
  id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  position: number;
  updated_at: string;
};

type BoardRow = BoardListRow & {
  canvas_data: string | null;
  thumbnail: string | null;
  created_at: string;
  deleted_at: string | null;
};

type WorkspaceListRow = {
  id: string;
  name: string;
  icon: string | null;
  position: number;
};

type WorkspaceRow = WorkspaceListRow & {
  layout_config: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function mapBoardListRow(row: BoardListRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    position: row.position,
    updatedAt: row.updated_at,
  };
}

function mapBoardRow(row: BoardRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    canvasData: row.canvas_data,
    thumbnail: row.thumbnail,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapWorkspaceListRow(row: WorkspaceListRow) {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    position: row.position,
  };
}

function parseWorkspaceLayout(layoutConfig: string | null): object | null {
  if (!layoutConfig) {
    return null;
  }

  try {
    const parsed = JSON.parse(layoutConfig);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function mapWorkspaceRow(row: WorkspaceRow) {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    position: row.position,
    layoutConfig: parseWorkspaceLayout(row.layout_config),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function assertWorkspaceReorderPermutation(database: Database.Database, orderedIds: string[]): void {
  const activeWorkspaceRows = database.prepare(LIST_ACTIVE_WORKSPACE_IDS_SQL).all() as Array<{
    id: string;
  }>;
  const activeWorkspaceIds = activeWorkspaceRows.map((row) => row.id);

  if (orderedIds.length !== activeWorkspaceIds.length) {
    throw new Error("Workspace reorder payload must contain each active workspace exactly once");
  }

  const activeWorkspaceIdSet = new Set(activeWorkspaceIds);
  const orderedWorkspaceIdSet = new Set<string>();

  for (const workspaceId of orderedIds) {
    if (orderedWorkspaceIdSet.has(workspaceId) || !activeWorkspaceIdSet.has(workspaceId)) {
      throw new Error("Workspace reorder payload must contain each active workspace exactly once");
    }

    orderedWorkspaceIdSet.add(workspaceId);
  }
}

export function getDatabase(userDataPath: string): Database.Database {
  if (db) return db;

  const dbPath = path.join(userDataPath, "phosphene.db");
  db = new Database(dbPath);
  try {
    initializeSchema(db);
  } catch (error) {
    db.close();
    db = null;
    resetSchemaBootstrapForTests();
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
  let translatedSql = "";
  let inSingleQuotedString = false;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];

    if (character === "'") {
      translatedSql += character;

      if (inSingleQuotedString && sql[index + 1] === "'") {
        translatedSql += sql[index + 1];
        index += 1;
      } else {
        inSingleQuotedString = !inSingleQuotedString;
      }

      continue;
    }

    if (!inSingleQuotedString && character === "$") {
      let placeholderDigits = "";
      let cursor = index + 1;

      while (cursor < sql.length && /[0-9]/.test(sql[cursor])) {
        placeholderDigits += sql[cursor];
        cursor += 1;
      }

      if (placeholderDigits.length > 0) {
        const placeholderIndex = Number.parseInt(placeholderDigits, 10) - 1;
        orderedParams.push(params?.[placeholderIndex]);
        translatedSql += "?";
        index = cursor - 1;
        continue;
      }
    }

    translatedSql += character;
  }

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

export function saveBoardCanvasDataDirect(
  database: Database.Database,
  boardId: string,
  canvasData: string,
): void {
  const result = database.prepare(SAVE_BOARD_CANVAS_DATA_SQL).run(canvasData, boardId) as {
    changes: number;
  };

  if (result.changes !== 1) {
    throw new Error(`Board canvas-data save affected ${result.changes} rows`);
  }
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
  assertWorkspaceReorderPermutation(database, orderedIds);

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

function getActiveWorkspaceId(database: Database.Database): string | null {
  const row = database.prepare(GET_ACTIVE_WORKSPACE_ID_SQL).get("active_workspace_id") as
    | { value?: string }
    | undefined;
  return row?.value ?? null;
}

function setActiveWorkspaceId(database: Database.Database, workspaceId: string): void {
  database.prepare(UPSERT_ACTIVE_WORKSPACE_ID_SQL).run("active_workspace_id", workspaceId);
}

export function setActiveWorkspaceIdDirect(database: Database.Database, workspaceId: string): void {
  setActiveWorkspaceId(database, workspaceId);
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

  ipcMain.handle("boards:list", async (_event, workspaceId: unknown = null) => {
    const validatedWorkspaceId = assertNullableStringPayload("boards:list", workspaceId, "workspaceId");

    if (validatedWorkspaceId === null) {
      return (database.prepare(LIST_BOARDS_SQL).all() as BoardListRow[]).map(mapBoardListRow);
    }

    return (database.prepare(LIST_BOARDS_BY_WORKSPACE_SQL).all(validatedWorkspaceId) as BoardListRow[]).map(
      mapBoardListRow,
    );
  });

  ipcMain.handle("boards:get", async (_event, boardId: unknown) => {
    const validatedBoardId = assertStringPayload("boards:get", boardId, "boardId");
    const rows = database.prepare(GET_BOARD_SQL).all(validatedBoardId) as BoardRow[];
    const row = rows[0];
    return row ? mapBoardRow(row) : null;
  });

  ipcMain.handle("boards:rename", async (_event, boardId: unknown, name: unknown) => {
    const validatedBoardId = assertStringPayload("boards:rename", boardId, "boardId");
    const validatedName = assertStringPayload("boards:rename", name, "name");
    const result = database.prepare(RENAME_BOARD_SQL).run(validatedName, validatedBoardId) as {
      changes: number;
    };

    if (result.changes !== 1) {
      throw new Error(`Board rename affected ${result.changes} rows`);
    }
  });

  ipcMain.handle("boards:delete", async (_event, boardId: unknown) => {
    const validatedBoardId = assertStringPayload("boards:delete", boardId, "boardId");
    const result = database.prepare(DELETE_BOARD_SQL).run(validatedBoardId) as {
      changes: number;
    };

    if (result.changes !== 1) {
      throw new Error(`Board delete affected ${result.changes} rows`);
    }
  });

  ipcMain.handle("boards:save-canvas-data", async (_event, boardId: unknown, canvasData: unknown) => {
    const validatedBoardId = assertStringPayload("boards:save-canvas-data", boardId, "boardId");
    const validatedCanvasData = assertStringPayload("boards:save-canvas-data", canvasData, "canvasData");
    saveBoardCanvasDataDirect(database, validatedBoardId, validatedCanvasData);
  });

  ipcMain.handle("boards:save-thumbnail", async (_event, boardId: unknown, thumbnail: unknown) => {
    const validatedBoardId = assertStringPayload("boards:save-thumbnail", boardId, "boardId");
    const validatedThumbnail = assertStringPayload("boards:save-thumbnail", thumbnail, "thumbnail");
    const result = database.prepare(SAVE_BOARD_THUMBNAIL_SQL).run(validatedThumbnail, validatedBoardId) as {
      changes: number;
    };

    if (result.changes !== 1) {
      throw new Error(`Board thumbnail save affected ${result.changes} rows`);
    }
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

  ipcMain.handle("workspaces:list", async () => {
    return (database.prepare(LIST_WORKSPACES_SQL).all() as WorkspaceListRow[]).map(mapWorkspaceListRow);
  });

  ipcMain.handle("workspaces:get", async (_event, workspaceId: unknown) => {
    const validatedWorkspaceId = assertStringPayload("workspaces:get", workspaceId, "workspaceId");
    const rows = database.prepare(GET_WORKSPACE_SQL).all(validatedWorkspaceId) as WorkspaceRow[];
    const row = rows[0];
    return row ? mapWorkspaceRow(row) : null;
  });

  ipcMain.handle("workspaces:rename", async (_event, workspaceId: unknown, name: unknown) => {
    const validatedWorkspaceId = assertStringPayload("workspaces:rename", workspaceId, "workspaceId");
    const validatedName = assertStringPayload("workspaces:rename", name, "name");
    const result = database.prepare(RENAME_WORKSPACE_SQL).run(validatedName, validatedWorkspaceId) as {
      changes: number;
    };

    if (result.changes !== 1) {
      throw new Error(`Workspace rename affected ${result.changes} rows`);
    }
  });

  ipcMain.handle("workspaces:delete", async (_event, workspaceId: unknown) => {
    const validatedWorkspaceId = assertStringPayload("workspaces:delete", workspaceId, "workspaceId");
    const countRow = database.prepare(DELETE_WORKSPACE_COUNT_SQL).get() as { count?: number } | undefined;

    if ((countRow?.count ?? 0) <= 1) {
      return false;
    }

    const result = database.prepare(DELETE_WORKSPACE_SQL).run(validatedWorkspaceId) as {
      changes: number;
    };

    if (result.changes !== 1) {
      throw new Error(`Workspace delete affected ${result.changes} rows`);
    }

    return true;
  });

  ipcMain.handle("workspaces:get-layout", async (_event, workspaceId: unknown) => {
    const validatedWorkspaceId = assertStringPayload("workspaces:get-layout", workspaceId, "workspaceId");
    const rows = database.prepare(GET_WORKSPACE_LAYOUT_SQL).all(validatedWorkspaceId) as
      | Array<{ layout_config: string | null }>
      | [];
    return parseWorkspaceLayout(rows[0]?.layout_config ?? null);
  });

  ipcMain.handle("workspaces:save-layout", async (_event, workspaceId: unknown, layoutConfig: unknown) => {
    const validatedWorkspaceId = assertStringPayload("workspaces:save-layout", workspaceId, "workspaceId");
    const validatedLayoutConfig = assertObjectPayload(
      "workspaces:save-layout",
      layoutConfig,
      "layoutConfig",
    );
    const result = database
      .prepare(SAVE_WORKSPACE_LAYOUT_SQL)
      .run(JSON.stringify(validatedLayoutConfig), validatedWorkspaceId) as {
      changes: number;
    };

    if (result.changes !== 1) {
      throw new Error(`Workspace layout save affected ${result.changes} rows`);
    }
  });

  ipcMain.handle("settings:get-active-workspace-id", async () => {
    return getActiveWorkspaceId(database);
  });

  ipcMain.handle("settings:set-active-workspace-id", async (_event, workspaceId: unknown) => {
    const validatedWorkspaceId = assertStringPayload(
      "settings:set-active-workspace-id",
      workspaceId,
      "workspaceId",
    );
    setActiveWorkspaceIdDirect(database, validatedWorkspaceId);
  });
}

export function closeDatabase(): void {
  db?.close();
  db = null;
  resetSchemaBootstrapForTests();
}
