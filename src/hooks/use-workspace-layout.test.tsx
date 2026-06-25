import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { suppressExpectedConsoleError } from "../test/expected-console-error";

const { getWorkspaceLayoutMock, saveWorkspaceLayoutMock } = vi.hoisted(() => ({
  getWorkspaceLayoutMock: vi.fn(),
  saveWorkspaceLayoutMock: vi.fn(),
}));

const { lifecycleHandlers, browserHideMock } = vi.hoisted(() => ({
  lifecycleHandlers: new Set<() => Promise<void> | void>(),
  browserHideMock: vi.fn(),
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
  browser: {
    hide: browserHideMock,
  },
}));

import { useAppStore } from "../stores/app-store";
import { useWorkspaceLayout, DEFAULT_LAYOUT } from "./use-workspace-layout";

describe("useWorkspaceLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWorkspaceLayoutMock.mockReset();
    saveWorkspaceLayoutMock.mockReset();
    browserHideMock.mockReset();
    browserHideMock.mockResolvedValue(undefined);
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

  it("starts from the expanded default layout fields", async () => {
    getWorkspaceLayoutMock.mockResolvedValue(null);

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.layout).toEqual({
      primaryPanelSize: 75,
      lastVisiblePrimaryPanelSize: 75,
      boardsVisible: true,
      browserVisible: true,
      activeBoardId: null,
    });
  });

  it("normalizes malformed persisted layout values field-by-field", async () => {
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 140,
      boardsVisible: "yes",
      browserVisible: true,
      activeBoardId: "",
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.layout).toEqual({
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 85,
      lastVisiblePrimaryPanelSize: 85,
      activeBoardId: null,
    });
  });

  it("preserves intentional hidden browser layouts with a collapsed primary split", async () => {
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 48,
      boardsVisible: false,
      browserVisible: false,
      activeBoardId: "board-1",
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.layout).toEqual({
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 48,
      boardsVisible: false,
      browserVisible: false,
      activeBoardId: "board-1",
    });
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
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 60,
      lastVisiblePrimaryPanelSize: 60,
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
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 66,
      activeBoardId: "board-1",
    });
  });

  it("hides and restores the browser without losing the last useful split", async () => {
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 58,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: true,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    await act(async () => {
      await result.current.setBrowserVisible(false);
    });

    expect(browserHideMock).toHaveBeenCalledTimes(1);
    expect(result.current.layout).toEqual({
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: false,
    });

    await act(async () => {
      await result.current.setBrowserVisible(true);
    });

    expect(result.current.layout).toEqual({
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 58,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: true,
    });
  });

  it("persists hidden browser layout only after the rendered split collapses", async () => {
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 58,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: true,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    await act(async () => {
      await result.current.setBrowserVisible(false);
    });

    expect(result.current.layout.browserVisible).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalled();

    act(() => {
      result.current.confirmBrowserLayoutApplied();
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: false,
    });
  });

  it("masks browser fields during pending hide when board selection changes", async () => {
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 58,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: true,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    await act(async () => {
      await result.current.setBrowserVisible(false);
    });

    act(() => {
      result.current.updateActiveBoard("board-pending-hide");
    });

    await act(async () => {
      await result.current.flushPendingLayoutSave();
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 58,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: true,
      activeBoardId: "board-pending-hide",
    });
    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ browserVisible: false }),
    );
  });

  it("masks browser fields during pending hide when board sidebar visibility changes", async () => {
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 58,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: true,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    await act(async () => {
      await result.current.setBrowserVisible(false);
    });

    act(() => {
      result.current.setBoardsVisible(false);
    });

    await act(async () => {
      await result.current.flushPendingLayoutSave();
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 58,
      lastVisiblePrimaryPanelSize: 58,
      boardsVisible: false,
      browserVisible: true,
    });
    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ browserVisible: false }),
    );
  });

  it("waits for native reattach before persisting visible rollback after rendered collapse fails", async () => {
    const consoleErrorSpy = suppressExpectedConsoleError();
    const applyError = new Error("rendered collapse failed");
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 58,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: true,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    await act(async () => {
      await result.current.setBrowserVisible(false);
    });

    act(() => {
      result.current.handleBrowserLayoutApplyFailure(applyError);
    });

    expect(result.current.layout).toEqual({
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 58,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: true,
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[WorkspaceLayout] Failed to apply browser panel layout",
      expect.objectContaining({ error: applyError }),
    );

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalled();

    act(() => {
      result.current.confirmBrowserLayoutApplied();
      result.current.confirmBrowserRestored();
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 58,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: true,
    });
    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ browserVisible: false }),
    );
  });

  it("does not persist visible rollback when rendered collapse and native reattach both fail", async () => {
    const applyError = new Error("rendered collapse failed");
    const attachError = new Error("reattach failed");
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 58,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: true,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    await act(async () => {
      await result.current.setBrowserVisible(false);
    });

    act(() => {
      result.current.handleBrowserLayoutApplyFailure(applyError);
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.handleBrowserRestoreFailure(attachError);
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ browserVisible: true }),
    );
    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: false,
    });
  });

  it("does not persist visible rollback when rendered collapse and visible layout rollback both fail", async () => {
    const collapseError = new Error("rendered collapse failed");
    const rollbackError = new Error("rendered rollback failed");
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 58,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: true,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    await act(async () => {
      await result.current.setBrowserVisible(false);
    });

    act(() => {
      result.current.handleBrowserLayoutApplyFailure(collapseError);
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.handleBrowserLayoutApplyFailure(rollbackError);
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: false,
    });
    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ browserVisible: true }),
    );
  });

  it("keeps later saves hidden after rendered collapse failure and native reattach failure", async () => {
    const applyError = new Error("rendered collapse failed");
    const attachError = new Error("reattach failed");
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 58,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: true,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    await act(async () => {
      await result.current.setBrowserVisible(false);
    });

    act(() => {
      result.current.handleBrowserLayoutApplyFailure(applyError);
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.handleBrowserRestoreFailure(attachError);
      result.current.updateActiveBoard("board-after-rollback-failure");
    });

    await act(async () => {
      await result.current.flushPendingLayoutSave();
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: false,
      activeBoardId: "board-after-rollback-failure",
    });
    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ browserVisible: true }),
    );
  });

  it("does not persist a restored browser layout until native attach succeeds", async () => {
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: false,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    await act(async () => {
      await result.current.setBrowserVisible(true);
    });

    expect(result.current.layout).toEqual({
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 58,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: true,
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalled();

    act(() => {
      result.current.confirmBrowserLayoutApplied();
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalled();

    act(() => {
      result.current.confirmBrowserRestored();
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 58,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: true,
    });
  });

  it("does not persist restore-driven layout changes while native attach is pending", async () => {
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: false,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    await act(async () => {
      await result.current.setBrowserVisible(true);
    });

    act(() => {
      result.current.updatePanelSize({ primary: 60, secondary: 40 });
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalled();

    act(() => {
      result.current.confirmBrowserLayoutApplied();
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalled();

    act(() => {
      result.current.confirmBrowserRestored();
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 60,
      lastVisiblePrimaryPanelSize: 60,
      browserVisible: true,
    });
  });

  it("does not persist layout-driven browser restore until native attach succeeds", async () => {
    const attachError = new Error("attach failed");
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: false,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    act(() => {
      result.current.updatePanelSize({ primary: 58, secondary: 42 });
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.layout).toEqual({
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 58,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: true,
    });
    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalled();

    act(() => {
      result.current.handleBrowserRestoreFailure(attachError);
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: false,
    });
    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ browserVisible: true }),
    );
  });

  it("keeps hidden browser layouts fully collapsed for partial expansion below the useful threshold", async () => {
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: false,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    act(() => {
      result.current.updatePanelSize({ primary: 90, secondary: 10 });
    });

    expect(result.current.layout).toEqual({
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: false,
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: false,
    });
  });

  it("persists board selection during pending browser restore without saving browser visible", async () => {
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: false,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    await act(async () => {
      await result.current.setBrowserVisible(true);
    });

    act(() => {
      result.current.updateActiveBoard("board-restore");
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: false,
      activeBoardId: "board-restore",
    });
    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ browserVisible: true }),
    );
  });

  it("persists board sidebar visibility during pending browser restore without saving browser visible", async () => {
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 58,
      browserVisible: false,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    await act(async () => {
      await result.current.setBrowserVisible(true);
    });

    act(() => {
      result.current.setBoardsVisible(false);
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 58,
      boardsVisible: false,
      browserVisible: false,
    });
    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ browserVisible: true }),
    );
  });

  it("does not leave restore pending when setting an already visible browser visible", async () => {
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 55,
      lastVisiblePrimaryPanelSize: 55,
      browserVisible: true,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    await act(async () => {
      await result.current.setBrowserVisible(true);
    });

    act(() => {
      result.current.updatePanelSize({ primary: 63, secondary: 37 });
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 63,
      lastVisiblePrimaryPanelSize: 63,
      browserVisible: true,
    });
  });

  it("rolls back a restored browser layout when native attach fails", async () => {
    const consoleErrorSpy = suppressExpectedConsoleError();
    const attachError = new Error("attach failed");
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 62,
      browserVisible: false,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    await act(async () => {
      await result.current.setBrowserVisible(true);
    });

    act(() => {
      result.current.handleBrowserRestoreFailure(attachError);
    });

    expect(result.current.layout).toEqual({
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 62,
      browserVisible: false,
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[WorkspaceLayout] Failed to restore browser panel",
      expect.objectContaining({ error: attachError }),
    );

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ browserVisible: true }),
    );
    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 62,
      browserVisible: false,
    });
  });

  it("rolls back unconfirmed restored split fields when native attach fails after resize", async () => {
    const attachError = new Error("attach failed");
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 62,
      browserVisible: false,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    await act(async () => {
      await result.current.setBrowserVisible(true);
    });

    act(() => {
      result.current.updatePanelSize({ primary: 58, secondary: 42 });
    });

    act(() => {
      result.current.handleBrowserRestoreFailure(attachError);
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.layout).toEqual({
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 62,
      browserVisible: false,
    });
    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 62,
      browserVisible: false,
    });
    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({
        lastVisiblePrimaryPanelSize: 58,
      }),
    );
  });

  it("keeps browser state unpersisted when native hide fails so controls can retry", async () => {
    const consoleErrorSpy = suppressExpectedConsoleError();
    const hideError = new Error("hide failed");
    browserHideMock.mockRejectedValueOnce(hideError).mockResolvedValueOnce(undefined);
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 57,
      lastVisiblePrimaryPanelSize: 57,
      browserVisible: true,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    await act(async () => {
      await result.current.setBrowserVisible(false);
    });

    expect(result.current.layout.browserVisible).toBe(true);
    expect(result.current.layout.primaryPanelSize).toBe(57);
    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[WorkspaceLayout] Failed to hide browser panel",
      expect.objectContaining({ error: hideError }),
    );

    await act(async () => {
      await result.current.toggleBrowserVisible();
    });

    expect(result.current.layout.browserVisible).toBe(false);
    expect(result.current.layout.primaryPanelSize).toBe(100);
  });

  it("restores visible layout when persisted-hidden native hide fails", async () => {
    const consoleErrorSpy = suppressExpectedConsoleError();
    const hideError = new Error("persisted hide failed");
    browserHideMock.mockRejectedValueOnce(hideError);
    getWorkspaceLayoutMock.mockResolvedValue({
      primaryPanelSize: 100,
      lastVisiblePrimaryPanelSize: 57,
      browserVisible: false,
    });

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    await act(async () => {
      await result.current.ensureBrowserHidden();
    });

    expect(result.current.layout).toEqual({
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 57,
      lastVisiblePrimaryPanelSize: 57,
      browserVisible: true,
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[WorkspaceLayout] Failed to hide browser panel",
      expect.objectContaining({ error: hideError }),
    );

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).not.toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ browserVisible: true }),
    );

    act(() => {
      result.current.confirmBrowserLayoutApplied();
      result.current.confirmBrowserRestored();
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-1", {
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 57,
      lastVisiblePrimaryPanelSize: 57,
      browserVisible: true,
    });
  });

  it("keeps layout responsive and reports layout-save failures", async () => {
    const consoleErrorSpy = suppressExpectedConsoleError();
    const saveError = new Error("save failed");
    getWorkspaceLayoutMock.mockResolvedValue(null);
    saveWorkspaceLayoutMock.mockRejectedValueOnce(saveError);

    const { result } = renderHook(() => useWorkspaceLayout("workspace-1"));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    vi.useFakeTimers();

    act(() => {
      result.current.setBoardsVisible(false);
    });

    expect(result.current.layout.boardsVisible).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.layout.boardsVisible).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[WorkspaceLayout] Failed to save workspace layout",
      expect.objectContaining({ error: saveError }),
    );
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
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 58,
      lastVisiblePrimaryPanelSize: 58,
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
      ...DEFAULT_LAYOUT,
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
      ...DEFAULT_LAYOUT,
      primaryPanelSize: 68,
      lastVisiblePrimaryPanelSize: 68,
    });
  });
});
