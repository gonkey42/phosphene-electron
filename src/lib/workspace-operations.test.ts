import { beforeEach, describe, expect, it, vi } from "vitest";

const listWorkspacesMock = vi.fn();
const getWorkspaceMock = vi.fn();
const createWorkspaceMock = vi.fn();
const renameWorkspaceMock = vi.fn();
const deleteWorkspaceMock = vi.fn();
const reorderWorkspacesMock = vi.fn();
const getLayoutMock = vi.fn();
const saveLayoutMock = vi.fn();

vi.mock("../platform/desktop-api", () => ({
  workspaces: {
    list: listWorkspacesMock,
    get: getWorkspaceMock,
    createWorkspace: createWorkspaceMock,
    rename: renameWorkspaceMock,
    delete: deleteWorkspaceMock,
    reorderWorkspaces: reorderWorkspacesMock,
    getLayout: getLayoutMock,
    saveLayout: saveLayoutMock,
  },
}));

describe("workspace operations", () => {
  beforeEach(() => {
    vi.resetModules();
    listWorkspacesMock.mockReset();
    getWorkspaceMock.mockReset();
    createWorkspaceMock.mockReset();
    renameWorkspaceMock.mockReset();
    deleteWorkspaceMock.mockReset();
    reorderWorkspacesMock.mockReset();
    getLayoutMock.mockReset();
    saveLayoutMock.mockReset();
  });

  it("lists non-deleted workspaces ordered by position", async () => {
    listWorkspacesMock.mockResolvedValue([
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
    expect(listWorkspacesMock).toHaveBeenCalledTimes(1);
  });

  it("maps workspace rows without seeding a default icon", async () => {
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
      icon: null,
      position: 0,
    });
  });

  it("gets a workspace with full details and returns null for deleted workspaces", async () => {
    getWorkspaceMock.mockResolvedValueOnce({
      id: "workspace-1",
      name: "Home",
      icon: "🏠",
      position: 0,
      layoutConfig: { left: 320 },
      createdAt: "2026-03-29T09:00:00Z",
      updatedAt: "2026-03-29T10:00:00Z",
      deletedAt: null,
    });
    getWorkspaceMock.mockResolvedValueOnce(null);

    const { getWorkspace } = await import("./workspace-operations");

    await expect(getWorkspace("workspace-1")).resolves.toEqual({
      id: "workspace-1",
      name: "Home",
      icon: "🏠",
      position: 0,
      layout_config: { left: 320 },
      created_at: "2026-03-29T09:00:00Z",
      updated_at: "2026-03-29T10:00:00Z",
      deleted_at: null,
    });
    await expect(getWorkspace("missing-workspace")).resolves.toBeNull();
    expect(getWorkspaceMock).toHaveBeenCalledWith("workspace-1");
  });

  it("creates a workspace through the desktop bridge", async () => {
    createWorkspaceMock.mockResolvedValueOnce("new-workspace-id");

    const { createWorkspace } = await import("./workspace-operations");
    await expect(createWorkspace("New workspace", "🪟")).resolves.toBe("new-workspace-id");

    expect(createWorkspaceMock).toHaveBeenCalledWith("New workspace", "🪟");
  });

  it("renames and deletes workspaces through the desktop bridge", async () => {
    deleteWorkspaceMock.mockResolvedValueOnce(true);

    const { renameWorkspace, deleteWorkspace } = await import("./workspace-operations");

    await renameWorkspace("workspace-1", "Updated name");
    await expect(deleteWorkspace("workspace-1")).resolves.toBe(true);

    expect(renameWorkspaceMock).toHaveBeenCalledWith("workspace-1", "Updated name");
    expect(deleteWorkspaceMock).toHaveBeenCalledWith("workspace-1");
  });

  it("reorders workspaces by position", async () => {
    reorderWorkspacesMock.mockResolvedValueOnce(undefined);

    const { reorderWorkspaces } = await import("./workspace-operations");

    await reorderWorkspaces(["workspace-2", "workspace-1"]);

    expect(reorderWorkspacesMock).toHaveBeenCalledWith(["workspace-2", "workspace-1"]);
  });

  it("saves and loads workspace layout through the desktop bridge", async () => {
    getLayoutMock.mockResolvedValueOnce({ left: 320 });
    getLayoutMock.mockResolvedValueOnce(null);

    const { saveWorkspaceLayout, getWorkspaceLayout } = await import("./workspace-operations");

    await saveWorkspaceLayout("workspace-1", { left: 320, right: 680 });

    await expect(getWorkspaceLayout("workspace-1")).resolves.toEqual({ left: 320 });
    await expect(getWorkspaceLayout("workspace-1")).resolves.toBeNull();

    expect(saveLayoutMock).toHaveBeenCalledWith("workspace-1", { left: 320, right: 680 });
    expect(getLayoutMock).toHaveBeenNthCalledWith(1, "workspace-1");
  });
});
