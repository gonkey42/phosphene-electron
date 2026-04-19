import { boards, type BoardListItem as DesktopBoardListItem, type BoardRecord as DesktopBoardRecord } from "../platform/desktop-api";

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

export async function listBoards(workspaceId?: string): Promise<BoardListItem[]> {
  const items = (await boards.list(workspaceId ?? null)) as DesktopBoardListItem[];

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    position: item.position,
    updated_at: item.updatedAt,
    workspace_id: item.workspaceId,
  }));
}

export async function getBoard(boardId: string): Promise<BoardRecord | null> {
  const board = (await boards.get(boardId)) as DesktopBoardRecord | null;
  if (!board) {
    return null;
  }

  return {
    id: board.id,
    workspace_id: board.workspaceId,
    name: board.name,
    description: board.description,
    canvas_data: board.canvasData,
    thumbnail: board.thumbnail,
    position: board.position,
    created_at: board.createdAt,
    updated_at: board.updatedAt,
    deleted_at: board.deletedAt,
  };
}

export async function createBoard(name: string, workspaceId: string | null): Promise<string> {
  return boards.createBoard(name, workspaceId);
}

export async function renameBoard(boardId: string, name: string): Promise<void> {
  await boards.rename(boardId, name);
}

export async function deleteBoard(boardId: string): Promise<void> {
  await boards.delete(boardId);
}

export async function saveBoardCanvasData(boardId: string, canvasData: string): Promise<void> {
  await boards.saveCanvasData(boardId, canvasData);
}

export async function saveBoardThumbnail(boardId: string, thumbnail: string): Promise<void> {
  await boards.saveThumbnail(boardId, thumbnail);
}
