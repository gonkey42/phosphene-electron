import type { ReactNode } from "react";

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getDbMock,
  ensureStorageDirectoriesMock,
  keyboardProviderMock,
  runDailyBackupMock,
  listWorkspacesMock,
  mapWorkspaceMock,
  useKeyboardShortcutsMock,
  tabBarMock,
  workspaceContainerMock,
} = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  ensureStorageDirectoriesMock: vi.fn(),
  keyboardProviderMock: vi.fn(),
  runDailyBackupMock: vi.fn(),
  listWorkspacesMock: vi.fn(),
  mapWorkspaceMock: vi.fn((item) => ({
    id: item.id,
    name: item.name,
    icon: item.icon ?? "📋",
    position: item.position,
  })),
  useKeyboardShortcutsMock: vi.fn(),
  tabBarMock: vi.fn(),
  workspaceContainerMock: vi.fn(),
}));

vi.mock("../lib/database", () => ({
  getDb: getDbMock,
}));

vi.mock("../lib/file-storage", () => ({
  ensureStorageDirectories: ensureStorageDirectoriesMock,
}));

vi.mock("../lib/backup", () => ({
  runDailyBackup: runDailyBackupMock,
}));

vi.mock("../lib/workspace-operations", () => ({
  listWorkspaces: listWorkspacesMock,
  mapWorkspace: mapWorkspaceMock,
}));

vi.mock("../hooks/use-keyboard-shortcuts", () => ({
  useKeyboardShortcuts: useKeyboardShortcutsMock,
}));

vi.mock("../contexts/KeyboardContext", () => ({
  KeyboardProvider: ({ children }: { children: ReactNode }) => {
    keyboardProviderMock();
    return <div data-testid="keyboard-provider">{children}</div>;
  },
}));

vi.mock("./workspace/WorkspaceTabBar", () => ({
  WorkspaceTabBar: () => {
    tabBarMock();
    return <div data-testid="workspace-tab-bar" />;
  },
}));

vi.mock("./workspace/WorkspaceContainer", () => ({
  WorkspaceContainer: () => {
    workspaceContainerMock();
    return <section data-testid="workspace-container" />;
  },
}));

describe("AppShell", () => {
  beforeEach(async () => {
    getDbMock.mockReset();
    ensureStorageDirectoriesMock.mockReset();
    keyboardProviderMock.mockReset();
    runDailyBackupMock.mockReset();
    listWorkspacesMock.mockReset();
    mapWorkspaceMock.mockClear();
    useKeyboardShortcutsMock.mockReset();
    tabBarMock.mockReset();
    workspaceContainerMock.mockReset();
    vi.resetModules();

    const { useAppStore } = await import("../stores/app-store");
    useAppStore.setState({
      workspaces: [],
      activeWorkspaceId: null,
      boards: [],
      activeBoardId: null,
      focus: "global",
      initialized: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("loads workspaces from the database and shows the ready shell", async () => {
    listWorkspacesMock.mockResolvedValue([
      { id: "workspace-1", name: "Home", icon: "🏠", position: 0 },
    ]);
    getDbMock.mockResolvedValue({});
    runDailyBackupMock.mockResolvedValue(undefined);

    const { AppShell } = await import("./AppShell");
    render(<AppShell />);

    expect(screen.getByText("Loading Phosphene...")).toBeInTheDocument();

    expect(await screen.findByTestId("workspace-tab-bar")).toBeInTheDocument();
    expect(await screen.findByTestId("workspace-container")).toBeInTheDocument();
    expect(getDbMock).toHaveBeenCalledTimes(1);
    expect(ensureStorageDirectoriesMock).toHaveBeenCalledTimes(1);
    expect(runDailyBackupMock).toHaveBeenCalledTimes(1);
    expect(ensureStorageDirectoriesMock.mock.invocationCallOrder[0]).toBeLessThan(
      runDailyBackupMock.mock.invocationCallOrder[0],
    );
    expect(listWorkspacesMock).toHaveBeenCalledTimes(1);
    expect(mapWorkspaceMock).toHaveBeenCalledTimes(1);
    const { useAppStore } = await import("../stores/app-store");
    expect(useAppStore.getState().workspaces).toEqual([
      { id: "workspace-1", name: "Home", icon: "🏠", position: 0 },
    ]);
    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-1");
    expect(tabBarMock).toHaveBeenCalledTimes(1);
    expect(workspaceContainerMock).toHaveBeenCalledTimes(1);
  });

  it("registers the global keyboard shortcuts hook", async () => {
    listWorkspacesMock.mockResolvedValue([]);
    getDbMock.mockResolvedValue({});
    runDailyBackupMock.mockResolvedValue(undefined);

    const { AppShell } = await import("./AppShell");
    render(<AppShell />);

    expect(useKeyboardShortcutsMock).toHaveBeenCalled();
  });

  it("wraps the ready shell in the keyboard provider", async () => {
    listWorkspacesMock.mockResolvedValue([]);
    getDbMock.mockResolvedValue({});
    runDailyBackupMock.mockResolvedValue(undefined);

    const { AppShell } = await import("./AppShell");
    render(<AppShell />);

    expect(await screen.findByTestId("keyboard-provider")).toBeInTheDocument();
    expect(keyboardProviderMock).toHaveBeenCalledTimes(1);
  });

  it("does not rerender the ready shell on focus-only store updates", async () => {
    listWorkspacesMock.mockResolvedValue([
      { id: "workspace-1", name: "Home", icon: "🏠", position: 0 },
    ]);
    getDbMock.mockResolvedValue({});
    runDailyBackupMock.mockResolvedValue(undefined);

    const { AppShell } = await import("./AppShell");
    const { useAppStore } = await import("../stores/app-store");
    render(<AppShell />);

    await screen.findByTestId("workspace-tab-bar");

    tabBarMock.mockClear();
    workspaceContainerMock.mockClear();
    keyboardProviderMock.mockClear();

    act(() => {
      useAppStore.setState({ focus: "canvas" });
    });

    expect(tabBarMock).not.toHaveBeenCalled();
    expect(workspaceContainerMock).not.toHaveBeenCalled();
    expect(keyboardProviderMock).not.toHaveBeenCalled();
  });
});
