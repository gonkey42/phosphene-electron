import { beforeEach, describe, expect, it, vi } from "vitest";

describe("useAppStore", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("starts with empty workspace and board state", async () => {
    const { useAppStore } = await import("./app-store");
    const state = useAppStore.getState();

    expect(state.themePreference).toBe("system");
    expect(state.resolvedTheme).toBe("light");
    expect(state.workspaces).toEqual([]);
    expect(state.activeWorkspaceId).toBeNull();
    expect(state.boards).toEqual([]);
    expect(state.activeBoardId).toBeNull();
    expect(state.activeBoardPerWorkspace).toEqual({});
    expect(state.getActiveBoardForWorkspace("workspace-1")).toBeNull();
    expect(state.boardListRefresh).toEqual({ workspaceId: null, nonce: 0 });
    expect(state.focus).toBe("global");
    expect(state.initialized).toBe(false);
    expect(state.status).toBe("idle");
    expect(state.initializationError).toBeNull();
    expect(state.armedDeleteTarget).toBeNull();
    expect(state.armedDeleteToken).toBeNull();
    expect(state.deletePendingToken).toBeNull();
    expect(state.deleteAnnouncement).toBeNull();
    expect(state.deleteEligibility).toEqual({ state: "allowed" });
  });

  it("updates workspaces, boards, focus, refresh requests, and initialization state", async () => {
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
    useAppStore.getState().setInitializationState({ status: "loading" });
    useAppStore.getState().setInitializationState({
      status: "error",
      error: {
        title: "Unable to start Phosphene",
        detail: "Desktop API not available",
      },
    });
    useAppStore.getState().setInitializationState({ status: "ready" });

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
    expect(state.status).toBe("ready");
    expect(state.initializationError).toBeNull();
  });

  it("keeps initialization fields in sync across transitions", async () => {
    const { useAppStore } = await import("./app-store");

    useAppStore.getState().setInitializationState({ status: "loading" });
    expect(useAppStore.getState()).toMatchObject({
      status: "loading",
      initialized: false,
      initializationError: null,
    });

    useAppStore.getState().setInitializationState({
      status: "error",
      error: {
        title: "Unable to start Phosphene",
        detail: "Desktop API not available",
      },
    });
    expect(useAppStore.getState()).toMatchObject({
      status: "error",
      initialized: false,
      initializationError: {
        title: "Unable to start Phosphene",
        detail: "Desktop API not available",
      },
    });

    useAppStore.getState().setInitializationState({ status: "ready" });
    expect(useAppStore.getState()).toMatchObject({
      status: "ready",
      initialized: true,
      initializationError: null,
    });

    useAppStore.getState().setInitializationState({ status: "idle" });
    expect(useAppStore.getState()).toMatchObject({
      status: "idle",
      initialized: false,
      initializationError: null,
    });
  });

  it("updates theme preference and resolved theme independently", async () => {
    const { useAppStore } = await import("./app-store");

    useAppStore.getState().setThemePreference("dark");
    useAppStore.getState().setResolvedTheme("dark");
    useAppStore.getState().setThemePreference("light");

    expect(useAppStore.getState()).toMatchObject({
      themePreference: "light",
      resolvedTheme: "dark",
    });
  });

  it("arms a tokenized delete target and cancels it", async () => {
    const { useAppStore } = await import("./app-store");
    const target = { kind: "workspace" as const, id: "workspace-1", label: "Home" };

    const token = useAppStore.getState().armDeleteTarget(target);

    expect(token).toEqual(expect.any(String));
    expect(token.length).toBeGreaterThan(0);
    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: target,
      armedDeleteToken: token,
      deletePendingToken: null,
    });
    expect(useAppStore.getState().deleteAnnouncement).toContain("Home");
    expect(useAppStore.getState().isDeleteArmed(target)).toBe(true);
    expect(
      useAppStore.getState().isDeleteArmed({
        kind: "workspace",
        id: "workspace-1",
        label: "Renamed Home",
      }),
    ).toBe(true);

    useAppStore.getState().cancelArmedDelete();

    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: null,
      armedDeleteToken: null,
      deletePendingToken: null,
      deleteAnnouncement: null,
    });
    expect(useAppStore.getState().isDeleteArmed(target)).toBe(false);
  });

  it("keeps only one delete target armed globally", async () => {
    const { useAppStore } = await import("./app-store");
    const workspaceTarget = { kind: "workspace" as const, id: "workspace-1", label: "Home" };
    const boardTarget = {
      kind: "board" as const,
      id: "board-1",
      workspaceId: "workspace-1",
      label: "Sketches",
    };

    const firstToken = useAppStore.getState().armDeleteTarget(workspaceTarget);
    const secondToken = useAppStore.getState().armDeleteTarget(boardTarget);

    expect(secondToken).not.toBe(firstToken);
    expect(useAppStore.getState().isDeleteArmed(workspaceTarget)).toBe(false);
    expect(useAppStore.getState().isDeleteArmed(boardTarget)).toBe(true);
    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: boardTarget,
      armedDeleteToken: secondToken,
      deletePendingToken: null,
    });
  });

  it("stores delete eligibility and cancels an armed target when eligibility is not allowed", async () => {
    const { useAppStore } = await import("./app-store");

    const token = useAppStore
      .getState()
      .armDeleteTarget({ kind: "workspace", id: "workspace-1", label: "Home" });

    useAppStore.getState().setDeleteEligibility({
      state: "blocked",
      reason: "Cannot delete the last workspace",
    });

    expect(useAppStore.getState()).toMatchObject({
      deleteEligibility: {
        state: "blocked",
        reason: "Cannot delete the last workspace",
      },
      armedDeleteTarget: null,
      armedDeleteToken: null,
      deletePendingToken: null,
    });
    expect(useAppStore.getState().deleteAnnouncement).toContain("Cannot delete the last workspace");

    useAppStore.getState().setDeleteEligibility({
      state: "unknown",
      reason: "Workspace delete status is loading",
    });

    expect(useAppStore.getState().deleteEligibility).toEqual({
      state: "unknown",
      reason: "Workspace delete status is loading",
    });
    expect(useAppStore.getState().armedDeleteToken).not.toBe(token);
  });

  it("marks pending deletes and clears only the matching token on settlement", async () => {
    const { useAppStore } = await import("./app-store");
    const target = {
      kind: "board" as const,
      id: "board-1",
      workspaceId: "workspace-1",
      label: "Sketches",
    };

    const token = useAppStore.getState().armDeleteTarget(target);

    expect(useAppStore.getState().markDeletePending("stale-token")).toBe(false);
    expect(useAppStore.getState().markDeletePending(token)).toBe(true);
    expect(useAppStore.getState().markDeletePending(token)).toBe(false);
    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: target,
      armedDeleteToken: token,
      deletePendingToken: token,
      deleteAnnouncement: null,
    });

    useAppStore.getState().clearDeletePending("stale-token");

    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: target,
      armedDeleteToken: token,
      deletePendingToken: token,
    });

    useAppStore.getState().clearDeletePending(token);

    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: null,
      armedDeleteToken: null,
      deletePendingToken: null,
      deleteAnnouncement: null,
    });
  });

  it("does not cancel or selection-clear a matching pending delete", async () => {
    const { useAppStore } = await import("./app-store");
    const target = {
      kind: "board" as const,
      id: "board-1",
      workspaceId: "workspace-1",
      label: "Sketches",
    };

    useAppStore.setState({
      activeWorkspaceId: "workspace-1",
      activeBoardId: "board-1",
      activeBoardPerWorkspace: {
        "workspace-1": "board-1",
        "workspace-2": "board-2",
      },
    });

    const token = useAppStore.getState().armDeleteTarget(target);
    expect(useAppStore.getState().markDeletePending(token)).toBe(true);

    useAppStore.getState().cancelArmedDelete();
    useAppStore.getState().setActiveWorkspace("workspace-2");
    useAppStore.getState().setActiveBoardForWorkspace("workspace-2", "board-2");
    useAppStore.getState().setActiveBoard("board-3");

    expect(useAppStore.getState()).toMatchObject({
      activeWorkspaceId: "workspace-2",
      activeBoardId: "board-3",
      armedDeleteTarget: target,
      armedDeleteToken: token,
      deletePendingToken: token,
    });

    useAppStore.getState().clearDeletePending(token);

    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: null,
      armedDeleteToken: null,
      deletePendingToken: null,
    });
  });

  it("does not let stale pending settlement clear a newer armed target", async () => {
    const { useAppStore } = await import("./app-store");
    const oldTarget = {
      kind: "board" as const,
      id: "board-1",
      workspaceId: "workspace-1",
      label: "Sketches",
    };
    const newTarget = {
      kind: "workspace" as const,
      id: "workspace-2",
      label: "Research",
    };

    const oldToken = useAppStore.getState().armDeleteTarget(oldTarget);
    expect(useAppStore.getState().markDeletePending(oldToken)).toBe(true);

    const newToken = useAppStore.getState().armDeleteTarget(newTarget);
    useAppStore.getState().clearDeletePending(oldToken);

    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: newTarget,
      armedDeleteToken: newToken,
      deletePendingToken: null,
    });
    expect(useAppStore.getState().isDeleteArmed(newTarget)).toBe(true);
  });
});
