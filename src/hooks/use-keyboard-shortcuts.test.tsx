import { act, cleanup, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createBoardMock, createWorkspaceMock, listWorkspacesMock, mapWorkspaceMock } = vi.hoisted(
  () => ({
    createBoardMock: vi.fn(),
    createWorkspaceMock: vi.fn(),
    listWorkspacesMock: vi.fn(),
    mapWorkspaceMock: vi.fn((item) => ({
      id: item.id,
      name: item.name,
      icon: item.icon ?? "📋",
      position: item.position,
    })),
  }),
);

vi.mock("../lib/board-operations", () => ({
  createBoard: createBoardMock,
}));

vi.mock("../lib/workspace-operations", () => ({
  createWorkspace: createWorkspaceMock,
  mapWorkspace: mapWorkspaceMock,
  listWorkspaces: listWorkspacesMock,
}));

import { useAppStore } from "../stores/app-store";

import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    createBoardMock.mockReset();
    createWorkspaceMock.mockReset();
    listWorkspacesMock.mockReset();
    useAppStore.setState({
      workspaces: [
        { id: "workspace-1", name: "Home", icon: "🏠", position: 0 },
        { id: "workspace-2", name: "Research", icon: "🔎", position: 1 },
      ],
      activeWorkspaceId: "workspace-1",
      boards: [],
      activeBoardId: null,
      boardListRefresh: { workspaceId: null, nonce: 0 },
      focus: "global",
      initialized: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("registers a keydown listener in capture phase and removes it on cleanup", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useKeyboardShortcuts());

    expect(addEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function), {
      capture: true,
    });

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function), {
      capture: true,
    });
  });

  it("switches to a workspace by its keyboard index when focus is global", () => {
    renderHook(() => useKeyboardShortcuts());

    const event = new KeyboardEvent("keydown", {
      key: "2",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-2");
    expect(event.defaultPrevented).toBe(true);
  });

  it("moves between adjacent workspaces with bracket shortcuts", () => {
    renderHook(() => useKeyboardShortcuts());

    const nextEvent = new KeyboardEvent("keydown", {
      key: "]",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      window.dispatchEvent(nextEvent);
    });

    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-2");

    const previousEvent = new KeyboardEvent("keydown", {
      key: "[",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      window.dispatchEvent(previousEvent);
    });

    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-1");
  });

  it("does not handle shortcuts while the canvas owns focus", () => {
    useAppStore.setState({ focus: "canvas" });
    renderHook(() => useKeyboardShortcuts());

    const event = new KeyboardEvent("keydown", {
      key: "2",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-1");
    expect(event.defaultPrevented).toBe(false);
  });

  it("creates a workspace, refreshes the list, and activates it", async () => {
    createWorkspaceMock.mockResolvedValue("workspace-3");
    listWorkspacesMock.mockResolvedValue([
      { id: "workspace-1", name: "Home", icon: "🏠", position: 0 },
      { id: "workspace-2", name: "Research", icon: "🔎", position: 1 },
      { id: "workspace-3", name: "Workspace 3", icon: null, position: 2 },
    ]);
    renderHook(() => useKeyboardShortcuts());

    const event = new KeyboardEvent("keydown", {
      key: "t",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      window.dispatchEvent(event);
    });

    await waitFor(() => {
      expect(createWorkspaceMock).toHaveBeenCalledWith("Workspace 3");
      expect(listWorkspacesMock).toHaveBeenCalledTimes(1);
      expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-3");
    });

    expect(useAppStore.getState().workspaces).toEqual([
      { id: "workspace-1", name: "Home", icon: "🏠", position: 0 },
      { id: "workspace-2", name: "Research", icon: "🔎", position: 1 },
      { id: "workspace-3", name: "Workspace 3", icon: "📋", position: 2 },
    ]);
  });

  it("creates a new board in the active workspace and activates it", async () => {
    createBoardMock.mockResolvedValue("board-9");
    renderHook(() => useKeyboardShortcuts());

    const event = new KeyboardEvent("keydown", {
      key: "n",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      window.dispatchEvent(event);
    });

    await waitFor(() => {
      expect(createBoardMock).toHaveBeenCalledWith("New Board", "workspace-1");
      expect(useAppStore.getState().activeBoardId).toBe("board-9");
      expect(useAppStore.getState().boardListRefresh).toEqual({
        workspaceId: "workspace-1",
        nonce: 1,
      });
    });
  });

  it("does not handle shortcuts from editable targets", () => {
    renderHook(() => useKeyboardShortcuts());
    const input = document.createElement("input");
    document.body.appendChild(input);

    fireEvent.keyDown(input, {
      key: "n",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    expect(createBoardMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().activeBoardId).toBeNull();

    input.remove();
  });

  it("does not handle shortcuts before initialization finishes", () => {
    useAppStore.setState({ initialized: false });
    renderHook(() => useKeyboardShortcuts());

    const event = new KeyboardEvent("keydown", {
      key: "t",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(createWorkspaceMock).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("logs workspace shortcut failures without surfacing them", async () => {
    const workspaceError = new Error("workspace create failed");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    createWorkspaceMock.mockRejectedValue(workspaceError);
    renderHook(() => useKeyboardShortcuts());

    fireEvent.keyDown(window, {
      key: "t",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to create workspace from keyboard shortcut",
        workspaceError,
      );
    });
    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-1");
  });

  it("logs board shortcut failures without surfacing them", async () => {
    const boardError = new Error("board create failed");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    createBoardMock.mockRejectedValue(boardError);
    renderHook(() => useKeyboardShortcuts());

    fireEvent.keyDown(window, {
      key: "n",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to create board from keyboard shortcut",
        boardError,
      );
    });
    expect(useAppStore.getState().activeBoardId).toBeNull();
  });
});
