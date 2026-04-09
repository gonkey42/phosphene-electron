import { getDb } from "./database";
import type { DatabaseLike } from "./database";
import { boards } from "../platform/desktop-api";

export interface BoardRecord {
  id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  canvas_data: string | null;
  thumbnail: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BoardListItem {
  id: string;
  name: string;
  description: string | null;
  position: number;
  updated_at: string;
  workspace_id: string | null;
}

export function mapBoardItems(items: BoardListItem[]) {
  return items.map((item) => ({
    id: item.id,
    workspaceId: item.workspace_id,
    name: item.name,
    description: item.description,
    position: item.position,
    updatedAt: item.updated_at,
  }));
}

async function getDatabase(): Promise<DatabaseLike> {
  return await getDb();
}

function assertSingleBoardMutation(result: { rowsAffected: number }, action: string): void {
  if (result.rowsAffected === 0) {
    throw new Error(`Board ${action} affected 0 rows`);
  }
}

export async function listBoards(workspaceId?: string): Promise<BoardListItem[]> {
  const db = await getDatabase();

  if (workspaceId === undefined) {
    return db.select<BoardListItem[]>(
      "SELECT id, name, description, position, updated_at, workspace_id FROM boards WHERE deleted_at IS NULL ORDER BY position",
      [],
    );
  }

  return db.select<BoardListItem[]>(
    "SELECT id, name, description, position, updated_at, workspace_id FROM boards WHERE deleted_at IS NULL AND workspace_id = $1 ORDER BY position",
    [workspaceId],
  );
}

export async function getBoard(boardId: string): Promise<BoardRecord | null> {
  const db = await getDatabase();
  const rows = await db.select<BoardRecord[]>(
    "SELECT id, workspace_id, name, description, canvas_data, thumbnail, position, created_at, updated_at, deleted_at FROM boards WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
    [boardId],
  );

  return rows[0] ?? null;
}

export async function createBoard(name: string, workspaceId: string | null): Promise<string> {
  return boards.createBoard(name, workspaceId);
}

export async function renameBoard(boardId: string, name: string): Promise<void> {
  const db = await getDatabase();
  const result = await db.execute("UPDATE boards SET name = $2 WHERE id = $1 AND deleted_at IS NULL", [
    boardId,
    name,
  ]);
  assertSingleBoardMutation(result, "rename");
}

export async function deleteBoard(boardId: string): Promise<void> {
  const db = await getDatabase();
  const result = await db.execute(
    "UPDATE boards SET deleted_at = datetime('now','utc') WHERE id = $1 AND deleted_at IS NULL",
    [boardId],
  );
  assertSingleBoardMutation(result, "delete");
}

export async function saveBoardCanvasData(boardId: string, canvasData: string): Promise<void> {
  const db = await getDatabase();
  const result = await db.execute(
    "UPDATE boards SET canvas_data = $2 WHERE id = $1 AND deleted_at IS NULL",
    [boardId, canvasData],
  );
  assertSingleBoardMutation(result, "save");
}

export async function saveBoardThumbnail(boardId: string, thumbnail: string): Promise<void> {
  const db = await getDatabase();
  const result = await db.execute("UPDATE boards SET thumbnail = $2 WHERE id = $1 AND deleted_at IS NULL", [
    boardId,
    thumbnail,
  ]);
  assertSingleBoardMutation(result, "thumbnail save");
}
