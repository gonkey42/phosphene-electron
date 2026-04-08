import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.fn();
const selectMock = vi.fn();
const loadMock = vi.fn();
const generateIdMock = vi.fn();

vi.mock("./database", () => ({
  getDb: loadMock,
}));

vi.mock("./uuid", () => ({
  generateId: generateIdMock,
}));

describe("workspace operations", () => {
  beforeEach(() => {
    vi.resetModules();
    executeMock.mockReset();
    selectMock.mockReset();
    loadMock.mockReset();
    generateIdMock.mockReset();
    loadMock.mockResolvedValue({ execute: executeMock, select: selectMock });
  });

  it("lists non-deleted workspaces ordered by position", async () => {
    selectMock.mockResolvedValue([
      {
        id: "workspace-1",
        name: "Home",
        icon: "🏠",
        position: 0,
      },
    ]);

    const { listWorkspaces } = await import("./workspace-operations");
    const workspaces = await listWorkspaces();

    expect(workspaces).toEqual([
      {
        id: "workspace-1",
        name: "Home",
        icon: "🏠",
        position: 0,
      },
    ]);
    expect(selectMock).toHaveBeenCalledWith(
      "SELECT id, name, icon, position FROM workspaces WHERE deleted_at IS NULL ORDER BY position",
      [],
    );
  });

  it("maps workspace rows with a default icon fallback", async () => {
    const { mapWorkspace } = await import("./workspace-operations");

    expect(
      mapWorkspace({
        id: "workspace-1",
        name: "Home",
        icon: null,
        position: 0,
      }),
    ).toEqual({
      id: "workspace-1",
      name: "Home",
      icon: "📋",
      position: 0,
    });
  });

  it("gets a workspace with full details and returns null for deleted workspaces", async () => {
    selectMock.mockResolvedValueOnce([
      {
        id: "workspace-1",
        name: "Home",
        icon: "🏠",
        position: 0,
        layout_config: '{"left":320}',
        created_at: "2026-03-29T09:00:00Z",
        updated_at: "2026-03-29T10:00:00Z",
        deleted_at: null,
      },
    ]);
    selectMock.mockResolvedValueOnce([]);

    const { getWorkspace } = await import("./workspace-operations");

    await expect(getWorkspace("workspace-1")).resolves.toEqual({
      id: "workspace-1",
      name: "Home",
      icon: "🏠",
      position: 0,
      layout_config: '{"left":320}',
      created_at: "2026-03-29T09:00:00Z",
      updated_at: "2026-03-29T10:00:00Z",
      deleted_at: null,
    });
    await expect(getWorkspace("missing-workspace")).resolves.toBeNull();
    expect(selectMock).toHaveBeenNthCalledWith(
      1,
      "SELECT id, name, icon, position, layout_config, created_at, updated_at, deleted_at FROM workspaces WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
      ["workspace-1"],
    );
  });

  it("creates a workspace at the next position", async () => {
    selectMock.mockResolvedValueOnce([{ position: 3 }]);
    generateIdMock.mockReturnValue("new-workspace-id");

    const { createWorkspace } = await import("./workspace-operations");
    await expect(createWorkspace("New workspace", "🪟")).resolves.toBe("new-workspace-id");

    expect(generateIdMock).toHaveBeenCalledTimes(1);
    expect(selectMock).toHaveBeenCalledWith(
      "SELECT COALESCE(MAX(position), -1) + 1 as position FROM workspaces WHERE deleted_at IS NULL",
      [],
    );
    expect(executeMock).toHaveBeenCalledWith(
      "INSERT INTO workspaces (id, name, icon, position) VALUES ($1, $2, $3, $4)",
      ["new-workspace-id", "New workspace", "🪟", 3],
    );
  });

  it("renames and updates workspace icon only for non-deleted rows", async () => {
    const { renameWorkspace, updateWorkspaceIcon } = await import("./workspace-operations");

    await renameWorkspace("workspace-1", "Updated name");
    await updateWorkspaceIcon("workspace-1", "✨");

    expect(executeMock).toHaveBeenNthCalledWith(
      1,
      "UPDATE workspaces SET name = $2 WHERE id = $1 AND deleted_at IS NULL",
      ["workspace-1", "Updated name"],
    );
    expect(executeMock).toHaveBeenNthCalledWith(
      2,
      "UPDATE workspaces SET icon = $2 WHERE id = $1 AND deleted_at IS NULL",
      ["workspace-1", "✨"],
    );
  });

  it("does not delete the last workspace", async () => {
    selectMock.mockResolvedValueOnce([{ count: 1 }]);

    const { deleteWorkspace } = await import("./workspace-operations");
    await expect(deleteWorkspace("workspace-1")).resolves.toBe(false);

    expect(selectMock).toHaveBeenCalledWith(
      "SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL",
      [],
    );
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("soft deletes a workspace when more than one workspace exists", async () => {
    selectMock.mockResolvedValueOnce([{ count: 2 }]);

    const { deleteWorkspace } = await import("./workspace-operations");
    await expect(deleteWorkspace("workspace-1")).resolves.toBe(true);

    expect(executeMock).toHaveBeenCalledWith(
      "UPDATE workspaces SET deleted_at = datetime('now','utc') WHERE id = $1 AND deleted_at IS NULL",
      ["workspace-1"],
    );
  });

  it("reorders workspaces by position", async () => {
    const { reorderWorkspaces } = await import("./workspace-operations");

    await reorderWorkspaces(["workspace-2", "workspace-1"]);

    expect(executeMock).toHaveBeenNthCalledWith(
      1,
      "UPDATE workspaces SET position = $1 WHERE id = $2 AND deleted_at IS NULL",
      [0, "workspace-2"],
    );
    expect(executeMock).toHaveBeenNthCalledWith(
      2,
      "UPDATE workspaces SET position = $1 WHERE id = $2 AND deleted_at IS NULL",
      [1, "workspace-1"],
    );
  });

  it("saves layout config and parses valid or invalid JSON", async () => {
    selectMock.mockResolvedValueOnce([{ layout_config: '{"left":320}' }]);
    selectMock.mockResolvedValueOnce([{ layout_config: "not-json" }]);
    selectMock.mockResolvedValueOnce([{ layout_config: null }]);

    const { saveWorkspaceLayout, getWorkspaceLayout } = await import("./workspace-operations");

    await saveWorkspaceLayout("workspace-1", { left: 320, right: 680 });

    await expect(getWorkspaceLayout("workspace-1")).resolves.toEqual({ left: 320 });
    await expect(getWorkspaceLayout("workspace-1")).resolves.toBeNull();
    await expect(getWorkspaceLayout("workspace-1")).resolves.toBeNull();

    expect(executeMock).toHaveBeenCalledWith(
      "UPDATE workspaces SET layout_config = $2 WHERE id = $1 AND deleted_at IS NULL",
      ["workspace-1", '{"left":320,"right":680}'],
    );
    expect(selectMock).toHaveBeenNthCalledWith(
      1,
      "SELECT layout_config FROM workspaces WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
      ["workspace-1"],
    );
  });
});
