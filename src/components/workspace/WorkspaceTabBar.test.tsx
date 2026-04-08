import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createWorkspaceMock,
  deleteWorkspaceMock,
  mapWorkspaceMock,
  listWorkspacesMock,
  renameWorkspaceMock,
} = vi.hoisted(() => ({
  createWorkspaceMock: vi.fn(),
  deleteWorkspaceMock: vi.fn(),
  mapWorkspaceMock: vi.fn((item) => ({
    id: item.id,
    name: item.name,
    icon: item.icon ?? "📋",
    position: item.position,
  })),
  listWorkspacesMock: vi.fn(),
  renameWorkspaceMock: vi.fn(),
}));

vi.mock("../../lib/workspace-operations", () => ({
  createWorkspace: createWorkspaceMock,
  deleteWorkspace: deleteWorkspaceMock,
  mapWorkspace: mapWorkspaceMock,
  listWorkspaces: listWorkspacesMock,
  renameWorkspace: renameWorkspaceMock,
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

function setPlatform(platform: string) {
  Object.defineProperty(window.navigator, "platform", {
    configurable: true,
    value: platform,
  });
}

describe("WorkspaceTabBar", () => {
  beforeEach(() => {
    vi.useRealTimers();
    createWorkspaceMock.mockReset();
    deleteWorkspaceMock.mockReset();
    listWorkspacesMock.mockReset();
    renameWorkspaceMock.mockReset();
    useAppStore.setState({
      workspaces: [],
      activeWorkspaceId: null,
    });
    setPlatform("Linux x86_64");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders tabs, highlights the active workspace, and switches on click", async () => {
    listWorkspacesMock.mockResolvedValue([
      createWorkspaceItem(),
      createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
    ]);

    render(<WorkspaceTabBar />);

    expect(await screen.findByRole("button", { name: "Home" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Projects" }));

    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-2");
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
        createWorkspaceItem({ id: "workspace-3", name: "Workspace 3", icon: "🪟", position: 2 }),
      ]);
    createWorkspaceMock.mockResolvedValue("workspace-3");

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Home" });
    fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));

    await waitFor(() => {
      expect(createWorkspaceMock).toHaveBeenCalledWith("Workspace 3", "🪟");
    });
    expect(await screen.findByRole("button", { name: "Workspace 3" })).toBeInTheDocument();
    expect(listWorkspacesMock).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-3");
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
    fireEvent.click(screen.getByRole("button", { name: "Delete Projects" }));

    expect(deleteWorkspaceMock).toHaveBeenCalledWith("workspace-2");
    expect(await screen.findByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-1");
  });

  it("hides delete controls when there is only one workspace", async () => {
    listWorkspacesMock.mockResolvedValue([createWorkspaceItem()]);

    render(<WorkspaceTabBar />);

    await screen.findByRole("button", { name: "Home" });
    expect(screen.queryByRole("button", { name: "Delete Home" })).not.toBeInTheDocument();
  });
});
