import { settings } from "../platform/desktop-api";

export async function loadActiveWorkspaceId(): Promise<string | null> {
  return await settings.getActiveWorkspaceId();
}

export async function saveActiveWorkspaceId(workspaceId: string): Promise<void> {
  await settings.setActiveWorkspaceId(workspaceId);
}
