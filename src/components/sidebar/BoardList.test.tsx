import { readFileSync } from "node:fs";

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
import { useKeyboardShortcuts } from "../../hooks/use-keyboard-shortcuts";

import { BoardList } from "./BoardList";

const boardListCss = readFileSync("src/components/sidebar/BoardList.css", "utf8");
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

function getBoardRow(boardName: string) {
  const boardNameElement = screen.getByText((content, element) =>
    Boolean(element?.classList.contains("board-list__item-name") && content.includes(boardName)),
  );
  const row = boardNameElement.closest("li");

  expect(row).not.toBeNull();
  return row as HTMLElement;
}

function getBoardSelectButton(row: HTMLElement) {
  const button = row.querySelector(".board-list__item-button");

  expect(button).not.toBeNull();
  return button as HTMLButtonElement;
}

async function findBoardSelectButton(boardName: string) {
  await screen.findByText((content, element) =>
    Boolean(element?.classList.contains("board-list__item-name") && content.includes(boardName)),
  );

  return getBoardSelectButton(getBoardRow(boardName));
}

function getBoardDeleteButton(row: HTMLElement, boardName: string, action = "Delete") {
  return within(row).getByRole("button", { name: `${action} ${boardName}` });
}

function BoardListWithKeyboardShortcuts() {
  useKeyboardShortcuts();
  return <BoardList />;
}

function ensureBoardListStylesheet() {
  if (document.head.querySelector("style[data-board-list-test-styles]")) {
    return;
  }

  const style = document.createElement("style");
  style.dataset.boardListTestStyles = "true";
  style.textContent = boardListCss;
  document.head.append(style);
}

function removeBoardListStylesheet() {
  document.head.querySelector("style[data-board-list-test-styles]")?.remove();
}

interface RenderedCssRule {
  mediaText: string | null;
  selectorText: string;
  style: CSSStyleDeclaration;
}

function collectRenderedCssRules(
  ruleList: CSSRuleList,
  renderedRules: RenderedCssRule[],
  mediaText: string | null = null,
) {
  Array.from(ruleList).forEach((rule) => {
    if ("selectorText" in rule && "style" in rule) {
      renderedRules.push({
        mediaText,
        selectorText: String(rule.selectorText),
        style: rule.style as CSSStyleDeclaration,
      });
    }

    if ("cssRules" in rule) {
      const nextMediaText = "conditionText" in rule ? String(rule.conditionText) : mediaText;
      collectRenderedCssRules(rule.cssRules as CSSRuleList, renderedRules, nextMediaText);
    }
  });
}

function getRenderedCssRule(selector: string, mediaText?: string) {
  const renderedRules: RenderedCssRule[] = [];
  Array.from(document.styleSheets).forEach((styleSheet) => {
    collectRenderedCssRules(styleSheet.cssRules, renderedRules);
  });
  const rule = renderedRules.find((candidate) => {
    const selectorMatches = candidate.selectorText
      .split(",")
      .map((part) => part.trim())
      .includes(selector);
    const mediaMatches = mediaText ? candidate.mediaText === mediaText : candidate.mediaText === null;

    return selectorMatches && mediaMatches;
  });

  expect(rule).not.toBeUndefined();
  return rule!.style;
}

function cssSizeToPx(size: string) {
  if (size.endsWith("px")) {
    return Number.parseFloat(size);
  }

  if (size.endsWith("rem")) {
    return Number.parseFloat(size) * 16;
  }

  throw new Error(`Unsupported CSS size: ${size}`);
}

function expectCssSizeInRange(size: string, minimumPx: number, maximumPx: number) {
  const px = cssSizeToPx(size);

  expect(px).toBeGreaterThanOrEqual(minimumPx);
  expect(px).toBeLessThanOrEqual(maximumPx);
}

function expectCssSizeAtLeast(size: string, minimumPx: number) {
  expect(cssSizeToPx(size)).toBeGreaterThanOrEqual(minimumPx);
}

function expectCssPaddingWithinRange(padding: string, blockPx: [number, number], inlinePx: [number, number]) {
  const [blockSize, inlineSize] = padding.split(/\s+/);

  expectCssSizeInRange(blockSize, blockPx[0], blockPx[1]);
  expectCssSizeInRange(inlineSize ?? blockSize, inlinePx[0], inlinePx[1]);
}

describe("BoardList", () => {
  beforeEach(() => {
    ensureBoardListStylesheet();
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
      workspaces: [
        { id: "workspace-1", name: "Home", icon: null, position: 0 },
        { id: "workspace-2", name: "Research", icon: null, position: 1 },
      ],
      activeWorkspaceId,
      activeBoardId: null,
      activeBoardPerWorkspace: {},
      boards: [],
      boardListRefresh: { workspaceId: null, nonce: 0 },
      focus: "global",
      initialized: true,
      armedDeleteTarget: null,
      armedDeleteToken: null,
      deletePendingToken: null,
      deleteAnnouncement: null,
      deleteEligibility: { state: "allowed" },
    });
  });

  afterEach(() => {
    cleanup();
    removeBoardListStylesheet();
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

    expect(await findBoardSelectButton("Sketches")).toBeInTheDocument();
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

    expect(await findBoardSelectButton("Research")).toBeInTheDocument();
    expect(listBoardsMock).toHaveBeenCalledWith("workspace-2");
  });

  it("selects a board when it is clicked", async () => {
    listBoardsMock.mockResolvedValue([createBoardItem()]);
    const onBoardSelect = vi.fn();

    render(<BoardList onBoardSelect={onBoardSelect} />);

    const boardButton = await findBoardSelectButton("Sketches");
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

    expect(await findBoardSelectButton("Board 1")).toBeInTheDocument();
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

    const boardButton = await findBoardSelectButton("Sketches");
    const boardItem = boardButton.closest("li");

    expect(boardItem).not.toBeNull();

    fireEvent.mouseEnter(boardItem!);
    const deleteButton = getBoardDeleteButton(boardItem!, "Sketches");
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

    await findBoardSelectButton("Sketches");
    fireEvent.click(screen.getByRole("button", { name: "Create board" }));

    act(() => {
      useAppStore.setState({ activeWorkspaceId: "workspace-2" });
    });

    expect(await findBoardSelectButton("Research")).toBeInTheDocument();

    await act(async () => {
      resolveCreateBoard?.("board-2");
      await createBoardPromise;
    });

    await waitFor(() => {
      expect(useAppStore.getState().activeBoardId).toBeNull();
    });
    expect(getBoardSelectButton(getBoardRow("Research"))).toBeInTheDocument();
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

    await findBoardSelectButton("Sketches");
    fireEvent.click(screen.getByRole("button", { name: "Create board" }));

    act(() => {
      useAppStore.setState({ activeWorkspaceId: "workspace-2" });
    });

    await act(async () => {
      resolveCreateBoard?.("board-2");
      await createBoardPromise;
    });

    expect(createBoardMock).toHaveBeenCalledWith("Board 2", activeWorkspaceId);
    expect(await findBoardSelectButton("Board 2")).toBeInTheDocument();
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

    expect(await findBoardSelectButton("Notes")).toBeInTheDocument();
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
    expect(await findBoardSelectButton("Board 1")).toBeInTheDocument();
  });

  it("renames a board inline and reloads the list", async () => {
    listBoardsMock
      .mockResolvedValueOnce([createBoardItem()])
      .mockResolvedValueOnce([createBoardItem({ name: "Updated board" })]);
    renameBoardMock.mockResolvedValue(undefined);

    render(<BoardList />);

    const boardButton = await findBoardSelectButton("Sketches");
    fireEvent.click(
      within(boardButton.parentElement as HTMLElement).getByRole("button", { name: "Rename" }),
    );

    const input = screen.getByRole("textbox", { name: "Board name" });
    fireEvent.change(input, { target: { value: "Updated board" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(renameBoardMock).toHaveBeenCalledWith("board-1", "Updated board");
    expect(await findBoardSelectButton("Updated board")).toBeInTheDocument();
  });

  it("keeps rename mode active when the submitted name is whitespace-only", async () => {
    listBoardsMock.mockResolvedValue([createBoardItem()]);
    renameBoardMock.mockResolvedValue(undefined);

    render(<BoardList />);

    const boardButton = await findBoardSelectButton("Sketches");
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

    const boardButton = await findBoardSelectButton("Sketches");
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

    const boardButton = await findBoardSelectButton("Sketches");
    const boardItem = boardButton.closest("li");

    expect(boardItem).not.toBeNull();

    fireEvent.click(within(boardItem as HTMLElement).getByRole("button", { name: "Rename" }));

    expect(screen.getByRole("textbox", { name: "Board name" })).toBeInTheDocument();

    const deleteButton = getBoardDeleteButton(boardItem as HTMLElement, "Sketches");
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(deleteBoardMock).toHaveBeenCalledWith("board-1");
    });
    expect(screen.queryByRole("textbox", { name: "Board name" })).not.toBeInTheDocument();
  });

  it("keeps rename controls compact without overlapping the action rail", async () => {
    listBoardsMock.mockResolvedValue([createBoardItem()]);

    render(<BoardList />);

    const boardButton = await findBoardSelectButton("Sketches");
    const row = boardButton.closest("li") as HTMLElement;

    fireEvent.click(within(row).getByRole("button", { name: "Rename" }));

    const editingRow = screen.getByRole("textbox", { name: "Board name" }).closest("li");
    const form = editingRow?.querySelector(".board-list__rename-form");
    const actions = editingRow?.querySelector(".board-list__item-actions");

    expect(editingRow).toHaveClass("board-list__item--editing");
    expect(form).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(within(actions as HTMLElement).queryByRole("button", { name: "Rename" })).toBeNull();
    expect(getBoardDeleteButton(actions as HTMLElement, "Sketches")).toBeInTheDocument();
    expect(
      getRenderedCssRule(".board-list__item--editing .board-list__item-actions").getPropertyValue(
        "grid-row",
      ),
    ).toBe("2");
    expect(
      getRenderedCssRule(".board-list__item--editing .board-list__item-meta").getPropertyValue(
        "display",
      ),
    ).toBe("none");
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

    const boardButton = await findBoardSelectButton("Sketches");
    const deleteButton = getBoardDeleteButton(boardButton.parentElement as HTMLElement, "Sketches");
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    expect(deleteBoardMock).toHaveBeenCalledWith("board-1");
    expect(await findBoardSelectButton("Notes")).toBeInTheDocument();
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

    const boardButton = await findBoardSelectButton("Sketches");
    const deleteButton = getBoardDeleteButton(boardButton.parentElement as HTMLElement, "Sketches");

    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    expect(deleteBoardMock).toHaveBeenCalledWith("board-1");
    expect(
      getBoardDeleteButton(boardButton.parentElement as HTMLElement, "Sketches", "Deleting"),
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

    const boardButton = await findBoardSelectButton("Sketches");
    const deleteButton = getBoardDeleteButton(boardButton.parentElement as HTMLElement, "Sketches");
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

  it("uses named two-stage delete labels and requires deliberate re-arm after success", async () => {
    listBoardsMock
      .mockResolvedValueOnce([createBoardItem({ name: "Day 2" })])
      .mockResolvedValueOnce([]);
    deleteBoardMock.mockResolvedValue(undefined);

    render(<BoardList />);

    const row = await waitFor(() => getBoardRow("Day 2"));
    const deleteButton = getBoardDeleteButton(row, "Day 2");

    expect(deleteButton).toHaveTextContent("Delete");

    fireEvent.click(deleteButton, { detail: 1 });

    expect(getBoardDeleteButton(row, "Day 2", "Confirm delete")).toHaveTextContent("Delete?");
    expect(deleteBoardMock).not.toHaveBeenCalled();

    fireEvent.click(getBoardDeleteButton(row, "Day 2", "Confirm delete"), { detail: 1 });

    await waitFor(() => {
      expect(deleteBoardMock).toHaveBeenCalledWith("board-1");
    });
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();
    expect(await screen.findByText("No boards yet.")).toBeInTheDocument();
  });

  it("ignores rapid double-click and repeat-key confirmation until a deliberate activation", async () => {
    listBoardsMock.mockResolvedValue([createBoardItem({ name: "Day 2" })]);
    deleteBoardMock.mockResolvedValue(undefined);

    render(<BoardList />);

    const row = await waitFor(() => getBoardRow("Day 2"));
    const deleteButton = getBoardDeleteButton(row, "Day 2");

    fireEvent.click(deleteButton, { detail: 1 });
    fireEvent.click(deleteButton, { detail: 2 });
    fireEvent.keyDown(deleteButton, { key: "Enter", repeat: true, bubbles: true });

    expect(deleteBoardMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().armedDeleteTarget).toEqual({
      kind: "board",
      id: "board-1",
      workspaceId: activeWorkspaceId,
      label: "Day 2",
    });

    fireEvent.keyDown(deleteButton, { key: "Enter", repeat: false, bubbles: true });

    await waitFor(() => {
      expect(deleteBoardMock).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps duplicate confirmations no-op while a board delete is pending", async () => {
    const pendingDelete = createDeferred();

    listBoardsMock.mockResolvedValue([createBoardItem()]);
    deleteBoardMock.mockReturnValue(pendingDelete.promise);

    render(<BoardList />);

    const row = await waitFor(() => getBoardRow("Sketches"));
    const deleteButton = getBoardDeleteButton(row, "Sketches");

    fireEvent.click(deleteButton, { detail: 1 });
    fireEvent.click(deleteButton, { detail: 1 });
    fireEvent.click(deleteButton, { detail: 1 });
    fireEvent.keyDown(deleteButton, { key: "Enter", bubbles: true });

    expect(deleteBoardMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingDelete.resolve();
      await pendingDelete.promise;
    });
  });

  it("does not select an inactive board when arming or confirming its delete", async () => {
    const onBoardSelect = vi.fn();

    useAppStore.setState({
      activeBoardId: "board-1",
      activeBoardPerWorkspace: {
        [activeWorkspaceId]: "board-1",
      },
    });
    listBoardsMock
      .mockResolvedValueOnce([
        createBoardItem({ id: "board-1", name: "Sketches" }),
        createBoardItem({ id: "board-2", name: "Day 2", position: 1 }),
      ])
      .mockResolvedValueOnce([createBoardItem({ id: "board-1", name: "Sketches" })]);
    deleteBoardMock.mockResolvedValue(undefined);

    render(<BoardList onBoardSelect={onBoardSelect} />);

    const inactiveRow = await waitFor(() => getBoardRow("Day 2"));
    const deleteButton = getBoardDeleteButton(inactiveRow, "Day 2");

    fireEvent.click(deleteButton, { detail: 1 });

    expect(useAppStore.getState().activeBoardPerWorkspace[activeWorkspaceId]).toBe("board-1");
    expect(onBoardSelect).not.toHaveBeenCalled();
    expect(useAppStore.getState().isDeleteArmed({
      kind: "board",
      id: "board-2",
      workspaceId: activeWorkspaceId,
      label: "Day 2",
    })).toBe(true);

    fireEvent.click(deleteButton, { detail: 1 });

    await waitFor(() => {
      expect(deleteBoardMock).toHaveBeenCalledWith("board-2");
    });
    expect(useAppStore.getState().activeBoardPerWorkspace[activeWorkspaceId]).toBe("board-1");
    expect(onBoardSelect).not.toHaveBeenCalled();
  });

  it("cancels armed board delete on selection, create, rename start, workspace switch, Escape, timeout, and unmount", async () => {
    listBoardsMock.mockResolvedValue([
      createBoardItem({ id: "board-1", name: "Sketches" }),
      createBoardItem({ id: "board-2", name: "Day 2", position: 1 }),
    ]);
    createBoardMock.mockReturnValue(createDeferred<string>().promise);

    const { unmount } = render(<BoardList />);

    await findBoardSelectButton("Sketches");

    const armDelete = (boardName = "Day 2") => {
      const row = getBoardRow(boardName);
      const deleteButton = getBoardDeleteButton(row, boardName);
      fireEvent.click(deleteButton, { detail: 1 });
      expect(useAppStore.getState().armedDeleteTarget).toEqual(
        expect.objectContaining({ kind: "board" }),
      );
      return { row, deleteButton };
    };

    armDelete();
    fireEvent.click(getBoardSelectButton(getBoardRow("Sketches")));
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();

    armDelete();
    fireEvent.click(screen.getByRole("button", { name: "Create board" }));
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();

    armDelete();
    fireEvent.click(within(getBoardRow("Sketches")).getByRole("button", { name: "Rename" }));
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    armDelete();
    act(() => {
      useAppStore.getState().setActiveWorkspace("workspace-2");
    });
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();
    act(() => {
      useAppStore.setState({ activeWorkspaceId });
    });

    await findBoardSelectButton("Day 2");
    const { deleteButton } = armDelete();
    fireEvent.keyDown(window, { key: "Escape", bubbles: true });
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();

    vi.useFakeTimers();
    fireEvent.click(deleteButton, { detail: 1 });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();
    vi.useRealTimers();

    fireEvent.click(deleteButton, { detail: 1 });
    unmount();
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();
  });

  it("cancels armed board delete when a workspace keyboard shortcut switches workspaces", async () => {
    listBoardsMock.mockImplementation(async (workspaceId?: string | null) =>
      workspaceId === "workspace-2"
        ? [
            createBoardItem({
              id: "board-9",
              name: "Research",
              workspace_id: "workspace-2",
            }),
          ]
        : [
            createBoardItem({ id: "board-1", name: "Sketches" }),
            createBoardItem({ id: "board-2", name: "Day 2", position: 1 }),
          ],
    );

    render(<BoardListWithKeyboardShortcuts />);

    const row = await waitFor(() => getBoardRow("Day 2"));
    fireEvent.click(getBoardDeleteButton(row, "Day 2"), { detail: 1 });
    expect(useAppStore.getState().armedDeleteTarget).toEqual(
      expect.objectContaining({ kind: "board", id: "board-2" }),
    );

    const event = new KeyboardEvent("keydown", {
      key: "]",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-2");
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();
    expect(await findBoardSelectButton("Research")).toBeInTheDocument();
  });

  it("keeps board actions from propagating into row selection", async () => {
    const onBoardSelect = vi.fn();

    useAppStore.setState({
      activeBoardId: "board-1",
      activeBoardPerWorkspace: {
        [activeWorkspaceId]: "board-1",
      },
    });
    listBoardsMock.mockResolvedValue([
      createBoardItem({ id: "board-1", name: "Sketches" }),
      createBoardItem({ id: "board-2", name: "Day 2", position: 1 }),
    ]);

    render(<BoardList onBoardSelect={onBoardSelect} />);

    const inactiveRow = await waitFor(() => getBoardRow("Day 2"));

    fireEvent.click(within(inactiveRow).getByRole("button", { name: "Rename" }));

    expect(onBoardSelect).not.toHaveBeenCalled();
    expect(useAppStore.getState().activeBoardId).toBe("board-1");
  });

  it("requires a fresh arm after successful, failed, and workspace-switched no-op delete attempts settle", async () => {
    const deleteError = new Error("delete failed");
    const workspaceSwitchBoards = createDeferred<
      ReturnType<typeof createBoardItem>[]
    >();

    listBoardsMock.mockImplementation(async (workspaceId?: string | null) =>
      workspaceId === "workspace-2"
        ? workspaceSwitchBoards.promise
        : [createBoardItem()],
    );
    deleteBoardMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(deleteError)
      .mockResolvedValueOnce(undefined);

    render(<BoardList />);

    const row = await waitFor(() => getBoardRow("Sketches"));
    const deleteButton = getBoardDeleteButton(row, "Sketches");

    fireEvent.click(deleteButton, { detail: 1 });
    fireEvent.click(deleteButton, { detail: 1 });

    await waitFor(() => {
      expect(deleteBoardMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(useAppStore.getState().armedDeleteTarget).toBeNull();
    });

    fireEvent.click(deleteButton, { detail: 1 });
    expect(deleteBoardMock).toHaveBeenCalledTimes(1);
    fireEvent.click(deleteButton, { detail: 1 });

    await waitFor(() => {
      expect(deleteBoardMock).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(useAppStore.getState().armedDeleteTarget).toBeNull();
    });

    act(() => {
      useAppStore.getState().setActiveWorkspace("workspace-2");
    });

    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-2");
    expect(getBoardDeleteButton(row, "Sketches")).toBeInTheDocument();
    fireEvent.click(deleteButton, { detail: 1 });
    expect(deleteBoardMock).toHaveBeenCalledTimes(2);
    fireEvent.click(deleteButton, { detail: 1 });

    await waitFor(() => {
      expect(useAppStore.getState().armedDeleteTarget).toBeNull();
    });
    expect(deleteBoardMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      workspaceSwitchBoards.resolve([
        createBoardItem({
          id: "board-9",
          name: "Research",
          workspace_id: "workspace-2",
        }),
      ]);
      await workspaceSwitchBoards.promise;
    });
    expect(await findBoardSelectButton("Research")).toBeInTheDocument();

    act(() => {
      useAppStore.getState().setActiveWorkspace(activeWorkspaceId);
    });

    const refreshedRow = await waitFor(() => getBoardRow("Sketches"));
    const refreshedDeleteButton = getBoardDeleteButton(refreshedRow, "Sketches");

    fireEvent.click(refreshedDeleteButton, { detail: 1 });
    expect(deleteBoardMock).toHaveBeenCalledTimes(2);
    fireEvent.click(refreshedDeleteButton, { detail: 1 });

    await waitFor(() => {
      expect(deleteBoardMock).toHaveBeenCalledTimes(3);
    });
  });

  it("renders compact board rows with reachable action controls", async () => {
    listBoardsMock.mockResolvedValue([
      createBoardItem({ name: "A very long board title that should truncate neatly" }),
    ]);

    render(<BoardList />);

    const row = await waitFor(() => getBoardRow("A very long board title"));
    const selectionButton = getBoardSelectButton(row);
    const actions = row.querySelector(".board-list__item-actions");
    const rowRule = getRenderedCssRule(".board-list__item");
    const focusWithinRule = getRenderedCssRule(".board-list__item:focus-within");
    const actionRule = getRenderedCssRule(".board-list__item-actions");
    const nameRule = getRenderedCssRule(".board-list__item-name");
    const itemButtonRule = getRenderedCssRule(".board-list__item-button");
    const metaRule = getRenderedCssRule(".board-list__item-meta");
    const activeRule = getRenderedCssRule(".board-list__item--active");
    const coarseRowRule = getRenderedCssRule(".board-list__item", "(pointer: coarse)");
    const coarseActionRule = getRenderedCssRule(
      ".board-list__item-actions",
      "(pointer: coarse)",
    );
    const coarseActionButtonRule = getRenderedCssRule(
      ".board-list__action-button",
      "(pointer: coarse)",
    );

    expect(row).toHaveClass("board-list__item");
    expect(selectionButton).toHaveClass("board-list__item-button");
    expect(actions).toHaveAttribute("data-reachable", "always");
    expect(within(actions as HTMLElement).getByRole("button", { name: "Rename" })).toBeVisible();
    expect(getBoardDeleteButton(actions as HTMLElement, "A very long board title that should truncate neatly")).toBeVisible();
    expect(selectionButton).not.toContainElement(actions as HTMLElement);
    expect(selectionButton).not.toHaveAttribute("tabindex", "-1");
    expect(actions).not.toHaveAttribute("aria-hidden", "true");
    expect(actionRule.getPropertyValue("visibility")).not.toBe("hidden");
    expect(actionRule.getPropertyValue("opacity")).not.toBe("0");
    expectCssSizeInRange(rowRule.getPropertyValue("min-height"), 44, 56);
    expectCssSizeInRange(rowRule.getPropertyValue("max-height"), 44, 56);
    expectCssSizeInRange(rowRule.getPropertyValue("row-gap"), 4, 6);
    expectCssPaddingWithinRange(rowRule.getPropertyValue("padding"), [6, 8], [6, 8]);
    expectCssSizeInRange(actionRule.getPropertyValue("gap"), 4, 6);
    expect(nameRule.getPropertyValue("overflow")).toBe("hidden");
    expect(nameRule.getPropertyValue("text-overflow")).toBe("ellipsis");
    expect(nameRule.getPropertyValue("white-space")).toBe("nowrap");
    expect(metaRule.getPropertyValue("color")).not.toBe("");
    expect(metaRule.getPropertyValue("color")).not.toBe(itemButtonRule.getPropertyValue("color"));
    expect(activeRule.getPropertyValue("box-shadow")).not.toBe("");
    selectionButton.focus();
    expect(selectionButton).toHaveFocus();
    expect(row).toContainElement(document.activeElement as HTMLElement);
    expect(focusWithinRule.getPropertyValue("border-color")).not.toBe("");
    expectCssSizeInRange(coarseRowRule.getPropertyValue("min-height"), 48, 56);
    expect(coarseRowRule.getPropertyValue("max-height")).toBe("none");
    expect(coarseActionRule.getPropertyValue("visibility")).toBe("visible");
    expectCssSizeAtLeast(coarseActionButtonRule.getPropertyValue("height"), 44);
    expectCssSizeAtLeast(coarseActionButtonRule.getPropertyValue("min-width"), 44);
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

    await findBoardSelectButton("Sketches");

    act(() => {
      useAppStore.getState().setActiveWorkspace("workspace-2");
    });

    expect(await findBoardSelectButton("Research")).toBeInTheDocument();

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

    await findBoardSelectButton("Sketches");

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

    await findBoardSelectButton("Sketches");

    act(() => {
      useAppStore.getState().requestBoardListRefresh(activeWorkspaceId);
    });

    expect(await findBoardSelectButton("New Board")).toBeInTheDocument();
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

    await findBoardSelectButton("Sketches");

    act(() => {
      useAppStore.getState().requestBoardListRefresh(activeWorkspaceId);
    });

    expect(await findBoardSelectButton("New Board")).toBeInTheDocument();
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

    await findBoardSelectButton("Now");
    expect(screen.getByText("just now")).toBeInTheDocument();
    expect(screen.getByText("5m ago")).toBeInTheDocument();
    expect(screen.getByText("2h ago")).toBeInTheDocument();
    expect(screen.getByText("3d ago")).toBeInTheDocument();
  });
});
