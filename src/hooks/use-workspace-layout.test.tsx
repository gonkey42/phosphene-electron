import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { suppressExpectedConsoleError } from "../test/expected-console-error";

const { getWorkspaceLayoutMock, saveWorkspaceLayoutMock } = vi.hoisted(() => ({
  getWorkspaceLayoutMock: vi.fn(),
  saveWorkspaceLayoutMock: vi.fn(),
}));

const { lifecycleHandlers } = vi.hoisted(() => ({
  lifecycleHandlers: new Set<() => Promise<void> | void>(),
}));

vi.mock("../lib/workspace-operations", () => ({
  getWorkspaceLayout: getWorkspaceLayoutMock,
  saveWorkspaceLayout: saveWorkspaceLayoutMock,
}));

vi.mock("../platform/desktop-api", () => ({
  lifecycle: {
    registerPendingWork(handler: () => Promise<void> | void) {
      lifecycleHandlers.add(handler);
      return () => {
        lifecycleHandlers.delete(handler);
      };
    },
    flushPendingWork: vi.fn(),
  },
}));

import { useAppStore } from "../stores/app-store";
import { useWorkspaceLayout, DEFAULT_LAYOUT } from "./use-workspace-layout";

describe("useWorkspaceLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWorkspaceLayoutMock.mockReset();
    saveWorkspaceLayoutMock.mockReset();
    vi.useRealTimers();
    lifecycleHandlers.clear();
    useAppStore.setState({
      activeWorkspaceId: "workspace-1",
      activeBoardId: null,
      activeBoardPerWorkspace: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    lifecycleHandlers.clear();
  });

  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });

    return { promise, resolve, reject };
  };

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
    const consoleErrorSpy = suppressExpectedConsoleError();
    const loadError = new Error("load failed");
    getWorkspaceLayoutMock.mockRejectedValue(loadError);

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.layout).toEqual(DEFAULT_LAYOUT);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[WorkspaceLayout] Failed to load workspace layout",
      expect.objectContaining({
        error: loadError,
      }),
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

  it("flushes a pending layout save before switching workspaces", async () => {
    getWorkspaceLayoutMock.mockResolvedValue(null);

    const { result, rerender } = renderHook(
      ({ workspaceId }) => useWorkspaceLayout(workspaceId),
      {
        initialProps: { workspaceId: "workspace-1" },
      },
    );

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    act(() => {
      result.current.updatePanelSize({ primary: 58, secondary: 42 });
    });

    rerender({ workspaceId: "workspace-2" });

    await act(async () => {
      await Promise.resolve();
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      primaryPanelSize: 58,
      activeBoardId: null,
    });
  });

  it("flushes a pending layout save when the hook unmounts", async () => {
    getWorkspaceLayoutMock.mockResolvedValue(null);

    const { result, unmount } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    act(() => {
      result.current.updateActiveBoard("board-before-unmount");
    });

    await act(async () => {
      unmount();
      await Promise.resolve();
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      primaryPanelSize: DEFAULT_LAYOUT.primaryPanelSize,
      activeBoardId: "board-before-unmount",
    });
  });

  it("keeps the lifecycle flush pending until an in-flight layout save resolves", async () => {
    getWorkspaceLayoutMock.mockResolvedValue(null);
    const save = deferred<void>();
    saveWorkspaceLayoutMock.mockImplementationOnce(() => save.promise);

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    act(() => {
      result.current.updatePanelSize({ primary: 61, secondary: 39 });
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledTimes(1);

    let resolved = false;
    const [flushHandler] = Array.from(lifecycleHandlers);
    const flushPromise = Promise.resolve(flushHandler?.()).then(() => {
      resolved = true;
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(resolved).toBe(false);

    await act(async () => {
      save.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await flushPromise;
    });

    expect(resolved).toBe(true);
  });

  it("waits for an older in-flight layout save before completing a forced newer flush", async () => {
    getWorkspaceLayoutMock.mockResolvedValue(null);
    const firstSave = deferred<void>();
    const secondSave = deferred<void>();
    saveWorkspaceLayoutMock
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce(() => secondSave.promise);

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    act(() => {
      result.current.updatePanelSize({ primary: 52, secondary: 48 });
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.updatePanelSize({ primary: 68, secondary: 32 });
    });

    let resolved = false;
    const [flushHandler] = Array.from(lifecycleHandlers);
    const flushPromise = Promise.resolve(flushHandler?.()).then(() => {
      resolved = true;
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(false);

    await act(async () => {
      firstSave.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledTimes(2);
    expect(resolved).toBe(false);

    await act(async () => {
      secondSave.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await flushPromise;
    });

    expect(resolved).toBe(true);
    expect(saveWorkspaceLayoutMock).toHaveBeenNthCalledWith(2, "workspace-1", {
      primaryPanelSize: 68,
      activeBoardId: null,
    });
  });
});
