import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getWorkspaceLayoutMock, saveWorkspaceLayoutMock } = vi.hoisted(() => ({
  getWorkspaceLayoutMock: vi.fn(),
  saveWorkspaceLayoutMock: vi.fn(),
}));

vi.mock("../lib/workspace-operations", () => ({
  getWorkspaceLayout: getWorkspaceLayoutMock,
  saveWorkspaceLayout: saveWorkspaceLayoutMock,
}));

import { useAppStore } from "../stores/app-store";
import { useWorkspaceLayout, DEFAULT_LAYOUT } from "./use-workspace-layout";

describe("useWorkspaceLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWorkspaceLayoutMock.mockReset();
    saveWorkspaceLayoutMock.mockReset();
    vi.useRealTimers();
    useAppStore.setState({
      activeWorkspaceId: "workspace-1",
      activeBoardId: null,
      activeBoardPerWorkspace: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("loads persisted layout and merges it onto the defaults", async () => {
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 40,
      activeBoardId: "board-9",
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.layout).toEqual({
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 40,
      activeBoardId: "board-9",
    });
    expect(useAppStore.getState().activeBoardPerWorkspace).toEqual({
      "workspace-1": "board-9",
    });
    expect(useAppStore.getState().activeBoardId).toBe("board-9");
    expect(getWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1");
  });

  it("restores a persisted null active board by clearing the workspace selection", async () => {
    useAppStore.setState({
      activeWorkspaceId: "workspace-1",
      activeBoardId: "board-stale",
      activeBoardPerWorkspace: {
        "workspace-1": "board-stale",
      },
    });
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 55,
      activeBoardId: null,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.layout).toEqual({
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 55,
      activeBoardId: null,
    });
    expect(useAppStore.getState().activeBoardPerWorkspace).toEqual({
      "workspace-1": null,
    });
    expect(useAppStore.getState().activeBoardId).toBeNull();
  });

  it("falls back to the default layout and logs load failures", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const loadError = new Error("load failed");
    getWorkspaceLayoutMock.mockRejectedValue(loadError);

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.layout).toEqual(DEFAULT_LAYOUT);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[WorkspaceLayout] Failed to load workspace layout",
      loadError,
    );
  });

  it("debounces layout persistence when the panel size changes", async () => {
    getWorkspaceLayoutMock.mockResolvedValue(null);

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    act(() => {
      result.current.updatePanelSize({ primary: 60, secondary: 40 });
    });

    expect(result.current.layout.primaryPanelSize).toBe(60);
    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      primaryPanelSize: 60,
      activeBoardId: null,
    });
  });

  it("persists the active board id using the latest layout state", async () => {
    getWorkspaceLayoutMock.mockResolvedValue({ primaryPanelSize: 66, activeBoardId: null });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    act(() => {
      result.current.updateActiveBoard("board-1");
    });

    expect(result.current.layout.activeBoardId).toBe("board-1");
    expect(useAppStore.getState().activeBoardPerWorkspace).toEqual({
      "workspace-1": "board-1",
    });
    expect(useAppStore.getState().activeBoardId).toBe("board-1");

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      primaryPanelSize: 66,
      activeBoardId: "board-1",
    });
  });
});
