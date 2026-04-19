import {
  workspaces,
  type WorkspaceRecord as DesktopWorkspaceRecord,
} from "../platform/desktop-api";

export interface WorkspaceRecord {
  id: string;
  name: string;
  icon: string | null;
  position: number;
  layout_config: DesktopWorkspaceRecord["layoutConfig"];
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
    icon: item.icon,
    position: item.position,
  };
}

export async function listWorkspaces(): Promise<WorkspaceListItem[]> {
  return workspaces.list();
}

export async function getWorkspace(id: string): Promise<WorkspaceRecord | null> {
  const workspace = (await workspaces.get(id)) as DesktopWorkspaceRecord | null;
  if (!workspace) {
    return null;
  }

  return {
    id: workspace.id,
    name: workspace.name,
    icon: workspace.icon,
    position: workspace.position,
    layout_config: workspace.layoutConfig,
    created_at: workspace.createdAt,
    updated_at: workspace.updatedAt,
    deleted_at: workspace.deletedAt,
  };
}

export async function createWorkspace(name: string, icon?: string): Promise<string> {
  return workspaces.createWorkspace(name, icon);
}

export async function renameWorkspace(id: string, name: string): Promise<void> {
  await workspaces.rename(id, name);
}

export async function deleteWorkspace(id: string): Promise<boolean> {
  return workspaces.delete(id);
}

export async function reorderWorkspaces(orderedIds: string[]): Promise<void> {
  await workspaces.reorderWorkspaces(orderedIds);
}

export async function saveWorkspaceLayout(id: string, layoutConfig: object): Promise<void> {
  await workspaces.saveLayout(id, layoutConfig);
}

export async function getWorkspaceLayout(id: string): Promise<object | null> {
  return await workspaces.getLayout(id);
}
