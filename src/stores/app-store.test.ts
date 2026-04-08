import { beforeEach, describe, expect, it, vi } from "vitest";

describe("useAppStore", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("starts with empty workspace and board state", async () => {
    const { useAppStore } = await import("./app-store");
    const state = useAppStore.getState();

    expect(state.workspaces).toEqual([]);
    expect(state.activeWorkspaceId).toBeNull();
    expect(state.boards).toEqual([]);
    expect(state.activeBoardId).toBeNull();
    expect(state.activeBoardPerWorkspace).toEqual({});
    expect(state.getActiveBoardForWorkspace("workspace-1")).toBeNull();
    expect(state.boardListRefresh).toEqual({ workspaceId: null, nonce: 0 });
    expect(state.focus).toBe("global");
    expect(state.initialized).toBe(false);
  });

  it("updates workspaces, boards, focus, refresh requests, and initialized state", async () => {
    const { useAppStore } = await import("./app-store");
    const workspace = { id: "workspace-1", name: "Home", icon: "🏠", position: 0 };
    const secondWorkspace = {
      id: "workspace-2",
      name: "Research",
      icon: "🔎",
      position: 1,
    };
    const board = {
      id: "board-1",
      workspaceId: "workspace-1",
      name: "Inbox",
      description: null,
      position: 0,
      updatedAt: "2026-03-29T00:00:00Z",
    };

    useAppStore.getState().setWorkspaces([workspace, secondWorkspace]);
    useAppStore.getState().setActiveWorkspace("workspace-1");
    useAppStore.getState().setBoards([board]);
    useAppStore.getState().setActiveBoardForWorkspace("workspace-1", "board-1");
    useAppStore.getState().setActiveBoardForWorkspace("workspace-2", "board-2");
    useAppStore.getState().requestBoardListRefresh("workspace-1");
    useAppStore.getState().setFocus("canvas");
    useAppStore.getState().setInitialized(true);

    useAppStore.getState().setActiveWorkspace("workspace-2");

    const state = useAppStore.getState();
    expect(state.workspaces).toEqual([workspace, secondWorkspace]);
    expect(state.activeWorkspaceId).toBe("workspace-2");
    expect(state.boards).toEqual([board]);
    expect(state.activeBoardId).toBe("board-2");
    expect(state.activeBoardPerWorkspace).toEqual({
      "workspace-1": "board-1",
      "workspace-2": "board-2",
    });
    expect(state.getActiveBoardForWorkspace("workspace-1")).toBe("board-1");
    expect(state.getActiveBoardForWorkspace("workspace-3")).toBeNull();
    expect(state.boardListRefresh).toEqual({ workspaceId: "workspace-1", nonce: 1 });
    expect(state.focus).toBe("global");
    expect(state.initialized).toBe(true);
  });
});
