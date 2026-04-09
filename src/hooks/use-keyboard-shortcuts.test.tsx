import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSharedErrors, getSharedErrors } from "./shared-error-store";

const {
  createBoardMock,
  createWorkspaceMock,
  listBoardsMock,
  listWorkspacesMock,
  mapWorkspaceMock,
} = vi.hoisted(
  () => ({
    createBoardMock: vi.fn(),
    createWorkspaceMock: vi.fn(),
    listBoardsMock: vi.fn(),
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
  listBoards: listBoardsMock,
}));

vi.mock("../lib/workspace-operations", () => ({
  createWorkspace: createWorkspaceMock,
  mapWorkspace: mapWorkspaceMock,
  listWorkspaces: listWorkspacesMock,
}));

import { useAppStore } from "../stores/app-store";
import { BoardList } from "../components/sidebar/BoardList";
import { SharedErrorBanner } from "../components/shared/SharedErrorBanner";

import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

function KeyboardBoardHarness() {
  useKeyboardShortcuts();
  return <BoardList />;
}

function KeyboardErrorHarness() {
  useKeyboardShortcuts();
  return <SharedErrorBanner />;
}

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    clearSharedErrors();
    createBoardMock.mockReset();
    createWorkspaceMock.mockReset();
    listBoardsMock.mockReset();
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
    clearSharedErrors();
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
      { id: "workspace-3", name: "Workspace 3", icon: "🪟", position: 2 },
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
      expect(createWorkspaceMock).toHaveBeenCalledWith("Workspace 3", "🪟");
      expect(listWorkspacesMock).toHaveBeenCalledTimes(1);
      expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-3");
    });

    expect(useAppStore.getState().workspaces).toEqual([
      { id: "workspace-1", name: "Home", icon: "🏠", position: 0 },
      { id: "workspace-2", name: "Research", icon: "🔎", position: 1 },
      { id: "workspace-3", name: "Workspace 3", icon: "🪟", position: 2 },
    ]);
  });

  it("keeps the keyboard-created workspace visible and active when reload fails", async () => {
    const reloadError = new Error("workspace refresh failed");
    createWorkspaceMock.mockResolvedValue("workspace-3");
    listWorkspacesMock.mockRejectedValue(reloadError);
    renderHook(() => useKeyboardShortcuts());

    fireEvent.keyDown(window, {
      key: "t",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    await waitFor(() => {
      expect(createWorkspaceMock).toHaveBeenCalledWith("Workspace 3", "🪟");
      expect(listWorkspacesMock).toHaveBeenCalledTimes(1);
      expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-3");
      expect(getSharedErrors()).toEqual([
        expect.objectContaining({
          message: "Failed to reload workspaces from keyboard shortcut",
          source: "KeyboardShortcuts",
          error: reloadError,
          channel: "keyboard-shortcut:reload-workspaces",
          retry: {
            label: "Retry",
            run: expect.any(Function),
          },
        }),
      ]);
    });

    expect(useAppStore.getState().workspaces).toEqual([
      { id: "workspace-1", name: "Home", icon: "🏠", position: 0 },
      { id: "workspace-2", name: "Research", icon: "🔎", position: 1 },
      { id: "workspace-3", name: "Workspace 3", icon: "🪟", position: 2 },
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
      expect(useAppStore.getState().activeBoardPerWorkspace).toEqual({
        "workspace-1": "board-9",
      });
    });
  });

  it("keeps the board list selection in sync after a keyboard-created board", async () => {
    createBoardMock.mockResolvedValue("board-9");
    listWorkspacesMock.mockResolvedValue([
      { id: "workspace-1", name: "Home", icon: "🏠", position: 0 },
      { id: "workspace-2", name: "Research", icon: "🔎", position: 1 },
    ]);
    listBoardsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "board-9",
          name: "New Board",
          description: null,
          position: 0,
          updated_at: "2026-03-29T12:00:00Z",
          workspace_id: "workspace-1",
        },
      ]);

    render(<KeyboardBoardHarness />);

    await screen.findByText("No boards yet.");

    fireEvent.keyDown(window, {
      key: "n",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    const activeBoardButton = await screen.findByRole("button", { name: "New Board" });
    expect(activeBoardButton.closest("li")).toHaveClass("board-list__item--active");
    expect(useAppStore.getState().activeBoardPerWorkspace).toEqual({
      "workspace-1": "board-9",
    });
  });

  it("clears keyboard workspace reload errors after retrying from the banner", async () => {
    const reloadError = new Error("workspace refresh failed");
    createWorkspaceMock.mockResolvedValue("workspace-3");
    listWorkspacesMock
      .mockRejectedValueOnce(reloadError)
      .mockResolvedValueOnce([
        { id: "workspace-1", name: "Home", icon: "🏠", position: 0 },
        { id: "workspace-2", name: "Research", icon: "🔎", position: 1 },
        { id: "workspace-3", name: "Workspace 3", icon: "🪟", position: 2 },
      ]);

    render(<KeyboardErrorHarness />);

    fireEvent.keyDown(window, {
      key: "t",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    const alert = await screen.findByRole("alert", { name: "KeyboardShortcuts" });
    expect(alert).toHaveTextContent("Failed to reload workspaces from keyboard shortcut");
    expect(useAppStore.getState().workspaces).toEqual([
      { id: "workspace-1", name: "Home", icon: "🏠", position: 0 },
      { id: "workspace-2", name: "Research", icon: "🔎", position: 1 },
      { id: "workspace-3", name: "Workspace 3", icon: "🪟", position: 2 },
    ]);
    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-3");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(getSharedErrors()).toEqual([]);
    });
    expect(useAppStore.getState().workspaces).toEqual([
      { id: "workspace-1", name: "Home", icon: "🏠", position: 0 },
      { id: "workspace-2", name: "Research", icon: "🔎", position: 1 },
      { id: "workspace-3", name: "Workspace 3", icon: "🪟", position: 2 },
    ]);
    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-3");
    expect(listWorkspacesMock).toHaveBeenCalledTimes(2);
    expect(createWorkspaceMock).toHaveBeenCalledWith("Workspace 3", "🪟");
    expect(reloadError).toBeInstanceOf(Error);
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

  it("records workspace shortcut failures in the shared channel", async () => {
    const workspaceError = new Error("workspace create failed");
    createWorkspaceMock.mockRejectedValue(workspaceError);
    renderHook(() => useKeyboardShortcuts());

    fireEvent.keyDown(window, {
      key: "t",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    await waitFor(() => {
      expect(getSharedErrors()).toEqual([
        expect.objectContaining({
          message: "Failed to create workspace from keyboard shortcut",
          source: "KeyboardShortcuts",
          error: workspaceError,
          channel: "keyboard-shortcut:create-workspace",
        }),
      ]);
    });
    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-1");
  });

  it("records board shortcut failures in the shared channel", async () => {
    const boardError = new Error("board create failed");
    createBoardMock.mockRejectedValue(boardError);
    renderHook(() => useKeyboardShortcuts());

    fireEvent.keyDown(window, {
      key: "n",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    await waitFor(() => {
      expect(getSharedErrors()).toEqual([
        expect.objectContaining({
          message: "Failed to create board from keyboard shortcut",
          source: "KeyboardShortcuts",
          error: boardError,
          channel: "keyboard-shortcut:create-board",
        }),
      ]);
    });
    expect(useAppStore.getState().activeBoardId).toBeNull();
  });
});
