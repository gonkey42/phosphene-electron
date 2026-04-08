import { getDb } from "./database";
import { generateId } from "./uuid";

export interface WorkspaceRecord {
  id: string;
  name: string;
  icon: string | null;
  position: number;
  layout_config: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WorkspaceListItem {
  id: string;
  name: string;
  icon: string | null;
  position: number;
}

export function mapWorkspace(item: WorkspaceListItem) {
  return {
    id: item.id,
    name: item.name,
    icon: item.icon ?? "📋",
    position: item.position,
  };
}

type DatabaseLike = {
  execute: (sql: string, params?: unknown[]) => Promise<unknown>;
  select: <T>(sql: string, params?: unknown[]) => Promise<T>;
};

async function getDatabase(): Promise<DatabaseLike> {
  return (await getDb()) as unknown as DatabaseLike;
}

export async function listWorkspaces(): Promise<WorkspaceListItem[]> {
  const db = await getDatabase();
  return db.select<WorkspaceListItem[]>(
    "SELECT id, name, icon, position FROM workspaces WHERE deleted_at IS NULL ORDER BY position",
    [],
  );
}

export async function getWorkspace(id: string): Promise<WorkspaceRecord | null> {
  const db = await getDatabase();
  const rows = await db.select<WorkspaceRecord[]>(
    "SELECT id, name, icon, position, layout_config, created_at, updated_at, deleted_at FROM workspaces WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
    [id],
  );

  return rows[0] ?? null;
}

export async function createWorkspace(name: string, icon?: string): Promise<string> {
  const db = await getDatabase();
  const id = generateId();
  const nextPositionRows = await db.select<Array<{ position: number }>>(
    "SELECT COALESCE(MAX(position), -1) + 1 as position FROM workspaces WHERE deleted_at IS NULL",
    [],
  );
  const position = nextPositionRows[0]?.position ?? 0;

  await db.execute("INSERT INTO workspaces (id, name, icon, position) VALUES ($1, $2, $3, $4)", [
    id,
    name,
    icon ?? null,
    position,
  ]);

  return id;
}

export async function renameWorkspace(id: string, name: string): Promise<void> {
  const db = await getDatabase();
  await db.execute("UPDATE workspaces SET name = $2 WHERE id = $1 AND deleted_at IS NULL", [
    id,
    name,
  ]);
}

export async function updateWorkspaceIcon(id: string, icon: string): Promise<void> {
  const db = await getDatabase();
  await db.execute("UPDATE workspaces SET icon = $2 WHERE id = $1 AND deleted_at IS NULL", [
    id,
    icon,
  ]);
}

export async function deleteWorkspace(id: string): Promise<boolean> {
  const db = await getDatabase();
  const countResult = await db.select<Array<{ count: number }>>(
    "SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL",
    [],
  );

  if ((countResult[0]?.count ?? 0) <= 1) {
    return false;
  }

  await db.execute(
    "UPDATE workspaces SET deleted_at = datetime('now','utc') WHERE id = $1 AND deleted_at IS NULL",
    [id],
  );
  return true;
}

export async function reorderWorkspaces(orderedIds: string[]): Promise<void> {
  const db = await getDatabase();

  for (let i = 0; i < orderedIds.length; i += 1) {
    await db.execute("UPDATE workspaces SET position = $1 WHERE id = $2 AND deleted_at IS NULL", [
      i,
      orderedIds[i],
    ]);
  }
}

export async function saveWorkspaceLayout(id: string, layoutConfig: object): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    "UPDATE workspaces SET layout_config = $2 WHERE id = $1 AND deleted_at IS NULL",
    [id, JSON.stringify(layoutConfig)],
  );
}

export async function getWorkspaceLayout(id: string): Promise<object | null> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ layout_config: string | null }>>(
    "SELECT layout_config FROM workspaces WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
    [id],
  );

  const layoutConfig = rows[0]?.layout_config;
  if (!layoutConfig) {
    return null;
  }

  try {
    return JSON.parse(layoutConfig) as object;
  } catch {
    return null;
  }
}
