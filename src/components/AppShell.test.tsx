import { useEffect, useState, type ReactNode } from "react";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedTheme, ThemePreference } from "../lib/theme-settings";

const {
  getDbMock,
  ensureStorageDirectoriesMock,
  keyboardProviderMock,
  runDailyBackupMock,
  listWorkspacesMock,
  mapWorkspaceMock,
  useKeyboardShortcutsMock,
  useThemeControllerMock,
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
  useThemeControllerMock: vi.fn(),
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

vi.mock("../hooks/use-theme-controller", () => ({
  useThemeController: useThemeControllerMock,
}));

vi.mock("../contexts/KeyboardContext", () => ({
  KeyboardProvider: ({ children }: { children: ReactNode }) => {
    keyboardProviderMock();
    return <div data-testid="keyboard-provider">{children}</div>;
  },
}));

vi.mock("./workspace/WorkspaceTabBar", () => ({
  WorkspaceTabBar: (props: unknown) => {
    tabBarMock(props);
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
    useThemeControllerMock.mockReset();
    tabBarMock.mockReset();
    workspaceContainerMock.mockReset();
    vi.resetModules();
    useThemeControllerMock.mockReturnValue({
      themePreference: "system",
      resolvedTheme: "light",
      updateThemePreference: vi.fn(),
    });

    const { clearSharedErrors } = await import("../hooks/shared-error-store");
    clearSharedErrors();

    const { useAppStore } = await import("../stores/app-store");
    useAppStore.setState({
      workspaces: [],
      activeWorkspaceId: null,
      boards: [],
      activeBoardId: null,
      focus: "global",
      status: "idle",
      initializationError: null,
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

  it("applies the resolved theme class after persisted theme data loads", async () => {
    let resolveWorkspaceLoad: ((value: Array<{ id: string; name: string; icon: string; position: number }>) => void)
      | undefined;
    listWorkspacesMock.mockReturnValue(
      new Promise((resolve) => {
        resolveWorkspaceLoad = resolve;
      }),
    );
    getDbMock.mockResolvedValue({});
    runDailyBackupMock.mockResolvedValue(undefined);
    const onThemePreferenceChange = vi.fn();
    useThemeControllerMock.mockImplementation(() => {
      const [themeState, setThemeState] = useState<{
        themePreference: ThemePreference;
        resolvedTheme: ResolvedTheme;
      }>({
        themePreference: "system",
        resolvedTheme: "light",
      });

      useEffect(() => {
        void Promise.resolve().then(() => {
          setThemeState({
            themePreference: "dark",
            resolvedTheme: "dark",
          });
        });
      }, []);

      return {
        ...themeState,
        updateThemePreference: onThemePreferenceChange,
      };
    });

    const { AppShell } = await import("./AppShell");
    render(<AppShell />);

    expect(screen.getByText("Loading Phosphene...").closest(".app-shell")).toHaveClass("theme-light");

    await waitFor(() => {
      expect(screen.getByText("Loading Phosphene...").closest(".app-shell")).toHaveClass("theme-dark");
    });

    resolveWorkspaceLoad?.([]);

    expect(await screen.findByTestId("workspace-tab-bar")).toBeInTheDocument();
    expect(screen.getByTestId("keyboard-provider").firstElementChild).toHaveClass("theme-dark");
    expect(tabBarMock).toHaveBeenCalledWith({});
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

  it("does not trigger a second workspace load after startup completes with an empty list", async () => {
    listWorkspacesMock.mockResolvedValue([]);
    getDbMock.mockResolvedValue({});
    runDailyBackupMock.mockResolvedValue(undefined);

    const { AppShell } = await import("./AppShell");
    render(<AppShell />);

    expect(await screen.findByTestId("workspace-tab-bar")).toBeInTheDocument();
    expect(listWorkspacesMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Recoverable errors")).not.toBeInTheDocument();
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

  it("does not render the loading screen while initialization is idle", async () => {
    listWorkspacesMock.mockResolvedValue([]);
    getDbMock.mockResolvedValue({});
    runDailyBackupMock.mockResolvedValue(undefined);

    const { AppShell } = await import("./AppShell");
    const { useAppStore } = await import("../stores/app-store");
    render(<AppShell />);

    await screen.findByTestId("workspace-tab-bar");

    act(() => {
      useAppStore.setState({
        status: "idle",
        initialized: false,
      });
    });

    expect(screen.queryByText("Loading Phosphene...")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workspace-tab-bar")).not.toBeInTheDocument();
  });

  it("renders a retryable startup failure when initialization fails", async () => {
    getDbMock.mockRejectedValue(new Error("Desktop API not available"));

    const { AppShell } = await import("./AppShell");
    render(<AppShell />);

    expect(screen.getByText("Loading Phosphene...")).toBeInTheDocument();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unable to start Phosphene");
    expect(alert).toHaveTextContent("Desktop API not available");
    expect(screen.queryByText("Loading Phosphene...")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    const { getSharedErrors } = await import("../hooks/shared-error-store");
    expect(getSharedErrors()).toEqual([
      expect.objectContaining({
        channel: "app-shell:init",
        message: "Failed to initialize app",
        persistent: true,
        dismissible: false,
      }),
    ]);
    expect(screen.queryByLabelText("Recoverable errors")).not.toBeInTheDocument();
  });

  it("retries initialization after a startup failure", async () => {
    getDbMock.mockResolvedValue({});
    ensureStorageDirectoriesMock.mockResolvedValue(undefined);
    runDailyBackupMock.mockResolvedValue(undefined);
    listWorkspacesMock
      .mockRejectedValueOnce(new Error("Workspace scan failed"))
      .mockResolvedValueOnce([{ id: "workspace-1", name: "Home", icon: "🏠", position: 0 }]);

    const { AppShell } = await import("./AppShell");
    render(<AppShell />);

    await screen.findByRole("alert");

    expect(getDbMock).toHaveBeenCalledTimes(1);
    expect(ensureStorageDirectoriesMock).toHaveBeenCalledTimes(1);
    expect(listWorkspacesMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByTestId("workspace-tab-bar")).toBeInTheDocument();
    expect(getDbMock).toHaveBeenCalledTimes(2);
    expect(ensureStorageDirectoriesMock).toHaveBeenCalledTimes(2);
    expect(listWorkspacesMock).toHaveBeenCalledTimes(2);

    const { getSharedErrors } = await import("../hooks/shared-error-store");
    expect(getSharedErrors()).toEqual([]);
  });
});
