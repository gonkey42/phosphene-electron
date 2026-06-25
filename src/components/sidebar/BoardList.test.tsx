import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSharedErrors, getSharedErrors } from "../../hooks/shared-error-store";

const { createBoardMock, deleteBoardMock, mapBoardItemsMock, listBoardsMock, renameBoardMock } =
  vi.hoisted(() => ({
    createBoardMock: vi.fn(),
    deleteBoardMock: vi.fn(),
    mapBoardItemsMock: vi.fn(
      (
        items: Array<{
          id: string;
          name: string;
          description: string | null;
          position: number;
          updated_at: string;
          workspace_id: string | null;
        }>,
      ) =>
        items.map((item) => ({
          id: item.id,
          workspaceId: item.workspace_id,
          name: item.name,
          description: item.description,
          position: item.position,
          updatedAt: item.updated_at,
        })),
    ),
    listBoardsMock: vi.fn(),
    renameBoardMock: vi.fn(),
  }));

vi.mock("../../lib/board-operations", () => ({
  createBoard: createBoardMock,
  deleteBoard: deleteBoardMock,
  mapBoardItems: mapBoardItemsMock,
  listBoards: listBoardsMock,
  renameBoard: renameBoardMock,
}));

import { useAppStore } from "../../stores/app-store";

import { BoardList } from "./BoardList";

const activeWorkspaceId = "workspace-1";

function createBoardItem(
  overrides: Partial<{
    id: string;
    name: string;
    description: string | null;
    position: number;
    updated_at: string;
    workspace_id: string | null;
  }> = {},
) {
  return {
    id: "board-1",
    name: "Sketches",
    description: null,
    position: 0,
    updated_at: "2026-03-29T12:00:00Z",
    workspace_id: activeWorkspaceId,
    ...overrides,
  };
}

function createDeferred<T = void>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

describe("BoardList", () => {
  beforeEach(() => {
    clearSharedErrors();
    vi.useRealTimers();
    createBoardMock.mockReset();
    deleteBoardMock.mockReset();
    mapBoardItemsMock.mockReset();
    mapBoardItemsMock.mockImplementation(
      (
        items: Array<{
          id: string;
          name: string;
          description: string | null;
          position: number;
          updated_at: string;
          workspace_id: string | null;
        }>,
      ) =>
        items.map((item) => ({
          id: item.id,
          workspaceId: item.workspace_id,
          name: item.name,
          description: item.description,
          position: item.position,
          updatedAt: item.updated_at,
        })),
    );
    listBoardsMock.mockReset();
    renameBoardMock.mockReset();
    useAppStore.setState({
      activeWorkspaceId,
      activeBoardId: null,
      activeBoardPerWorkspace: {},
      boards: [],
      boardListRefresh: { workspaceId: null, nonce: 0 },
    });
  });

  afterEach(() => {
    cleanup();
    clearSharedErrors();
    vi.restoreAllMocks();
  });

  it("renders the empty state when the active workspace has no boards", async () => {
    listBoardsMock.mockResolvedValue([]);

    render(<BoardList />);

    expect(await screen.findByText("No boards yet.")).toBeInTheDocument();
    expect(screen.getByText("Click + to create one.")).toBeInTheDocument();
    expect(listBoardsMock).toHaveBeenCalledWith(activeWorkspaceId);
  });

  it("notifies when loading clears a missing active board selection", async () => {
    const onBoardSelect = vi.fn();

    useAppStore.setState({
      activeBoardId: "board-stale",
      activeBoardPerWorkspace: {
        [activeWorkspaceId]: "board-stale",
      },
    });
    listBoardsMock.mockResolvedValue([createBoardItem()]);

    render(<BoardList onBoardSelect={onBoardSelect} />);

    expect(await screen.findByRole("button", { name: /Sketches/ })).toBeInTheDocument();
    expect(useAppStore.getState().activeBoardPerWorkspace).toEqual({
      [activeWorkspaceId]: null,
    });
    expect(useAppStore.getState().activeBoardId).toBeNull();
    expect(onBoardSelect).toHaveBeenCalledWith(null);
  });

  it("uses the provided workspace id instead of the global active workspace", async () => {
    listBoardsMock.mockResolvedValue([
      createBoardItem({
        id: "board-2",
        name: "Research",
        workspace_id: "workspace-2",
      }),
    ]);

    render(<BoardList workspaceId="workspace-2" />);

    expect(await screen.findByRole("button", { name: /Research/ })).toBeInTheDocument();
    expect(listBoardsMock).toHaveBeenCalledWith("workspace-2");
  });

  it("selects a board when it is clicked", async () => {
    listBoardsMock.mockResolvedValue([createBoardItem()]);
    const onBoardSelect = vi.fn();

    render(<BoardList onBoardSelect={onBoardSelect} />);

    const boardButton = await screen.findByRole("button", { name: /Sketches/ });
    fireEvent.click(boardButton);

    expect(useAppStore.getState().activeBoardPerWorkspace).toEqual({
      [activeWorkspaceId]: "board-1",
    });
    expect(useAppStore.getState().activeBoardId).toBe("board-1");
    expect(onBoardSelect).toHaveBeenCalledWith("board-1");
  });

  it("creates a new board, reloads the list, and activates the new board", async () => {
    listBoardsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createBoardItem({ id: "board-2", name: "Board 1", position: 1 })]);
    createBoardMock.mockResolvedValue("board-2");
    const onBoardSelect = vi.fn();

    render(<BoardList onBoardSelect={onBoardSelect} />);

    await screen.findByText("No boards yet.");
    fireEvent.click(screen.getByRole("button", { name: "Create board" }));

    expect(createBoardMock).toHaveBeenCalledWith("Board 1", activeWorkspaceId);

    expect(await screen.findByRole("button", { name: /Board 1/ })).toBeInTheDocument();
    expect(useAppStore.getState().activeBoardPerWorkspace).toEqual({
      [activeWorkspaceId]: "board-2",
    });
    expect(useAppStore.getState().activeBoardId).toBe("board-2");
    expect(onBoardSelect).toHaveBeenCalledWith("board-2");
  });

  it("notifies when deleting the active board clears the workspace selection", async () => {
    listBoardsMock.mockResolvedValueOnce([createBoardItem()]).mockResolvedValueOnce([]);
    deleteBoardMock.mockResolvedValue(undefined);
    const onBoardSelect = vi.fn();

    useAppStore.setState({
      activeBoardId: "board-1",
      activeBoardPerWorkspace: {
        [activeWorkspaceId]: "board-1",
      },
    });

    render(<BoardList onBoardSelect={onBoardSelect} />);

    const boardButton = await screen.findByRole("button", { name: /Sketches/ });
    const boardItem = boardButton.closest("li");

    expect(boardItem).not.toBeNull();

    fireEvent.mouseEnter(boardItem!);
    const deleteButton = within(boardItem!).getByRole("button", { name: "Delete" });
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(deleteBoardMock).toHaveBeenCalledWith("board-1");
    });
    expect(useAppStore.getState().activeBoardPerWorkspace).toEqual({
      [activeWorkspaceId]: null,
    });
    expect(useAppStore.getState().activeBoardId).toBeNull();
    expect(onBoardSelect).toHaveBeenCalledWith(null);
  });

  it("keeps the current workspace list when a create resolves after switching workspaces", async () => {
    let resolveCreateBoard: ((boardId: string) => void) | null = null;
    const createBoardPromise = new Promise<string>((resolve) => {
      resolveCreateBoard = resolve;
    });

    listBoardsMock
      .mockResolvedValueOnce([createBoardItem()])
      .mockResolvedValueOnce([
        createBoardItem({
          id: "board-9",
          name: "Research",
          position: 0,
          workspace_id: "workspace-2",
        }),
      ])
      .mockResolvedValueOnce([
        createBoardItem(),
        createBoardItem({
          id: "board-2",
          name: "Board 2",
          position: 1,
        }),
      ]);
    createBoardMock.mockReturnValue(createBoardPromise);

    render(<BoardList />);

    await screen.findByRole("button", { name: /Sketches/ });
    fireEvent.click(screen.getByRole("button", { name: "Create board" }));

    act(() => {
      useAppStore.setState({ activeWorkspaceId: "workspace-2" });
    });

    expect(await screen.findByRole("button", { name: /Research/ })).toBeInTheDocument();

    await act(async () => {
      resolveCreateBoard?.("board-2");
      await createBoardPromise;
    });

    await waitFor(() => {
      expect(useAppStore.getState().activeBoardId).toBeNull();
    });
    expect(screen.getByRole("button", { name: /Research/ })).toBeInTheDocument();
    expect(listBoardsMock).toHaveBeenCalledTimes(2);
  });

  it("keeps using the provided workspace id for async create refreshes after the global workspace changes", async () => {
    let resolveCreateBoard: ((boardId: string) => void) | null = null;
    const createBoardPromise = new Promise<string>((resolve) => {
      resolveCreateBoard = resolve;
    });

    listBoardsMock.mockResolvedValueOnce([createBoardItem()]).mockResolvedValueOnce([
      createBoardItem(),
      createBoardItem({
        id: "board-2",
        name: "Board 2",
        position: 1,
      }),
    ]);
    createBoardMock.mockReturnValue(createBoardPromise);

    render(<BoardList workspaceId={activeWorkspaceId} />);

    await screen.findByRole("button", { name: /Sketches/ });
    fireEvent.click(screen.getByRole("button", { name: "Create board" }));

    act(() => {
      useAppStore.setState({ activeWorkspaceId: "workspace-2" });
    });

    await act(async () => {
      resolveCreateBoard?.("board-2");
      await createBoardPromise;
    });

    expect(createBoardMock).toHaveBeenCalledWith("Board 2", activeWorkspaceId);
    expect(await screen.findByRole("button", { name: /Board 2/ })).toBeInTheDocument();
    expect(listBoardsMock).toHaveBeenNthCalledWith(2, activeWorkspaceId);
    expect(useAppStore.getState().activeBoardPerWorkspace).toEqual({
      [activeWorkspaceId]: "board-2",
    });
    expect(useAppStore.getState().activeBoardId).toBeNull();
  });

  it("logs create failures without surfacing them", async () => {
    const createError = new Error("create failed");

    listBoardsMock.mockResolvedValue([]);
    createBoardMock.mockRejectedValue(createError);

    render(<BoardList />);

    await screen.findByText("No boards yet.");
    fireEvent.click(screen.getByRole("button", { name: "Create board" }));

    await waitFor(() => {
      expect(getSharedErrors()).toEqual([
        expect.objectContaining({
          message: "Failed to create board",
          source: "BoardList",
          error: createError,
          context: { workspaceId: activeWorkspaceId },
          channel: "board-list:create",
        }),
      ]);
    });
    expect(useAppStore.getState().activeBoardId).toBeNull();
  });

  it("preserves the current selection when the initial board load fails", async () => {
    const loadError = new Error("load failed");
    const onBoardSelect = vi.fn();

    useAppStore.setState({
      activeBoardId: "board-1",
      activeBoardPerWorkspace: {
        [activeWorkspaceId]: "board-1",
      },
    });
    listBoardsMock.mockRejectedValue(loadError);

    render(<BoardList onBoardSelect={onBoardSelect} />);

    expect(await screen.findByText("No boards yet.")).toBeInTheDocument();
    expect(useAppStore.getState().activeBoardPerWorkspace).toEqual({
      [activeWorkspaceId]: "board-1",
    });
    expect(useAppStore.getState().activeBoardId).toBe("board-1");
    expect(onBoardSelect).not.toHaveBeenCalled();
    expect(getSharedErrors()).toEqual([
      expect.objectContaining({
        message: "Failed to load boards",
        source: "BoardList",
        error: loadError,
        context: { workspaceId: activeWorkspaceId },
        channel: "board-list:load",
      }),
    ]);
  });

  it("notifies persistence when a later successful refresh confirms the selected board is gone", async () => {
    const loadError = new Error("load failed");
    const onBoardSelect = vi.fn();

    useAppStore.setState({
      activeBoardId: "board-1",
      activeBoardPerWorkspace: {
        [activeWorkspaceId]: "board-1",
      },
    });
    listBoardsMock
      .mockRejectedValueOnce(loadError)
      .mockResolvedValueOnce([createBoardItem({ id: "board-2", name: "Notes", position: 1 })]);

    render(<BoardList onBoardSelect={onBoardSelect} />);

    expect(await screen.findByText("No boards yet.")).toBeInTheDocument();
    expect(useAppStore.getState().activeBoardId).toBe("board-1");

    act(() => {
      useAppStore.getState().requestBoardListRefresh(activeWorkspaceId);
    });

    expect(await screen.findByRole("button", { name: /Notes/ })).toBeInTheDocument();
    expect(useAppStore.getState().activeBoardPerWorkspace).toEqual({
      [activeWorkspaceId]: null,
    });
    expect(useAppStore.getState().activeBoardId).toBeNull();
    expect(onBoardSelect).toHaveBeenCalledWith(null);
    expect(getSharedErrors()).toEqual([]);
  });

  it("surfaces reload failures through the shared channel and clears them after retry succeeds", async () => {
    const refreshError = new Error("reload failed");

    listBoardsMock
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(refreshError)
      .mockResolvedValueOnce([createBoardItem({ id: "board-2", name: "Board 1", position: 1 })]);
    createBoardMock.mockResolvedValue("board-2");

    render(<BoardList />);

    await screen.findByText("No boards yet.");
    fireEvent.click(screen.getByRole("button", { name: "Create board" }));

    await waitFor(() => {
      expect(getSharedErrors()).toEqual([
        expect.objectContaining({
          message: "Failed to reload boards",
          source: "BoardList",
          error: refreshError,
          channel: "board-list:reload",
          retry: {
            label: "Retry",
            run: expect.any(Function),
          },
        }),
      ]);
    });
    expect(useAppStore.getState().activeBoardPerWorkspace).toEqual({
      [activeWorkspaceId]: "board-2",
    });
    expect(useAppStore.getState().activeBoardId).toBe("board-2");

    const [errorEntry] = getSharedErrors();
    expect(errorEntry.retry).toEqual({
      label: "Retry",
      run: expect.any(Function),
    });

    await act(async () => {
      await errorEntry.retry?.run();
    });

    expect(getSharedErrors()).toEqual([]);
    expect(await screen.findByRole("button", { name: /Board 1/ })).toBeInTheDocument();
  });

  it("renames a board inline and reloads the list", async () => {
    listBoardsMock
      .mockResolvedValueOnce([createBoardItem()])
      .mockResolvedValueOnce([createBoardItem({ name: "Updated board" })]);
    renameBoardMock.mockResolvedValue(undefined);

    render(<BoardList />);

    const boardButton = await screen.findByRole("button", { name: /Sketches/ });
    fireEvent.click(
      within(boardButton.parentElement as HTMLElement).getByRole("button", { name: "Rename" }),
    );

    const input = screen.getByRole("textbox", { name: "Board name" });
    fireEvent.change(input, { target: { value: "Updated board" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(renameBoardMock).toHaveBeenCalledWith("board-1", "Updated board");
    expect(await screen.findByRole("button", { name: /Updated board/ })).toBeInTheDocument();
  });

  it("keeps rename mode active when the submitted name is whitespace-only", async () => {
    listBoardsMock.mockResolvedValue([createBoardItem()]);
    renameBoardMock.mockResolvedValue(undefined);

    render(<BoardList />);

    const boardButton = await screen.findByRole("button", { name: /Sketches/ });
    fireEvent.click(
      within(boardButton.parentElement as HTMLElement).getByRole("button", { name: "Rename" }),
    );

    const input = screen.getByRole("textbox", { name: "Board name" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(renameBoardMock).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Board name" })).toHaveValue("   ");
  });

  it("logs rename failures without surfacing them", async () => {
    const renameError = new Error("rename failed");

    listBoardsMock.mockResolvedValue([createBoardItem()]);
    renameBoardMock.mockRejectedValue(renameError);

    render(<BoardList />);

    const boardButton = await screen.findByRole("button", { name: /Sketches/ });
    fireEvent.click(
      within(boardButton.parentElement as HTMLElement).getByRole("button", { name: "Rename" }),
    );

    const input = screen.getByRole("textbox", { name: "Board name" });
    fireEvent.change(input, { target: { value: "Updated board" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(getSharedErrors()).toEqual([
        expect.objectContaining({
          message: "Failed to rename board",
          source: "BoardList",
          error: renameError,
          channel: "board-list:rename",
        }),
      ]);
    });
    expect(screen.getByRole("textbox", { name: "Board name" })).toHaveValue("Updated board");
  });

  it("cancels rename mode when the board is deleted", async () => {
    listBoardsMock.mockResolvedValueOnce([createBoardItem()]).mockResolvedValueOnce([]);
    deleteBoardMock.mockResolvedValue(undefined);

    render(<BoardList />);

    const boardButton = await screen.findByRole("button", { name: /Sketches/ });
    const boardItem = boardButton.closest("li");

    expect(boardItem).not.toBeNull();

    fireEvent.click(within(boardItem as HTMLElement).getByRole("button", { name: "Rename" }));

    expect(screen.getByRole("textbox", { name: "Board name" })).toBeInTheDocument();

    const deleteButton = within(boardItem as HTMLElement).getByRole("button", { name: "Delete" });
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(deleteBoardMock).toHaveBeenCalledWith("board-1");
    });
    expect(screen.queryByRole("textbox", { name: "Board name" })).not.toBeInTheDocument();
  });

  it("deletes the active board, clears selection, and reloads the list", async () => {
    useAppStore.setState({
      activeBoardId: "board-1",
      activeBoardPerWorkspace: {
        [activeWorkspaceId]: "board-1",
      },
    });
    listBoardsMock
      .mockResolvedValueOnce([
        createBoardItem(),
        createBoardItem({ id: "board-2", name: "Notes", position: 1 }),
      ])
      .mockResolvedValueOnce([createBoardItem({ id: "board-2", name: "Notes", position: 1 })]);
    deleteBoardMock.mockResolvedValue(undefined);

    render(<BoardList />);

    const boardButton = await screen.findByRole("button", { name: /Sketches/ });
    const deleteButton = within(boardButton.parentElement as HTMLElement).getByRole("button", {
      name: "Delete",
    });
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    expect(deleteBoardMock).toHaveBeenCalledWith("board-1");
    expect(await screen.findByRole("button", { name: /Notes/ })).toBeInTheDocument();
    expect(useAppStore.getState().activeBoardPerWorkspace).toEqual({
      [activeWorkspaceId]: null,
    });
    expect(useAppStore.getState().activeBoardId).toBeNull();
  });

  it("shows a pending delete label while a board delete is in flight", async () => {
    const pendingDelete = createDeferred();

    listBoardsMock.mockResolvedValueOnce([createBoardItem()]).mockResolvedValueOnce([]);
    deleteBoardMock.mockReturnValue(pendingDelete.promise);

    render(<BoardList />);

    const boardButton = await screen.findByRole("button", { name: /Sketches/ });
    const deleteButton = within(boardButton.parentElement as HTMLElement).getByRole("button", {
      name: "Delete",
    });

    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    expect(deleteBoardMock).toHaveBeenCalledWith("board-1");
    expect(
      within(boardButton.parentElement as HTMLElement).getByRole("button", {
        name: "Deleting...",
      }),
    ).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      pendingDelete.resolve();
      await pendingDelete.promise;
    });

    expect(await screen.findByText("No boards yet.")).toBeInTheDocument();
  });

  it("logs delete failures without surfacing them", async () => {
    const deleteError = new Error("delete failed");

    useAppStore.setState({
      activeBoardId: "board-1",
      activeBoardPerWorkspace: {
        [activeWorkspaceId]: "board-1",
      },
    });
    listBoardsMock.mockResolvedValue([createBoardItem()]);
    deleteBoardMock.mockRejectedValue(deleteError);

    render(<BoardList />);

    const boardButton = await screen.findByRole("button", { name: /Sketches/ });
    const deleteButton = within(boardButton.parentElement as HTMLElement).getByRole("button", {
      name: "Delete",
    });
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(getSharedErrors()).toEqual([
        expect.objectContaining({
          message: "Failed to delete board",
          source: "BoardList",
          error: deleteError,
          context: { workspaceId: activeWorkspaceId },
          channel: "board-list:delete",
        }),
      ]);
    });
    expect(useAppStore.getState().activeBoardPerWorkspace).toEqual({
      [activeWorkspaceId]: "board-1",
    });
    expect(useAppStore.getState().activeBoardId).toBe("board-1");
  });

  it("restores the newly selected workspace board instead of clearing it", async () => {
    useAppStore.setState({
      activeBoardId: "board-1",
      activeBoardPerWorkspace: {
        "workspace-1": "board-1",
        "workspace-2": "board-2",
      },
    });
    listBoardsMock
      .mockResolvedValueOnce([createBoardItem({ id: "board-1", workspace_id: activeWorkspaceId })])
      .mockResolvedValueOnce([
        createBoardItem({
          id: "board-2",
          name: "Research",
          position: 0,
          workspace_id: "workspace-2",
        }),
      ]);

    render(<BoardList />);

    await screen.findByRole("button", { name: /Sketches/ });

    act(() => {
      useAppStore.getState().setActiveWorkspace("workspace-2");
    });

    expect(await screen.findByRole("button", { name: /Research/ })).toBeInTheDocument();

    await waitFor(() => {
      expect(useAppStore.getState().activeBoardId).toBe("board-2");
    });
  });

  it("does not clear the active board when only the global workspace changes for a prop-scoped list", async () => {
    useAppStore.setState({
      activeBoardId: "board-1",
      activeBoardPerWorkspace: {
        [activeWorkspaceId]: "board-1",
      },
    });
    listBoardsMock.mockResolvedValue([createBoardItem({ id: "board-1" })]);

    render(<BoardList workspaceId={activeWorkspaceId} />);

    await screen.findByRole("button", { name: /Sketches/ });

    act(() => {
      useAppStore.setState({ activeWorkspaceId: "workspace-2" });
    });

    await waitFor(() => {
      expect(useAppStore.getState().activeBoardPerWorkspace).toEqual({
        [activeWorkspaceId]: "board-1",
      });
    });
  });

  it("reloads boards when a refresh is requested for its workspace", async () => {
    listBoardsMock
      .mockResolvedValueOnce([createBoardItem()])
      .mockResolvedValueOnce([
        createBoardItem(),
        createBoardItem({ id: "board-2", name: "New Board", position: 1 }),
      ]);

    render(<BoardList workspaceId={activeWorkspaceId} />);

    await screen.findByRole("button", { name: /Sketches/ });

    act(() => {
      useAppStore.getState().requestBoardListRefresh(activeWorkspaceId);
    });

    expect(await screen.findByRole("button", { name: /New Board/ })).toBeInTheDocument();
    expect(listBoardsMock).toHaveBeenNthCalledWith(2, activeWorkspaceId);
  });

  it("does not reload again when a parent rerender replaces onBoardSelect after a refresh", async () => {
    listBoardsMock
      .mockResolvedValueOnce([createBoardItem()])
      .mockResolvedValueOnce([
        createBoardItem(),
        createBoardItem({ id: "board-2", name: "New Board", position: 1 }),
      ]);

    const { rerender } = render(<BoardList onBoardSelect={vi.fn()} />);

    await screen.findByRole("button", { name: /Sketches/ });

    act(() => {
      useAppStore.getState().requestBoardListRefresh(activeWorkspaceId);
    });

    expect(await screen.findByRole("button", { name: /New Board/ })).toBeInTheDocument();
    expect(listBoardsMock).toHaveBeenCalledTimes(2);

    rerender(<BoardList onBoardSelect={vi.fn()} />);

    await waitFor(() => {
      expect(listBoardsMock).toHaveBeenCalledTimes(2);
    });
  });

  it("formats relative updated times", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-03-29T12:00:00Z").getTime());
    listBoardsMock.mockResolvedValue([
      createBoardItem({
        id: "board-1",
        name: "Now",
        updated_at: "2026-03-29 12:00:00",
        position: 0,
      }),
      createBoardItem({
        id: "board-2",
        name: "Minutes",
        updated_at: "2026-03-29 11:55:00",
        position: 1,
      }),
      createBoardItem({
        id: "board-3",
        name: "Hours",
        updated_at: "2026-03-29 10:00:00",
        position: 2,
      }),
      createBoardItem({
        id: "board-4",
        name: "Days",
        updated_at: "2026-03-26 12:00:00",
        position: 3,
      }),
    ]);

    render(<BoardList />);

    await screen.findByRole("button", { name: /Now/ });
    expect(screen.getByText("just now")).toBeInTheDocument();
    expect(screen.getByText("5m ago")).toBeInTheDocument();
    expect(screen.getByText("2h ago")).toBeInTheDocument();
    expect(screen.getByText("3d ago")).toBeInTheDocument();
  });
});
