import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.fn();
const selectMock = vi.fn();
const loadMock = vi.fn();
const createWorkspaceMock = vi.fn();
const reorderWorkspacesMock = vi.fn();
const mainDbPragmaMock = vi.fn();
const mainDbExecMock = vi.fn();
const mainDbPrepareMock = vi.fn();
const mainDbTransactionMock = vi.fn();

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("better-sqlite3", () => {
  const DatabaseMock = function () {
    return {
      pragma: mainDbPragmaMock,
      exec: mainDbExecMock,
      prepare: mainDbPrepareMock,
      transaction: mainDbTransactionMock,
      backup: vi.fn(),
      close: vi.fn(),
    };
  };

  return { default: DatabaseMock };
});

vi.mock("./database", () => ({
  getDb: loadMock,
}));

vi.mock("../platform/desktop-api", () => ({
  workspaces: {
    createWorkspace: createWorkspaceMock,
    reorderWorkspaces: reorderWorkspacesMock,
  },
}));

describe("workspace operations", () => {
  beforeEach(() => {
    vi.resetModules();
    executeMock.mockReset();
    selectMock.mockReset();
    loadMock.mockReset();
    createWorkspaceMock.mockReset();
    reorderWorkspacesMock.mockReset();
    mainDbPragmaMock.mockReset();
    mainDbExecMock.mockReset();
    mainDbPrepareMock.mockReset();
    mainDbTransactionMock.mockReset();
    loadMock.mockResolvedValue({ execute: executeMock, select: selectMock });
    executeMock.mockResolvedValue({ rowsAffected: 1 });
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

  it("creates a workspace through the desktop bridge", async () => {
    createWorkspaceMock.mockResolvedValueOnce("new-workspace-id");

    const { createWorkspace } = await import("./workspace-operations");
    await expect(createWorkspace("New workspace", "🪟")).resolves.toBe("new-workspace-id");

    expect(createWorkspaceMock).toHaveBeenCalledWith("New workspace", "🪟");
    expect(selectMock).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();
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

  it("throws when deleting a workspace affects zero rows", async () => {
    selectMock.mockResolvedValueOnce([{ count: 2 }]);
    executeMock.mockResolvedValueOnce({ rowsAffected: 0 });

    const { deleteWorkspace } = await import("./workspace-operations");

    await expect(deleteWorkspace("missing-workspace")).rejects.toThrow(
      "Workspace delete affected 0 rows",
    );
  });

  it("reorders workspaces by position", async () => {
    reorderWorkspacesMock.mockResolvedValueOnce(undefined);

    const { reorderWorkspaces } = await import("./workspace-operations");

    await reorderWorkspaces(["workspace-2", "workspace-1"]);

    expect(reorderWorkspacesMock).toHaveBeenCalledWith(["workspace-2", "workspace-1"]);
    expect(selectMock).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();
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

  it("throws when renaming a workspace affects zero rows", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 0 });

    const { renameWorkspace } = await import("./workspace-operations");

    await expect(renameWorkspace("missing-workspace", "Renamed")).rejects.toThrow(
      "Workspace rename affected 0 rows",
    );
  });

  it("throws when updating a workspace icon affects zero rows", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 0 });

    const { updateWorkspaceIcon } = await import("./workspace-operations");

    await expect(updateWorkspaceIcon("missing-workspace", "✨")).rejects.toThrow(
      "Workspace icon update affected 0 rows",
    );
  });

  it("throws when saving workspace layout affects zero rows", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 0 });

    const { saveWorkspaceLayout } = await import("./workspace-operations");

    await expect(saveWorkspaceLayout("missing-workspace", { left: 320 })).rejects.toThrow(
      "Workspace layout save affected 0 rows",
    );
  });

  it("creates a workspace atomically through the main-process helper", async () => {
    const state = {
      workspaces: [
        { id: "workspace-1", position: 0 },
        { id: "workspace-2", position: 1 },
      ] as Array<{ id: string; position: number }>,
    };
    let inTransaction = false;
    let insertedWorkspaceId: string | null = null;

    mainDbTransactionMock.mockImplementation((callback: (...args: any[]) => unknown) => {
      return (...args: any[]) => {
        inTransaction = true;
        try {
          return callback(...args);
        } finally {
          inTransaction = false;
        }
      };
    });
    mainDbPrepareMock.mockImplementation((sql: string) => {
      if (sql === "SELECT COALESCE(MAX(position), -1) + 1 as position FROM workspaces WHERE deleted_at IS NULL") {
        return {
          get() {
            expect(inTransaction).toBe(true);
            return { position: Math.max(...state.workspaces.map((workspace) => workspace.position)) + 1 };
          },
        };
      }

      if (sql === "INSERT INTO workspaces (id, name, icon, position) VALUES (?, ?, ?, ?)") {
        return {
          run(id: string, name: string, icon: string | null, position: number) {
            expect(inTransaction).toBe(true);
            expect(name).toBe("New workspace");
            expect(icon).toBe("🪟");
            insertedWorkspaceId = id;
            state.workspaces.push({ id, position });
            return { changes: 1 };
          },
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const { createWorkspace } = await import("../../electron/ipc/database");
    const workspaceId = createWorkspace(
      {
        prepare: mainDbPrepareMock,
        transaction: mainDbTransactionMock,
      } as never,
      "New workspace",
      "🪟",
    );

    expect(workspaceId).toBe(insertedWorkspaceId);
    expect(state.workspaces).toEqual([
      { id: "workspace-1", position: 0 },
      { id: "workspace-2", position: 1 },
      { id: workspaceId, position: 2 },
    ]);
  });

  it("rolls back a workspace reorder when an update affects zero rows", async () => {
    const state = {
      workspaces: [
        { id: "workspace-1", position: 0 },
        { id: "workspace-2", position: 1 },
      ] as Array<{ id: string; position: number }>,
    };
    let inTransaction = false;

    mainDbTransactionMock.mockImplementation((callback: (...args: any[]) => unknown) => {
      return (...args: any[]) => {
        inTransaction = true;
        const snapshot = structuredClone(state);
        try {
          return callback(...args);
        } catch (error) {
          state.workspaces = snapshot.workspaces;
          throw error;
        } finally {
          inTransaction = false;
        }
      };
    });
    mainDbPrepareMock.mockImplementation((sql: string) => {
      if (sql === "UPDATE workspaces SET position = ? WHERE id = ? AND deleted_at IS NULL") {
        return {
          run(position: number, id: string) {
            expect(inTransaction).toBe(true);
            const workspace = state.workspaces.find((entry) => entry.id === id);
            if (!workspace) {
              return { changes: 0 };
            }

            workspace.position = position;
            return id === "workspace-2" ? { changes: 0 } : { changes: 1 };
          },
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const { reorderWorkspaces } = await import("../../electron/ipc/database");

    expect(() =>
      reorderWorkspaces(
        {
          prepare: mainDbPrepareMock,
          transaction: mainDbTransactionMock,
        } as never,
        ["workspace-1", "workspace-2"],
      ),
    ).toThrow("Workspace reorder affected 0 rows");
    expect(state.workspaces).toEqual([
      { id: "workspace-1", position: 0 },
      { id: "workspace-2", position: 1 },
    ]);
  });
});
