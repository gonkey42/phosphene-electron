import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSharedErrors, getSharedErrors } from "../../hooks/shared-error-store";

const {
  createWorkspaceMock,
  deleteWorkspaceMock,
  mapWorkspaceMock,
  listWorkspacesMock,
  renameWorkspaceMock,
  workspacePublishControlsMock,
} = vi.hoisted(() => ({
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
  workspacePublishControlsMock: vi.fn(),
}));

vi.mock("../../lib/workspace-operations", () => ({
  createWorkspace: createWorkspaceMock,
  deleteWorkspace: deleteWorkspaceMock,
  mapWorkspace: mapWorkspaceMock,
  listWorkspaces: listWorkspacesMock,
  renameWorkspace: renameWorkspaceMock,
}));

vi.mock("../publish/WorkspacePublishControls", () => ({
  WorkspacePublishControls: ({
    workspaceId,
    workspaceName,
  }: {
    workspaceId: string;
    workspaceName: string;
  }) => {
    workspacePublishControlsMock({ workspaceId, workspaceName });
    return <div data-testid={`publish-controls-${workspaceId}`} />;
  },
}));

import { useAppStore } from "../../stores/app-store";

import { WorkspaceTabBar } from "./WorkspaceTabBar";

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
    createWorkspaceMock.mockReset();
    deleteWorkspaceMock.mockReset();
    listWorkspacesMock.mockReset();
    renameWorkspaceMock.mockReset();
    workspacePublishControlsMock.mockReset();
    useAppStore.setState({
      workspaces: [],
      activeWorkspaceId: null,
      initialized: false,
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

    expect(screen.getByTestId("publish-controls-workspace-1")).toBeInTheDocument();
    expect(screen.getByTestId("publish-controls-workspace-2")).toBeInTheDocument();
    expect(workspacePublishControlsMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workspaceName: "Home",
    });
    expect(workspacePublishControlsMock).toHaveBeenCalledWith({
      workspaceId: "workspace-2",
      workspaceName: "Projects",
    });
  });

  it("hides publish controls while a workspace is being renamed", async () => {
    listWorkspacesMock.mockResolvedValue([createWorkspaceItem()]);

    render(<WorkspaceTabBar />);

    fireEvent.doubleClick(await screen.findByRole("button", { name: "Home" }));

    expect(screen.getByRole("textbox", { name: "Workspace name" })).toBeInTheDocument();
    expect(screen.queryByTestId("publish-controls-workspace-1")).not.toBeInTheDocument();
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
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    expect(deleteWorkspaceMock).toHaveBeenCalledWith("workspace-2");
    expect(await screen.findByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-1");
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
