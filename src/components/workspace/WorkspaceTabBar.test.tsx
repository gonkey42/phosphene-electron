import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSharedErrors, getSharedErrors } from "../../hooks/shared-error-store";

const {
  createBoardMock,
  createWorkspaceMock,
  deleteWorkspaceMock,
  mapWorkspaceMock,
  listWorkspacesMock,
  renameWorkspaceMock,
  useWorkspacePublishMock,
} = vi.hoisted(() => ({
  createBoardMock: vi.fn(),
  createWorkspaceMock: vi.fn(),
  deleteWorkspaceMock: vi.fn(),
  mapWorkspaceMock: vi.fn((item) => ({
    id: item.id,
    name: item.name,
    icon: item.icon,
    position: item.position,
  })),
  listWorkspacesMock: vi.fn(),
  renameWorkspaceMock: vi.fn(),
  useWorkspacePublishMock: vi.fn(),
}));

vi.mock("../../lib/board-operations", () => ({
  createBoard: createBoardMock,
}));

vi.mock("../../lib/workspace-operations", () => ({
  createWorkspace: createWorkspaceMock,
  deleteWorkspace: deleteWorkspaceMock,
  mapWorkspace: mapWorkspaceMock,
  listWorkspaces: listWorkspacesMock,
  renameWorkspace: renameWorkspaceMock,
}));

vi.mock("../../hooks/use-workspace-publish", () => ({
  useWorkspacePublish: useWorkspacePublishMock,
}));

import { useAppStore } from "../../stores/app-store";
import type {
  WorkspacePublishPhase,
  WorkspacePublishStatus,
} from "../../hooks/use-workspace-publish";
import { useKeyboardShortcuts } from "../../hooks/use-keyboard-shortcuts";

import { WorkspaceTabBar } from "./WorkspaceTabBar";

function WorkspaceTabBarWithKeyboardShortcuts() {
  useKeyboardShortcuts();

  return <WorkspaceTabBar />;
}

function createWorkspaceItem(
  overrides: Partial<{
    id: string;
    name: string;
    icon: string | null;
    position: number;
  }> = {},
) {
  return {
    id: "workspace-1",
    name: "Home",
    icon: "🏠",
    position: 0,
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

let workspacePublishStates = new Map<string, ReturnType<typeof createWorkspacePublishHookState>>();

function createWorkspacePublishHookState(
  overrides: Partial<{
    phase: WorkspacePublishPhase;
    status: WorkspacePublishStatus;
    hasPublishedSnapshot: boolean;
    isBusy: boolean;
    errorMessage: string | null;
  }> = {},
) {
  const phase = overrides.phase ?? "loaded";
  const status = overrides.status ?? "not-online";
  const hasPublishedSnapshot = overrides.hasPublishedSnapshot ?? false;
  const errorMessage = overrides.errorMessage ?? null;
  const isBusy = overrides.isBusy ?? false;
  const viewState = {
    phase,
    status,
    hasPublishedSnapshot,
    errorMessage,
  };

  return {
    phase,
    status,
    hasPublishedSnapshot,
    isBusy,
    errorMessage,
    viewState,
    deleteEligibility: getMockWorkspacePublishDeleteEligibility(viewState, isBusy),
    publish: vi.fn(async () => undefined),
    unpublish: vi.fn(async () => undefined),
  };
}

function getMockWorkspacePublishDeleteEligibility(
  viewState: {
    phase: WorkspacePublishPhase;
    status: WorkspacePublishStatus;
    hasPublishedSnapshot: boolean;
  },
  isBusy: boolean,
) {
  if (isBusy) {
    return { state: "unknown", reason: "Workspace publish operation is in progress." };
  }

  if (viewState.phase === "loading") {
    return { state: "unknown", reason: "Workspace publish state is still loading." };
  }

  if (viewState.phase === "refreshing") {
    return { state: "unknown", reason: "Workspace publish state is refreshing." };
  }

  if (viewState.phase === "error") {
    return { state: "unknown", reason: "Workspace publish state could not be checked." };
  }

  if (
    viewState.status === "online" ||
    viewState.status === "changed-since-publish" ||
    (viewState.status === "publish-failed" && viewState.hasPublishedSnapshot)
  ) {
    return {
      state: "blocked",
      reason: "Workspace is published to the web; unpublish it before deleting.",
    };
  }

  return { state: "allowed" };
}

function setWorkspacePublishState(
  workspaceId: string,
  overrides: Parameters<typeof createWorkspacePublishHookState>[0],
) {
  workspacePublishStates.set(workspaceId, createWorkspacePublishHookState(overrides));
}

function setPlatform(platform: string) {
  Object.defineProperty(window.navigator, "platform", {
    configurable: true,
    value: platform,
  });
}

describe("WorkspaceTabBar", () => {
  beforeEach(() => {
    clearSharedErrors();
    vi.useRealTimers();
    createBoardMock.mockReset();
    createWorkspaceMock.mockReset();
    deleteWorkspaceMock.mockReset();
    listWorkspacesMock.mockReset();
    renameWorkspaceMock.mockReset();
    useWorkspacePublishMock.mockReset();
    workspacePublishStates = new Map();
    useWorkspacePublishMock.mockImplementation((workspaceId: string) => {
      return workspacePublishStates.get(workspaceId) ?? createWorkspacePublishHookState();
    });
    useAppStore.setState({
      workspaces: [],
      activeWorkspaceId: null,
      initialized: false,
      focus: "global",
      armedDeleteTarget: null,
      armedDeleteToken: null,
      deletePendingToken: null,
      deleteAnnouncement: null,
      deleteEligibility: { state: "allowed" },
    });
    setPlatform("Linux x86_64");
  });

  afterEach(() => {
    cleanup();
    clearSharedErrors();
    vi.restoreAllMocks();
  });

  it("renders tabs, highlights the active workspace, and switches on click", async () => {
    listWorkspacesMock.mockResolvedValue([
      createWorkspaceItem(),
      createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
    ]);

    render(<WorkspaceTabBar />);

    const homeButton = await screen.findByRole("button", { name: "Home" });
    const projectsButton = screen.getByRole("button", { name: "Projects" });

    expect(homeButton).toHaveAttribute("aria-current", "page");
    expect(homeButton.closest(".workspace-tab-bar__tab-item")).toHaveClass(
      "workspace-tab-bar__tab-item--active",
    );

    fireEvent.click(projectsButton);

    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-2");
    expect(projectsButton).toHaveAttribute("aria-current", "page");
    expect(projectsButton.closest(".workspace-tab-bar__tab-item")).toHaveClass(
      "workspace-tab-bar__tab-item--active",
    );
    expect(homeButton).not.toHaveAttribute("aria-current");
  });

  it("renders text-only workspace tabs with the create button immediately after the last tab", async () => {
    listWorkspacesMock.mockResolvedValue([
      createWorkspaceItem(),
      createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
    ]);

    const { container } = render(<WorkspaceTabBar />);

    expect(await screen.findByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Projects" })).toBeInTheDocument();
    expect(container.querySelectorAll(".workspace-tab-bar__icon")).toHaveLength(0);

    const tabList = container.querySelector(".workspace-tab-bar__tabs");
    expect(tabList).not.toBeNull();
    expect(tabList?.children).toHaveLength(3);
    expect(tabList?.lastElementChild).toContainElement(screen.getByRole("button", { name: "Create workspace" }));
  });

  it("does not render a theme mode selector in the tab bar", async () => {
    listWorkspacesMock.mockResolvedValue([createWorkspaceItem()]);

    render(<WorkspaceTabBar />);

    expect(await screen.findByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /system|light|dark/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/theme/i)).not.toBeInTheDocument();
  });

  it("renders publish controls for each workspace tab", async () => {
    listWorkspacesMock.mockResolvedValue([
      createWorkspaceItem(),
      createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
    ]);

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Home" });

    expect(screen.getByRole("button", { name: "Publish Home to Web" })).toHaveTextContent("↑");
    expect(screen.getByRole("button", { name: "Publish Projects to Web" })).toHaveTextContent("↑");
  });

  it("keeps compact tab controls out of the draggable app region", async () => {
    listWorkspacesMock.mockResolvedValue([
      createWorkspaceItem(),
      createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
    ]);

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Home" });

    expect(screen.getByRole("button", { name: "Publish Home to Web" })).toHaveClass(
      "workspace-publish-controls__button",
    );
    expect(screen.getByRole("button", { name: "Delete Home" })).toHaveClass(
      "workspace-tab-bar__close-button",
    );
    expect(screen.getByRole("button", { name: "Create workspace" })).toHaveClass(
      "workspace-tab-bar__create-button",
    );

    const workspaceTabBarCss = readFileSync(
      "src/components/workspace/WorkspaceTabBar.css",
      "utf8",
    );
    const publishControlsCss = readFileSync(
      "src/components/publish/WorkspacePublishControls.css",
      "utf8",
    );

    expect(workspaceTabBarCss).toContain("-webkit-app-region: no-drag;");
    expect(workspaceTabBarCss).toMatch(
      /\.workspace-tab-bar__close-button[\s\S]*-webkit-app-region: no-drag;/,
    );
    expect(workspaceTabBarCss).toMatch(
      /\.workspace-tab-bar__create-button[\s\S]*-webkit-app-region: no-drag;/,
    );
    expect(publishControlsCss).toMatch(
      /\.workspace-publish-controls[\s\S]*-webkit-app-region: no-drag;/,
    );
    expect(publishControlsCss).toMatch(
      /\.workspace-publish-controls__status,[\s\S]*\.workspace-publish-controls__button[\s\S]*-webkit-app-region: no-drag;/,
    );
  });

  it("hides publish controls while a workspace is being renamed", async () => {
    listWorkspacesMock.mockResolvedValue([createWorkspaceItem()]);

    render(<WorkspaceTabBar />);

    fireEvent.doubleClick(await screen.findByRole("button", { name: "Home" }));

    expect(screen.getByRole("textbox", { name: "Workspace name" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish Home to Web" })).not.toBeInTheDocument();
  });

  it("shows platform-aware shortcuts for the first nine workspaces", async () => {
    setPlatform("MacIntel");
    listWorkspacesMock.mockResolvedValue([
      createWorkspaceItem(),
      createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
    ]);

    render(<WorkspaceTabBar />);

    expect(await screen.findByText("⌘1")).toBeInTheDocument();
    expect(screen.getByText("⌘2")).toBeInTheDocument();

    cleanup();
    listWorkspacesMock.mockReset();
    useAppStore.setState({ workspaces: [], activeWorkspaceId: null });
    setPlatform("Windows NT 10.0");

    listWorkspacesMock.mockResolvedValue([
      createWorkspaceItem(),
      createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
    ]);

    render(<WorkspaceTabBar />);

    expect(await screen.findByText("Ctrl+1")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+2")).toBeInTheDocument();
  });

  it("creates a workspace and reloads the list", async () => {
    listWorkspacesMock
      .mockResolvedValueOnce([
        createWorkspaceItem(),
        createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
      ])
      .mockResolvedValueOnce([
        createWorkspaceItem(),
        createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
        createWorkspaceItem({ id: "workspace-3", name: "Workspace 3", icon: null, position: 2 }),
      ]);
    createWorkspaceMock.mockResolvedValue("workspace-3");

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Home" });
    fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));

    await waitFor(() => {
      expect(createWorkspaceMock).toHaveBeenCalledWith("Workspace 3");
    });
    expect(await screen.findByRole("button", { name: "Workspace 3" })).toBeInTheDocument();
    expect(mapWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "workspace-3",
        name: "Workspace 3",
        icon: null,
      }),
    );
    expect(listWorkspacesMock).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-3");
  });

  it("does not refetch the initial empty workspace load on rerender", async () => {
    listWorkspacesMock.mockResolvedValue([]);

    const { rerender } = render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Create workspace" });

    rerender(<WorkspaceTabBar />);

    expect(listWorkspacesMock).toHaveBeenCalledTimes(1);
  });

  it("skips the initial load when startup has already completed with an empty list", async () => {
    useAppStore.setState({
      workspaces: [],
      activeWorkspaceId: null,
      initialized: true,
    });

    render(<WorkspaceTabBar />);

    expect(await screen.findByRole("button", { name: "Create workspace" })).toBeInTheDocument();
    expect(listWorkspacesMock).not.toHaveBeenCalled();
  });

  it("does not refetch the initial workspace load after a failed attempt on rerender", async () => {
    listWorkspacesMock.mockRejectedValue(new Error("db failed"));

    const { rerender } = render(<WorkspaceTabBar />);

    await waitFor(() => {
      expect(getSharedErrors()).toEqual([
        expect.objectContaining({
          message: "Failed to load workspaces",
          source: "WorkspaceTabBar",
          channel: "workspace-tab-bar:load",
        }),
      ]);
    });

    rerender(<WorkspaceTabBar />);

    expect(listWorkspacesMock).toHaveBeenCalledTimes(1);
  });

  it("does not sync workspaces when the initial load resolves after unmount", async () => {
    let resolveListWorkspaces: ((items: Array<ReturnType<typeof createWorkspaceItem>>) => void) | undefined;
    const listWorkspacesPromise = new Promise<Array<ReturnType<typeof createWorkspaceItem>>>((resolve) => {
      resolveListWorkspaces = resolve;
    });
    listWorkspacesMock.mockReturnValue(listWorkspacesPromise);

    const { unmount } = render(<WorkspaceTabBar />);

    expect(listWorkspacesMock).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      resolveListWorkspaces?.([
        createWorkspaceItem(),
        createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
      ]);
      await listWorkspacesPromise;
      await Promise.resolve();
    });

    expect(useAppStore.getState().workspaces).toEqual([]);
    expect(useAppStore.getState().activeWorkspaceId).toBeNull();
  });

  it("does not report or clear the initial load when it rejects after unmount", async () => {
    let rejectListWorkspaces: ((error: Error) => void) | undefined;
    const listWorkspacesPromise = new Promise<Array<ReturnType<typeof createWorkspaceItem>>>(
      (_resolve, reject) => {
        rejectListWorkspaces = reject;
      },
    );
    listWorkspacesMock.mockReturnValue(listWorkspacesPromise);

    const { unmount } = render(<WorkspaceTabBar />);

    expect(listWorkspacesMock).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      rejectListWorkspaces?.(new Error("late failure"));
      try {
        await listWorkspacesPromise;
      } catch {
        // ignore expected rejection
      }
      await Promise.resolve();
    });

    expect(useAppStore.getState().workspaces).toEqual([]);
    expect(getSharedErrors()).toEqual([]);
  });

  it("keeps the created workspace visible and active when the follow-up reload fails", async () => {
    const reloadError = new Error("reload failed");

    listWorkspacesMock
      .mockResolvedValueOnce([
        createWorkspaceItem(),
        createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
      ])
      .mockRejectedValueOnce(reloadError);
    createWorkspaceMock.mockResolvedValue("workspace-3");

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Home" });
    fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));

    expect(await screen.findByRole("button", { name: "Workspace 3" })).toBeInTheDocument();

    await waitFor(() => {
      expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-3");
      expect(getSharedErrors()).toEqual([
        expect.objectContaining({
          message: "Failed to reload workspaces",
          source: "WorkspaceTabBar",
          error: reloadError,
          channel: "workspace-tab-bar:reload",
          retry: {
            label: "Retry",
            run: expect.any(Function),
          },
        }),
      ]);
    });
  });

  it("surfaces reload failures through the shared channel and clears them after retry succeeds", async () => {
    const reloadError = new Error("reload failed");

    listWorkspacesMock
      .mockResolvedValueOnce([
        createWorkspaceItem(),
        createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
      ])
      .mockRejectedValueOnce(reloadError)
      .mockResolvedValueOnce([
        createWorkspaceItem(),
        createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
        createWorkspaceItem({ id: "workspace-3", name: "Workspace 3", icon: null, position: 2 }),
      ]);
    createWorkspaceMock.mockResolvedValue("workspace-3");

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Home" });
    fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));

    expect(await screen.findByRole("button", { name: "Workspace 3" })).toBeInTheDocument();

    await waitFor(() => {
      expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-3");
      expect(getSharedErrors()).toEqual([
        expect.objectContaining({
          message: "Failed to reload workspaces",
          source: "WorkspaceTabBar",
          error: reloadError,
          channel: "workspace-tab-bar:reload",
          retry: {
            label: "Retry",
            run: expect.any(Function),
          },
        }),
      ]);
    });

    const [errorEntry] = getSharedErrors();
    await act(async () => {
      await errorEntry.retry?.run();
    });

    expect(getSharedErrors()).toEqual([]);
    expect(await screen.findByRole("button", { name: "Workspace 3" })).toBeInTheDocument();
  });

  it("supports inline rename with enter, escape, and blur", async () => {
    listWorkspacesMock
      .mockResolvedValueOnce([createWorkspaceItem()])
      .mockResolvedValueOnce([createWorkspaceItem({ name: "Renamed workspace" })])
      .mockResolvedValueOnce([createWorkspaceItem({ name: "Blurred workspace" })]);
    renameWorkspaceMock.mockResolvedValue(undefined);

    render(<WorkspaceTabBar />);

    const tabButton = await screen.findByRole("button", { name: "Home" });
    fireEvent.doubleClick(tabButton);

    const renameInput = screen.getByRole("textbox", { name: "Workspace name" });
    fireEvent.change(renameInput, { target: { value: "Renamed workspace" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    await waitFor(() => {
      expect(renameWorkspaceMock).toHaveBeenCalledWith("workspace-1", "Renamed workspace");
    });
    expect(await screen.findByRole("button", { name: "Renamed workspace" })).toBeInTheDocument();

    fireEvent.doubleClick(screen.getByRole("button", { name: "Renamed workspace" }));
    const escapedInput = screen.getByRole("textbox", { name: "Workspace name" });
    fireEvent.change(escapedInput, { target: { value: "Canceled workspace" } });
    fireEvent.keyDown(escapedInput, { key: "Escape" });

    expect(renameWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Renamed workspace" })).toBeInTheDocument();

    fireEvent.doubleClick(screen.getByRole("button", { name: "Renamed workspace" }));
    const blurredInput = screen.getByRole("textbox", { name: "Workspace name" });
    fireEvent.change(blurredInput, { target: { value: "Blurred workspace" } });
    fireEvent.blur(blurredInput);

    await waitFor(() => {
      expect(renameWorkspaceMock).toHaveBeenCalledWith("workspace-1", "Blurred workspace");
    });
    expect(await screen.findByRole("button", { name: "Blurred workspace" })).toBeInTheDocument();
  });

  it("cancels inline rename when the submitted name is empty or whitespace-only", async () => {
    listWorkspacesMock.mockResolvedValue([createWorkspaceItem()]);

    render(<WorkspaceTabBar />);

    const tabButton = await screen.findByRole("button", { name: "Home" });
    fireEvent.doubleClick(tabButton);

    const emptySubmitInput = screen.getByRole("textbox", { name: "Workspace name" });
    fireEvent.change(emptySubmitInput, { target: { value: "   " } });
    fireEvent.keyDown(emptySubmitInput, { key: "Enter" });

    expect(renameWorkspaceMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Workspace name" })).not.toBeInTheDocument();

    fireEvent.doubleClick(screen.getByRole("button", { name: "Home" }));

    const emptyBlurInput = screen.getByRole("textbox", { name: "Workspace name" });
    fireEvent.change(emptyBlurInput, { target: { value: "\t" } });
    fireEvent.blur(emptyBlurInput);

    expect(renameWorkspaceMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Workspace name" })).not.toBeInTheDocument();
  });

  it("deletes the active workspace and switches to the first remaining workspace", async () => {
    listWorkspacesMock
      .mockResolvedValueOnce([
        createWorkspaceItem(),
        createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
        createWorkspaceItem({ id: "workspace-3", name: "Archive", icon: "🗄️", position: 2 }),
      ])
      .mockResolvedValueOnce([
        createWorkspaceItem(),
        createWorkspaceItem({ id: "workspace-3", name: "Archive", icon: "🗄️", position: 1 }),
      ]);
    deleteWorkspaceMock.mockResolvedValue(true);

    useAppStore.setState({ activeWorkspaceId: "workspace-2" });

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Projects" });
    const deleteButton = screen.getByRole("button", { name: "Delete Projects" });
    expect(deleteButton).toHaveTextContent("x");
    fireEvent.click(deleteButton);
    expect(screen.getByRole("button", { name: "Confirm delete Projects" })).toHaveTextContent(
      "x?",
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete Projects" }));

    expect(deleteWorkspaceMock).toHaveBeenCalledWith("workspace-2");
    expect(await screen.findByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-1");
  });

  it("deletes an inactive workspace, refreshes, and preserves the active workspace", async () => {
    listWorkspacesMock
      .mockResolvedValueOnce([
        createWorkspaceItem(),
        createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
      ])
      .mockResolvedValueOnce([createWorkspaceItem()]);
    deleteWorkspaceMock.mockResolvedValue(true);

    useAppStore.setState({ activeWorkspaceId: "workspace-1" });

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Projects" });
    fireEvent.click(screen.getByRole("button", { name: "Delete Projects" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete Projects" }));

    await waitFor(() => {
      expect(deleteWorkspaceMock).toHaveBeenCalledWith("workspace-2");
      expect(listWorkspacesMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByRole("button", { name: "Projects" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-1");
  });

  it("does not confirm deletion from a rapid double-click", async () => {
    listWorkspacesMock.mockResolvedValue([
      createWorkspaceItem(),
      createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
    ]);
    deleteWorkspaceMock.mockResolvedValue(true);

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Projects" });
    const deleteButton = screen.getByRole("button", { name: "Delete Projects" });
    fireEvent.click(deleteButton, { detail: 1 });
    fireEvent.click(deleteButton, { detail: 2 });

    expect(deleteWorkspaceMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm delete Projects" })).toHaveTextContent("x?");
  });

  it("ignores duplicate confirmations while a workspace delete is pending", async () => {
    const pendingDelete = createDeferred<boolean>();

    listWorkspacesMock.mockResolvedValue([
      createWorkspaceItem(),
      createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
    ]);
    deleteWorkspaceMock.mockReturnValue(pendingDelete.promise);

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Projects" });
    const deleteButton = screen.getByRole("button", { name: "Delete Projects" });
    fireEvent.click(deleteButton);
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete Projects" }));
    const pendingButton = screen.getByRole("button", { name: "Deleting Projects" });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAccessibleDescription("Workspace delete is in progress.");
    fireEvent.click(pendingButton);
    fireEvent.keyDown(pendingButton, {
      key: "Enter",
    });

    expect(deleteWorkspaceMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingDelete.resolve(false);
      await pendingDelete.promise;
    });
  });

  it("clears armed state after deleteWorkspace returns false and requires re-arming", async () => {
    listWorkspacesMock.mockResolvedValue([
      createWorkspaceItem(),
      createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
    ]);
    deleteWorkspaceMock.mockResolvedValue(false);

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Projects" });
    fireEvent.click(screen.getByRole("button", { name: "Delete Projects" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete Projects" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Delete Projects" })).toHaveTextContent("x");
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete Projects" }));
    expect(deleteWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Confirm delete Projects" })).toHaveTextContent("x?");
  });

  it("clears armed state after deleteWorkspace rejects and requires re-arming", async () => {
    const deleteError = new Error("database unavailable");

    listWorkspacesMock.mockResolvedValue([
      createWorkspaceItem(),
      createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
    ]);
    deleteWorkspaceMock.mockRejectedValue(deleteError);

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Projects" });
    fireEvent.click(screen.getByRole("button", { name: "Delete Projects" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete Projects" }));

    await waitFor(() => {
      expect(getSharedErrors()).toEqual([
        expect.objectContaining({
          message: "Failed to delete workspace",
          source: "WorkspaceTabBar",
          error: deleteError,
          channel: "workspace-tab-bar:delete",
        }),
      ]);
    });
    expect(screen.getByRole("button", { name: "Delete Projects" })).toHaveTextContent("x");
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();
    expect(useAppStore.getState().deletePendingToken).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete Projects" }));

    expect(deleteWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Confirm delete Projects" })).toHaveTextContent("x?");
  });

  it("requires deliberate Enter or Space confirmation and ignores repeat keys", async () => {
    listWorkspacesMock.mockResolvedValue([
      createWorkspaceItem(),
      createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
    ]);
    deleteWorkspaceMock.mockResolvedValue(false);

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Projects" });
    const deleteButton = screen.getByRole("button", { name: "Delete Projects" });
    fireEvent.keyDown(deleteButton, { key: "Enter" });
    const confirmButton = screen.getByRole("button", { name: "Confirm delete Projects" });
    fireEvent.keyDown(confirmButton, { key: " ", repeat: true });
    expect(deleteWorkspaceMock).not.toHaveBeenCalled();

    fireEvent.keyDown(confirmButton, { key: " " });

    expect(deleteWorkspaceMock).toHaveBeenCalledTimes(1);
  });

  it("disables workspace delete while publish state is unknown", async () => {
    setWorkspacePublishState("workspace-2", { phase: "loading" });
    listWorkspacesMock.mockResolvedValue([
      createWorkspaceItem(),
      createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
    ]);
    deleteWorkspaceMock.mockResolvedValue(true);

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Projects" });
    const deleteButton = screen.getByRole("button", {
      name: "Delete Projects unavailable: Workspace publish state is still loading.",
    });
    expect(deleteButton).toBeDisabled();
    expect(deleteButton).toHaveTextContent("x");

    fireEvent.click(deleteButton);

    expect(deleteWorkspaceMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();
  });

  it("enables workspace delete after publish-state retry recovers to an allowed state", async () => {
    setWorkspacePublishState("workspace-2", {
      phase: "error",
      errorMessage: "State service unavailable",
    });
    listWorkspacesMock.mockResolvedValue([
      createWorkspaceItem(),
      createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
    ]);
    deleteWorkspaceMock.mockResolvedValue(false);

    const { rerender } = render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Projects" });
    expect(
      screen.getByRole("button", {
        name: "Delete Projects unavailable: Workspace publish state could not be checked.",
      }),
    ).toBeDisabled();

    setWorkspacePublishState("workspace-2", {
      phase: "loaded",
      status: "not-online",
      hasPublishedSnapshot: false,
      errorMessage: null,
    });
    rerender(<WorkspaceTabBar />);

    const deleteButton = screen.getByRole("button", { name: "Delete Projects" });
    expect(deleteButton).toBeEnabled();
    fireEvent.click(deleteButton);
    expect(screen.getByRole("button", { name: "Confirm delete Projects" })).toBeInTheDocument();
  });

  it("blocks workspace delete for backend-rejected published states", async () => {
    setWorkspacePublishState("workspace-2", {
      phase: "loaded",
      status: "online",
      hasPublishedSnapshot: true,
    });
    listWorkspacesMock.mockResolvedValue([
      createWorkspaceItem(),
      createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
    ]);
    deleteWorkspaceMock.mockResolvedValue(true);

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Projects" });
    const deleteButton = screen.getByRole("button", {
      name: "Delete Projects unavailable: Workspace is published to the web; unpublish it before deleting.",
    });
    expect(deleteButton).toBeDisabled();

    fireEvent.click(deleteButton);

    expect(deleteWorkspaceMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();
  });

  it("keeps delete enabled when a snapshot exists but the delete predicate allows deletion", async () => {
    setWorkspacePublishState("workspace-2", {
      phase: "loaded",
      status: "not-online",
      hasPublishedSnapshot: true,
    });
    listWorkspacesMock.mockResolvedValue([
      createWorkspaceItem(),
      createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
    ]);
    deleteWorkspaceMock.mockResolvedValue(false);

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Projects" });
    expect(screen.getByRole("button", { name: "Unpublish Projects" })).toHaveTextContent("↓");
    const deleteButton = screen.getByRole("button", { name: "Delete Projects" });
    expect(deleteButton).toBeEnabled();

    fireEvent.click(deleteButton);

    expect(screen.getByRole("button", { name: "Confirm delete Projects" })).toHaveTextContent("x?");
  });

  it("cancels an armed workspace delete when eligibility changes", async () => {
    setWorkspacePublishState("workspace-2", {
      phase: "loaded",
      status: "not-online",
    });
    listWorkspacesMock.mockResolvedValue([
      createWorkspaceItem(),
      createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
    ]);

    const { rerender } = render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Projects" });
    fireEvent.click(screen.getByRole("button", { name: "Delete Projects" }));
    expect(screen.getByRole("button", { name: "Confirm delete Projects" })).toBeInTheDocument();

    setWorkspacePublishState("workspace-2", {
      phase: "refreshing",
      status: "not-online",
    });
    rerender(<WorkspaceTabBar />);

    expect(
      screen.getByRole("button", {
        name: "Delete Projects unavailable: Workspace publish state is refreshing.",
      }),
    ).toBeDisabled();
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();
    expect(useAppStore.getState().deleteAnnouncement).toBe(
      "Delete canceled. Workspace publish state is refreshing.",
    );
  });

  it("cancels armed workspace deletes on selection, rename start, and create", async () => {
    listWorkspacesMock
      .mockResolvedValueOnce([
        createWorkspaceItem(),
        createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
        createWorkspaceItem({ id: "workspace-3", name: "Archive", icon: "🗄️", position: 2 }),
      ])
      .mockResolvedValueOnce([
        createWorkspaceItem(),
        createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
        createWorkspaceItem({ id: "workspace-3", name: "Archive", icon: "🗄️", position: 2 }),
        createWorkspaceItem({ id: "workspace-4", name: "Workspace 4", icon: null, position: 3 }),
      ]);
    createWorkspaceMock.mockResolvedValue("workspace-4");

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Archive" });
    fireEvent.click(screen.getByRole("button", { name: "Delete Archive" }));
    expect(screen.getByRole("button", { name: "Confirm delete Archive" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    expect(screen.getByRole("button", { name: "Delete Archive" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete Archive" }));
    fireEvent.doubleClick(screen.getByRole("button", { name: "Archive" }));
    expect(screen.getByRole("textbox", { name: "Workspace name" })).toBeInTheDocument();
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Workspace name" }), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Delete Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));

    await waitFor(() => {
      expect(createWorkspaceMock).toHaveBeenCalledWith("Workspace 4");
    });
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();
  });

  it("cancels armed workspace deletes before shortcut workspace switches", async () => {
    useAppStore.setState({
      initialized: true,
      workspaces: [
        createWorkspaceItem(),
        createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
        createWorkspaceItem({ id: "workspace-3", name: "Archive", icon: "🗄️", position: 2 }),
      ],
      activeWorkspaceId: "workspace-2",
      focus: "global",
    });

    render(<WorkspaceTabBarWithKeyboardShortcuts />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Archive" }));
    expect(screen.getByRole("button", { name: "Confirm delete Archive" })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "1",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-1");
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete Archive" }));
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "]",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-2");
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete Archive" }));
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "[",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-1");
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();
  });

  it("shows compact pending state while a workspace delete is in flight", async () => {
    const pendingDelete = createDeferred<boolean>();

    listWorkspacesMock
      .mockResolvedValueOnce([
        createWorkspaceItem(),
        createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
      ])
      .mockResolvedValueOnce([createWorkspaceItem()]);
    deleteWorkspaceMock.mockReturnValue(pendingDelete.promise);

    useAppStore.setState({ activeWorkspaceId: "workspace-2" });

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Projects" });
    const deleteButton = screen.getByRole("button", { name: "Delete Projects" });
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    const pendingButton = screen.getByRole("button", { name: "Deleting Projects" });
    expect(pendingButton).toHaveAttribute("aria-busy", "true");
    expect(pendingButton).toHaveTextContent("...");

    await act(async () => {
      pendingDelete.resolve(true);
      await pendingDelete.promise;
    });

    expect(await screen.findByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Projects" })).not.toBeInTheDocument();
  });

  it("removes a deleted workspace and falls back to a visible workspace when reload fails", async () => {
    const reloadError = new Error("reload failed");

    listWorkspacesMock
      .mockResolvedValueOnce([
        createWorkspaceItem(),
        createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
        createWorkspaceItem({ id: "workspace-3", name: "Archive", icon: "🗄️", position: 2 }),
      ])
      .mockRejectedValueOnce(reloadError);
    deleteWorkspaceMock.mockResolvedValue(true);

    useAppStore.setState({ activeWorkspaceId: "workspace-2" });

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Projects" });
    const deleteButton = screen.getByRole("button", { name: "Delete Projects" });
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(deleteWorkspaceMock).toHaveBeenCalledWith("workspace-2");
      expect(screen.queryByRole("button", { name: "Projects" })).not.toBeInTheDocument();
      expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-1");
      expect(getSharedErrors()).toEqual([
        expect.objectContaining({
          message: "Failed to reload workspaces",
          source: "WorkspaceTabBar",
          error: reloadError,
          channel: "workspace-tab-bar:reload",
          retry: {
            label: "Retry",
            run: expect.any(Function),
          },
        }),
      ]);
    });

    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("hides delete controls when there is only one workspace", async () => {
    listWorkspacesMock.mockResolvedValue([createWorkspaceItem()]);

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Home" });
    expect(screen.queryByRole("button", { name: "Delete Home" })).not.toBeInTheDocument();
  });
});
