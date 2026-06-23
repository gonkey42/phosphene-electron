import type Database from "better-sqlite3";

export type BoardPackWorkspaceTarget =
  | { type: "new" }
  | { type: "id"; id: string }
  | { type: "name"; name: string }
  | { type: "active" };

type WorkspaceIdRow = {
  id: string;
};

const GET_WORKSPACE_BY_ID_SQL =
  "SELECT id FROM workspaces WHERE id = ? AND deleted_at IS NULL LIMIT 1";
const LIST_WORKSPACES_BY_NAME_SQL =
  "SELECT id FROM workspaces WHERE name = ? AND deleted_at IS NULL ORDER BY position";
const GET_ACTIVE_WORKSPACE_ID_SQL = "SELECT value FROM settings WHERE key = ? LIMIT 1";

function normalizeTargetValue(value: string, label: string): string {
  const normalized = value.trim();

  if (normalized === "") {
    throw new Error(`Target workspace ${label} must be a non-empty string`);
  }

  return normalized;
}

function getWorkspaceById(database: Database.Database, workspaceId: string): string | null {
  const row = database.prepare(GET_WORKSPACE_BY_ID_SQL).get(workspaceId) as
    | WorkspaceIdRow
    | undefined;

  return row?.id ?? null;
}

function resolveWorkspaceById(database: Database.Database, workspaceId: string): string {
  const normalizedWorkspaceId = normalizeTargetValue(workspaceId, "id");
  const resolvedWorkspaceId = getWorkspaceById(database, normalizedWorkspaceId);

  if (!resolvedWorkspaceId) {
    throw new Error(
      `Target workspace ${normalizedWorkspaceId} does not exist or has been deleted`,
    );
  }

  return resolvedWorkspaceId;
}

function resolveWorkspaceByName(database: Database.Database, workspaceName: string): string {
  const normalizedWorkspaceName = normalizeTargetValue(workspaceName, "name");
  const rows = database.prepare(LIST_WORKSPACES_BY_NAME_SQL).all(normalizedWorkspaceName) as
    | WorkspaceIdRow[]
    | [];

  if (rows.length === 0) {
    throw new Error(`Target workspace name "${normalizedWorkspaceName}" does not exist`);
  }

  if (rows.length > 1) {
    throw new Error(
      `Target workspace name "${normalizedWorkspaceName}" is ambiguous; use --target-workspace-id`,
    );
  }

  return rows[0].id;
}

function resolveActiveWorkspace(database: Database.Database): string {
  const row = database.prepare(GET_ACTIVE_WORKSPACE_ID_SQL).get("active_workspace_id") as
    | { value?: string }
    | undefined;
  const activeWorkspaceId = row?.value;

  if (!activeWorkspaceId) {
    throw new Error("No active workspace is saved");
  }

  return resolveWorkspaceById(database, activeWorkspaceId);
}

export function resolveBoardPackWorkspaceTarget(
  database: Database.Database,
  targetWorkspace: BoardPackWorkspaceTarget = { type: "new" },
): string | null {
  switch (targetWorkspace.type) {
    case "new":
      return null;
    case "id":
      return resolveWorkspaceById(database, targetWorkspace.id);
    case "name":
      return resolveWorkspaceByName(database, targetWorkspace.name);
    case "active":
      return resolveActiveWorkspace(database);
  }
}
