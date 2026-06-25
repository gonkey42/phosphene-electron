import type { HTMLAttributes, ReactNode } from "react";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";

const { sidebarMock, canvasPanelMock, motionDivMock, panelLayoutMock } = vi.hoisted(() => ({
  sidebarMock: vi.fn(),
  canvasPanelMock: vi.fn(),
  motionDivMock: vi.fn(),
  panelLayoutMock: vi.fn(),
}));

const { browserPanelMock } = vi.hoisted(() => ({
  browserPanelMock: vi.fn(),
}));

const { useWorkspaceLayoutMock } = vi.hoisted(() => ({
  useWorkspaceLayoutMock: vi.fn(),
}));

const workspaceFlushLayoutMocks = {
  "workspace-1": vi.fn(),
  "workspace-2": vi.fn(),
  "workspace-3": vi.fn(),
  "workspace-4": vi.fn(),
  "workspace-5": vi.fn(),
  "workspace-6": vi.fn(),
};

const workspaceSetBoardsVisibleMocks = {
  "workspace-1": vi.fn(),
  "workspace-2": vi.fn(),
  "workspace-3": vi.fn(),
  "workspace-4": vi.fn(),
  "workspace-5": vi.fn(),
  "workspace-6": vi.fn(),
};

const workspaceSetBrowserVisibleMocks = {
  "workspace-1": vi.fn(),
  "workspace-2": vi.fn(),
  "workspace-3": vi.fn(),
  "workspace-4": vi.fn(),
  "workspace-5": vi.fn(),
  "workspace-6": vi.fn(),
};

const workspaceEnsureBrowserHiddenMocks = {
  "workspace-1": vi.fn(),
  "workspace-2": vi.fn(),
  "workspace-3": vi.fn(),
  "workspace-4": vi.fn(),
  "workspace-5": vi.fn(),
  "workspace-6": vi.fn(),
};

const workspaceConfirmBrowserRestoredMocks = {
  "workspace-1": vi.fn(),
  "workspace-2": vi.fn(),
  "workspace-3": vi.fn(),
  "workspace-4": vi.fn(),
  "workspace-5": vi.fn(),
  "workspace-6": vi.fn(),
};

const workspaceConfirmBrowserLayoutAppliedMocks = {
  "workspace-1": vi.fn(),
  "workspace-2": vi.fn(),
  "workspace-3": vi.fn(),
  "workspace-4": vi.fn(),
  "workspace-5": vi.fn(),
  "workspace-6": vi.fn(),
};

const workspaceHandleBrowserRestoreFailureMocks = {
  "workspace-1": vi.fn(),
  "workspace-2": vi.fn(),
  "workspace-3": vi.fn(),
  "workspace-4": vi.fn(),
  "workspace-5": vi.fn(),
  "workspace-6": vi.fn(),
};

const workspaceHandleBrowserLayoutApplyFailureMocks = {
  "workspace-1": vi.fn(),
  "workspace-2": vi.fn(),
  "workspace-3": vi.fn(),
  "workspace-4": vi.fn(),
  "workspace-5": vi.fn(),
  "workspace-6": vi.fn(),
};

type MotionDivProps = HTMLAttributes<HTMLDivElement> & {
  animate?: string;
  custom?: number;
  initial?: string | boolean;
  onAnimationComplete?: () => void;
  variants?: Record<string, unknown>;
  "data-workspace-id"?: string;
};

const workspacePrimarySizes = {
  "workspace-1": 32,
  "workspace-2": 42,
  "workspace-3": 52,
  "workspace-4": 60,
  "workspace-5": 68,
  "workspace-6": 76,
};

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, custom, variants, ...props }: MotionDivProps) => {
      motionDivMock({ custom, variants, ...props });

      return (
        <div
          data-testid={
            props["data-workspace-id"]
              ? `workspace-page-motion-${props["data-workspace-id"]}`
              : "workspace-overlay"
          }
          data-animate={typeof props.animate === "string" ? props.animate : ""}
          data-custom={custom ?? ""}
          data-has-variants={variants ? "true" : "false"}
          data-initial={
            typeof props.initial === "string"
              ? props.initial
              : props.initial === false
                ? "false"
                : ""
          }
          {...props}
        >
          {children}
        </div>
      );
    },
  },
}));

vi.mock("../sidebar/Sidebar", () => ({
  Sidebar: ({
    workspaceId,
    onBoardSelect,
    isVisible,
  }: {
    workspaceId?: string;
    onBoardSelect?: (boardId: string | null) => void;
    isVisible?: boolean;
  }) => {
    sidebarMock({ workspaceId, onBoardSelect, isVisible });
    return (
      <aside data-testid={`sidebar-${workspaceId ?? "none"}`}>
        <button type="button">Inside sidebar</button>
      </aside>
    );
  },
}));

vi.mock("../canvas/CanvasPanel", () => ({
  CanvasPanel: ({
    workspaceId,
    isInteractive,
  }: {
    workspaceId?: string;
    isInteractive?: boolean;
  }) => {
    canvasPanelMock({ workspaceId, isInteractive });
    return <div data-testid={`canvas-${workspaceId ?? "none"}`} />;
  },
}));

vi.mock("../browser/BrowserPanel", () => ({
  BrowserPanel: ({
    mode,
    visible,
    onNativeAttachComplete,
    onNativeAttachError,
  }: {
    mode?: "live" | "shell";
    visible?: boolean;
    onNativeAttachComplete?: () => void;
    onNativeAttachError?: (error: unknown) => void;
  }) => {
    browserPanelMock({ mode, visible, onNativeAttachComplete, onNativeAttachError });
    return <div data-testid={mode === "shell" ? "browser-panel-shell" : "browser-panel-live"} />;
  },
}));

vi.mock("../layout/PanelLayout", () => ({
  PanelLayout: ({
    workspaceId,
    primaryContent,
    secondaryContent,
    defaultPrimarySize,
    browserVisible,
    layoutResetVersion,
    onLayoutApplied,
    onLayoutApplyError,
    onLayoutChange,
  }: {
    workspaceId: string;
    primaryContent: ReactNode;
    secondaryContent?: ReactNode;
    defaultPrimarySize?: number;
    browserVisible?: boolean;
    layoutResetVersion?: number;
    onLayoutApplied?: () => void;
    onLayoutApplyError?: (error: unknown) => void;
    onLayoutChange?: (sizes: { primary?: number; secondary?: number }) => void;
  }) => {
    panelLayoutMock({
      workspaceId,
      hasSecondaryContent: Boolean(secondaryContent),
      defaultPrimarySize,
      browserVisible,
      layoutResetVersion,
      onLayoutApplied,
      onLayoutApplyError,
      onLayoutChange,
    });

    return (
      <section data-testid={`panel-layout-${workspaceId}`}>
        <div data-testid={`panel-layout-primary-${workspaceId}`}>{primaryContent}</div>
        <div data-testid={`panel-layout-secondary-${workspaceId}`}>{secondaryContent}</div>
      </section>
    );
  },
}));

vi.mock("../../hooks/use-workspace-layout", () => ({
  useWorkspaceLayout: useWorkspaceLayoutMock,
}));

import { useAppStore } from "../../stores/app-store";

import { WorkspaceContainer } from "./WorkspaceContainer";

describe("WorkspaceContainer", () => {
  const workspaceUpdateActiveBoardMocks = {
    "workspace-1": vi.fn(),
    "workspace-2": vi.fn(),
    "workspace-3": vi.fn(),
    "workspace-4": vi.fn(),
    "workspace-5": vi.fn(),
    "workspace-6": vi.fn(),
  };

  beforeEach(() => {
    sidebarMock.mockReset();
    canvasPanelMock.mockReset();
    motionDivMock.mockReset();
    panelLayoutMock.mockReset();
    browserPanelMock.mockReset();
    useWorkspaceLayoutMock.mockReset();
    workspaceUpdateActiveBoardMocks["workspace-1"].mockReset();
    workspaceUpdateActiveBoardMocks["workspace-2"].mockReset();
    workspaceUpdateActiveBoardMocks["workspace-3"].mockReset();
    workspaceUpdateActiveBoardMocks["workspace-4"].mockReset();
    workspaceUpdateActiveBoardMocks["workspace-5"].mockReset();
    workspaceUpdateActiveBoardMocks["workspace-6"].mockReset();
    workspaceFlushLayoutMocks["workspace-1"].mockReset();
    workspaceFlushLayoutMocks["workspace-2"].mockReset();
    workspaceFlushLayoutMocks["workspace-3"].mockReset();
    workspaceFlushLayoutMocks["workspace-4"].mockReset();
    workspaceFlushLayoutMocks["workspace-5"].mockReset();
    workspaceFlushLayoutMocks["workspace-6"].mockReset();
    workspaceSetBoardsVisibleMocks["workspace-1"].mockReset();
    workspaceSetBoardsVisibleMocks["workspace-2"].mockReset();
    workspaceSetBoardsVisibleMocks["workspace-3"].mockReset();
    workspaceSetBoardsVisibleMocks["workspace-4"].mockReset();
    workspaceSetBoardsVisibleMocks["workspace-5"].mockReset();
    workspaceSetBoardsVisibleMocks["workspace-6"].mockReset();
    workspaceSetBrowserVisibleMocks["workspace-1"].mockReset();
    workspaceSetBrowserVisibleMocks["workspace-2"].mockReset();
    workspaceSetBrowserVisibleMocks["workspace-3"].mockReset();
    workspaceSetBrowserVisibleMocks["workspace-4"].mockReset();
    workspaceSetBrowserVisibleMocks["workspace-5"].mockReset();
    workspaceSetBrowserVisibleMocks["workspace-6"].mockReset();
    workspaceSetBrowserVisibleMocks["workspace-1"].mockResolvedValue(true);
    workspaceSetBrowserVisibleMocks["workspace-2"].mockResolvedValue(true);
    workspaceSetBrowserVisibleMocks["workspace-3"].mockResolvedValue(true);
    workspaceSetBrowserVisibleMocks["workspace-4"].mockResolvedValue(true);
    workspaceSetBrowserVisibleMocks["workspace-5"].mockResolvedValue(true);
    workspaceSetBrowserVisibleMocks["workspace-6"].mockResolvedValue(true);
    workspaceEnsureBrowserHiddenMocks["workspace-1"].mockReset();
    workspaceEnsureBrowserHiddenMocks["workspace-2"].mockReset();
    workspaceEnsureBrowserHiddenMocks["workspace-3"].mockReset();
    workspaceEnsureBrowserHiddenMocks["workspace-4"].mockReset();
    workspaceEnsureBrowserHiddenMocks["workspace-5"].mockReset();
    workspaceEnsureBrowserHiddenMocks["workspace-6"].mockReset();
    workspaceConfirmBrowserRestoredMocks["workspace-1"].mockReset();
    workspaceConfirmBrowserRestoredMocks["workspace-2"].mockReset();
    workspaceConfirmBrowserRestoredMocks["workspace-3"].mockReset();
    workspaceConfirmBrowserRestoredMocks["workspace-4"].mockReset();
    workspaceConfirmBrowserRestoredMocks["workspace-5"].mockReset();
    workspaceConfirmBrowserRestoredMocks["workspace-6"].mockReset();
    workspaceConfirmBrowserLayoutAppliedMocks["workspace-1"].mockReset();
    workspaceConfirmBrowserLayoutAppliedMocks["workspace-2"].mockReset();
    workspaceConfirmBrowserLayoutAppliedMocks["workspace-3"].mockReset();
    workspaceConfirmBrowserLayoutAppliedMocks["workspace-4"].mockReset();
    workspaceConfirmBrowserLayoutAppliedMocks["workspace-5"].mockReset();
    workspaceConfirmBrowserLayoutAppliedMocks["workspace-6"].mockReset();
    workspaceHandleBrowserRestoreFailureMocks["workspace-1"].mockReset();
    workspaceHandleBrowserRestoreFailureMocks["workspace-2"].mockReset();
    workspaceHandleBrowserRestoreFailureMocks["workspace-3"].mockReset();
    workspaceHandleBrowserRestoreFailureMocks["workspace-4"].mockReset();
    workspaceHandleBrowserRestoreFailureMocks["workspace-5"].mockReset();
    workspaceHandleBrowserRestoreFailureMocks["workspace-6"].mockReset();
    workspaceHandleBrowserLayoutApplyFailureMocks["workspace-1"].mockReset();
    workspaceHandleBrowserLayoutApplyFailureMocks["workspace-2"].mockReset();
    workspaceHandleBrowserLayoutApplyFailureMocks["workspace-3"].mockReset();
    workspaceHandleBrowserLayoutApplyFailureMocks["workspace-4"].mockReset();
    workspaceHandleBrowserLayoutApplyFailureMocks["workspace-5"].mockReset();
    workspaceHandleBrowserLayoutApplyFailureMocks["workspace-6"].mockReset();
    workspaceFlushLayoutMocks["workspace-1"].mockResolvedValue(undefined);
    workspaceFlushLayoutMocks["workspace-2"].mockResolvedValue(undefined);
    workspaceFlushLayoutMocks["workspace-3"].mockResolvedValue(undefined);
    workspaceFlushLayoutMocks["workspace-4"].mockResolvedValue(undefined);
    workspaceFlushLayoutMocks["workspace-5"].mockResolvedValue(undefined);
    workspaceFlushLayoutMocks["workspace-6"].mockResolvedValue(undefined);
    useAppStore.setState({
      workspaces: [
        { id: "workspace-1", name: "Home", icon: "🏠", position: 0 },
        { id: "workspace-2", name: "Research", icon: "🔎", position: 1 },
        { id: "workspace-3", name: "Build", icon: "🛠️", position: 2 },
        { id: "workspace-4", name: "Review", icon: "✅", position: 3 },
        { id: "workspace-5", name: "Archive", icon: "📦", position: 4 },
      ],
      activeWorkspaceId: "workspace-3",
      boards: [],
      activeBoardId: null,
      focus: "global",
      initialized: true,
    });
    useWorkspaceLayoutMock.mockImplementation((workspaceId: string) => ({
      layout: {
        primaryPanelSize: workspacePrimarySizes[workspaceId as keyof typeof workspacePrimarySizes],
        lastVisiblePrimaryPanelSize: workspacePrimarySizes[workspaceId as keyof typeof workspacePrimarySizes],
        boardsVisible: true,
        browserVisible: true,
        activeBoardId: null,
      },
      isLoaded: true,
      updatePanelSize: vi.fn(),
      updateActiveBoard:
        workspaceUpdateActiveBoardMocks[
          workspaceId as keyof typeof workspaceUpdateActiveBoardMocks
        ],
      setBoardsVisible:
        workspaceSetBoardsVisibleMocks[
          workspaceId as keyof typeof workspaceSetBoardsVisibleMocks
        ],
      toggleBoardsVisible: vi.fn(),
      setBrowserVisible:
        workspaceSetBrowserVisibleMocks[
          workspaceId as keyof typeof workspaceSetBrowserVisibleMocks
        ],
      toggleBrowserVisible: vi.fn(),
      setBothPanelsVisible: vi.fn(),
      toggleCanvasFocusMode: vi.fn(),
      ensureBrowserHidden:
        workspaceEnsureBrowserHiddenMocks[
          workspaceId as keyof typeof workspaceEnsureBrowserHiddenMocks
        ],
      confirmBrowserRestored:
        workspaceConfirmBrowserRestoredMocks[
          workspaceId as keyof typeof workspaceConfirmBrowserRestoredMocks
        ],
      confirmBrowserLayoutApplied:
        workspaceConfirmBrowserLayoutAppliedMocks[
          workspaceId as keyof typeof workspaceConfirmBrowserLayoutAppliedMocks
        ],
      handleBrowserRestoreFailure:
        workspaceHandleBrowserRestoreFailureMocks[
          workspaceId as keyof typeof workspaceHandleBrowserRestoreFailureMocks
        ],
      handleBrowserLayoutApplyFailure:
        workspaceHandleBrowserLayoutApplyFailureMocks[
          workspaceId as keyof typeof workspaceHandleBrowserLayoutApplyFailureMocks
        ],
      flushPendingLayoutSave:
        workspaceFlushLayoutMocks[workspaceId as keyof typeof workspaceFlushLayoutMocks],
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it("mounts the active workspace plus immediate neighbors on first render", () => {
    const { container } = render(<WorkspaceContainer />);

    const pages = Array.from(container.querySelectorAll<HTMLElement>(".workspace-page"));

    expect(pages).toHaveLength(3);
    expect(screen.getByTestId("workspace-page-motion-workspace-2")).toHaveClass("hidden");
    expect(screen.getByTestId("workspace-page-motion-workspace-3")).not.toHaveClass("hidden");
    expect(screen.getByTestId("workspace-page-motion-workspace-4")).toHaveClass("hidden");

    expect(screen.getByTestId("sidebar-workspace-2")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-workspace-3")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-workspace-4")).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-workspace-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-workspace-5")).not.toBeInTheDocument();
    expect(screen.getByTestId("canvas-workspace-2")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-workspace-3")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-workspace-4")).toBeInTheDocument();
    expect(screen.queryByTestId("canvas-workspace-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("canvas-workspace-5")).not.toBeInTheDocument();
  });

  it("passes workspace ids through for mounted pages while keeping hidden canvases passive", () => {
    render(<WorkspaceContainer />);

    expect(sidebarMock).toHaveBeenCalledTimes(3);
    expect(sidebarMock).toHaveBeenNthCalledWith(1, {
      workspaceId: "workspace-2",
      onBoardSelect: workspaceUpdateActiveBoardMocks["workspace-2"],
      isVisible: true,
    });
    expect(sidebarMock).toHaveBeenNthCalledWith(2, {
      workspaceId: "workspace-3",
      onBoardSelect: workspaceUpdateActiveBoardMocks["workspace-3"],
      isVisible: true,
    });
    expect(sidebarMock).toHaveBeenNthCalledWith(3, {
      workspaceId: "workspace-4",
      onBoardSelect: workspaceUpdateActiveBoardMocks["workspace-4"],
      isVisible: true,
    });
    expect(canvasPanelMock).toHaveBeenCalledTimes(3);
    expect(canvasPanelMock).toHaveBeenNthCalledWith(1, {
      workspaceId: "workspace-2",
      isInteractive: false,
    });
    expect(canvasPanelMock).toHaveBeenNthCalledWith(2, {
      workspaceId: "workspace-3",
      isInteractive: true,
    });
    expect(canvasPanelMock).toHaveBeenNthCalledWith(3, {
      workspaceId: "workspace-4",
      isInteractive: false,
    });
  });

  it("routes only the active workspace through a panel layout with browser content", () => {
    render(<WorkspaceContainer />);

    expect(panelLayoutMock).toHaveBeenCalledTimes(3);
    expect(panelLayoutMock).toHaveBeenNthCalledWith(1, {
      workspaceId: "workspace-2",
      hasSecondaryContent: false,
      defaultPrimarySize: 42,
      browserVisible: true,
      layoutResetVersion: 0,
      onLayoutApplied: workspaceConfirmBrowserLayoutAppliedMocks["workspace-2"],
      onLayoutApplyError: workspaceHandleBrowserLayoutApplyFailureMocks["workspace-2"],
      onLayoutChange: expect.any(Function),
    });
    expect(panelLayoutMock).toHaveBeenNthCalledWith(2, {
      workspaceId: "workspace-3",
      hasSecondaryContent: true,
      defaultPrimarySize: 52,
      browserVisible: true,
      layoutResetVersion: 0,
      onLayoutApplied: workspaceConfirmBrowserLayoutAppliedMocks["workspace-3"],
      onLayoutApplyError: workspaceHandleBrowserLayoutApplyFailureMocks["workspace-3"],
      onLayoutChange: expect.any(Function),
    });
    expect(panelLayoutMock).toHaveBeenNthCalledWith(3, {
      workspaceId: "workspace-4",
      hasSecondaryContent: false,
      defaultPrimarySize: 60,
      browserVisible: true,
      layoutResetVersion: 0,
      onLayoutApplied: workspaceConfirmBrowserLayoutAppliedMocks["workspace-4"],
      onLayoutApplyError: workspaceHandleBrowserLayoutApplyFailureMocks["workspace-4"],
      onLayoutChange: expect.any(Function),
    });

    expect(screen.queryByTestId("panel-layout-workspace-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("panel-layout-workspace-2")).toBeInTheDocument();
    expect(screen.getByTestId("panel-layout-workspace-3")).toBeInTheDocument();
    expect(screen.getByTestId("panel-layout-workspace-4")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-layout-workspace-5")).not.toBeInTheDocument();
    expect(browserPanelMock).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("browser-panel-live")).toHaveLength(1);
  });

  it("renders the browser panel only for the active workspace page", () => {
    render(<WorkspaceContainer />);

    expect(screen.queryByText("Widgets and browser will go here")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("browser-panel-live")).toHaveLength(1);

    act(() => {
      useAppStore.setState({ activeWorkspaceId: "workspace-4" });
    });

    expect(screen.getAllByTestId("browser-panel-live")).toHaveLength(1);
  });

  it("passes collapsed sidebar and browser visibility from persisted workspace layout", () => {
    useWorkspaceLayoutMock.mockImplementation((workspaceId: string) => ({
      layout: {
        primaryPanelSize: workspaceId === "workspace-3" ? 100 : workspacePrimarySizes[workspaceId as keyof typeof workspacePrimarySizes],
        lastVisiblePrimaryPanelSize: workspacePrimarySizes[workspaceId as keyof typeof workspacePrimarySizes],
        boardsVisible: workspaceId !== "workspace-3",
        browserVisible: workspaceId !== "workspace-3",
        activeBoardId: null,
      },
      isLoaded: true,
      updatePanelSize: vi.fn(),
      updateActiveBoard:
        workspaceUpdateActiveBoardMocks[
          workspaceId as keyof typeof workspaceUpdateActiveBoardMocks
        ],
      setBoardsVisible: vi.fn(),
      toggleBoardsVisible: vi.fn(),
      setBrowserVisible:
        workspaceSetBrowserVisibleMocks[
          workspaceId as keyof typeof workspaceSetBrowserVisibleMocks
        ],
      toggleBrowserVisible: vi.fn(),
      setBothPanelsVisible: vi.fn(),
      toggleCanvasFocusMode: vi.fn(),
      ensureBrowserHidden:
        workspaceEnsureBrowserHiddenMocks[
          workspaceId as keyof typeof workspaceEnsureBrowserHiddenMocks
        ],
      confirmBrowserRestored:
        workspaceConfirmBrowserRestoredMocks[
          workspaceId as keyof typeof workspaceConfirmBrowserRestoredMocks
        ],
      confirmBrowserLayoutApplied:
        workspaceConfirmBrowserLayoutAppliedMocks[
          workspaceId as keyof typeof workspaceConfirmBrowserLayoutAppliedMocks
        ],
      handleBrowserRestoreFailure:
        workspaceHandleBrowserRestoreFailureMocks[
          workspaceId as keyof typeof workspaceHandleBrowserRestoreFailureMocks
        ],
      handleBrowserLayoutApplyFailure:
        workspaceHandleBrowserLayoutApplyFailureMocks[
          workspaceId as keyof typeof workspaceHandleBrowserLayoutApplyFailureMocks
        ],
      flushPendingLayoutSave:
        workspaceFlushLayoutMocks[workspaceId as keyof typeof workspaceFlushLayoutMocks],
    }));

    render(<WorkspaceContainer />);

    expect(sidebarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-3",
        isVisible: false,
      }),
    );
    expect(panelLayoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-3",
        hasSecondaryContent: true,
        browserVisible: false,
        defaultPrimarySize: 100,
      }),
    );
    expect(browserPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: undefined,
        visible: false,
      }),
    );
    const activeSidebarShell = screen.getByTestId("sidebar-workspace-3").parentElement;
    expect(activeSidebarShell).toHaveClass("workspace-sidebar-shell--hidden");
    expect(activeSidebarShell).toHaveAttribute("aria-hidden", "true");
    expect(activeSidebarShell).toHaveAttribute("inert");
    expect(workspaceEnsureBrowserHiddenMocks["workspace-3"]).toHaveBeenCalledTimes(1);
  });

  it("moves DOM focus out of the sidebar when the boards panel is hidden programmatically", async () => {
    let activeBoardsVisible = true;
    useWorkspaceLayoutMock.mockImplementation((workspaceId: string) => ({
      layout: {
        primaryPanelSize: workspacePrimarySizes[workspaceId as keyof typeof workspacePrimarySizes],
        lastVisiblePrimaryPanelSize: workspacePrimarySizes[workspaceId as keyof typeof workspacePrimarySizes],
        boardsVisible: workspaceId === "workspace-3" ? activeBoardsVisible : true,
        browserVisible: true,
        activeBoardId: null,
      },
      isLoaded: true,
      updatePanelSize: vi.fn(),
      updateActiveBoard:
        workspaceUpdateActiveBoardMocks[
          workspaceId as keyof typeof workspaceUpdateActiveBoardMocks
        ],
      setBoardsVisible:
        workspaceSetBoardsVisibleMocks[
          workspaceId as keyof typeof workspaceSetBoardsVisibleMocks
        ],
      toggleBoardsVisible: vi.fn(),
      setBrowserVisible:
        workspaceSetBrowserVisibleMocks[
          workspaceId as keyof typeof workspaceSetBrowserVisibleMocks
        ],
      toggleBrowserVisible: vi.fn(),
      setBothPanelsVisible: vi.fn(),
      toggleCanvasFocusMode: vi.fn(),
      ensureBrowserHidden:
        workspaceEnsureBrowserHiddenMocks[
          workspaceId as keyof typeof workspaceEnsureBrowserHiddenMocks
        ],
      confirmBrowserRestored:
        workspaceConfirmBrowserRestoredMocks[
          workspaceId as keyof typeof workspaceConfirmBrowserRestoredMocks
        ],
      confirmBrowserLayoutApplied:
        workspaceConfirmBrowserLayoutAppliedMocks[
          workspaceId as keyof typeof workspaceConfirmBrowserLayoutAppliedMocks
        ],
      handleBrowserRestoreFailure:
        workspaceHandleBrowserRestoreFailureMocks[
          workspaceId as keyof typeof workspaceHandleBrowserRestoreFailureMocks
        ],
      handleBrowserLayoutApplyFailure:
        workspaceHandleBrowserLayoutApplyFailureMocks[
          workspaceId as keyof typeof workspaceHandleBrowserLayoutApplyFailureMocks
        ],
      flushPendingLayoutSave:
        workspaceFlushLayoutMocks[workspaceId as keyof typeof workspaceFlushLayoutMocks],
    }));

    const { rerender } = render(<WorkspaceContainer />);
    const activePage = screen.getByTestId("workspace-page-motion-workspace-3");
    within(activePage).getByRole("button", { name: "Inside sidebar" }).focus();

    activeBoardsVisible = false;
    rerender(<WorkspaceContainer />);

    await waitFor(() => {
      expect(
        within(screen.getByTestId("workspace-page-motion-workspace-3")).getByRole("button", {
          name: "Show boards",
        }),
      ).toHaveFocus();
    });
  });

  it("hides the native browser view when switching to a workspace with a persisted hidden browser", async () => {
    useWorkspaceLayoutMock.mockImplementation((workspaceId: string) => ({
      layout: {
        primaryPanelSize: workspaceId === "workspace-5" ? 100 : workspacePrimarySizes[workspaceId as keyof typeof workspacePrimarySizes],
        lastVisiblePrimaryPanelSize: workspacePrimarySizes[workspaceId as keyof typeof workspacePrimarySizes],
        boardsVisible: true,
        browserVisible: workspaceId !== "workspace-5",
        activeBoardId: null,
      },
      isLoaded: true,
      updatePanelSize: vi.fn(),
      updateActiveBoard:
        workspaceUpdateActiveBoardMocks[
          workspaceId as keyof typeof workspaceUpdateActiveBoardMocks
        ],
      setBoardsVisible:
        workspaceSetBoardsVisibleMocks[
          workspaceId as keyof typeof workspaceSetBoardsVisibleMocks
        ],
      toggleBoardsVisible: vi.fn(),
      setBrowserVisible:
        workspaceSetBrowserVisibleMocks[
          workspaceId as keyof typeof workspaceSetBrowserVisibleMocks
        ],
      toggleBrowserVisible: vi.fn(),
      setBothPanelsVisible: vi.fn(),
      toggleCanvasFocusMode: vi.fn(),
      ensureBrowserHidden:
        workspaceEnsureBrowserHiddenMocks[
          workspaceId as keyof typeof workspaceEnsureBrowserHiddenMocks
        ],
      confirmBrowserRestored:
        workspaceConfirmBrowserRestoredMocks[
          workspaceId as keyof typeof workspaceConfirmBrowserRestoredMocks
        ],
      confirmBrowserLayoutApplied:
        workspaceConfirmBrowserLayoutAppliedMocks[
          workspaceId as keyof typeof workspaceConfirmBrowserLayoutAppliedMocks
        ],
      handleBrowserRestoreFailure:
        workspaceHandleBrowserRestoreFailureMocks[
          workspaceId as keyof typeof workspaceHandleBrowserRestoreFailureMocks
        ],
      handleBrowserLayoutApplyFailure:
        workspaceHandleBrowserLayoutApplyFailureMocks[
          workspaceId as keyof typeof workspaceHandleBrowserLayoutApplyFailureMocks
        ],
      flushPendingLayoutSave:
        workspaceFlushLayoutMocks[workspaceId as keyof typeof workspaceFlushLayoutMocks],
    }));

    render(<WorkspaceContainer />);

    act(() => {
      useAppStore.setState({ activeWorkspaceId: "workspace-5" });
    });

    await waitFor(() => {
      expect(workspaceEnsureBrowserHiddenMocks["workspace-5"]).toHaveBeenCalledTimes(1);
    });
  });

  it("moves logical focus out of the browser before hiding the browser panel", () => {
    useAppStore.setState({ focus: "browser" });

    render(<WorkspaceContainer />);

    const activePage = screen.getByTestId("workspace-page-motion-workspace-3");
    const hideBrowserButton = within(activePage).getByRole("button", {
      name: "Hide browser",
    });

    fireEvent.click(hideBrowserButton);

    expect(useAppStore.getState().focus).toBe("global");
    expect(hideBrowserButton).toHaveFocus();
    expect(workspaceSetBrowserVisibleMocks["workspace-3"]).toHaveBeenCalledWith(false);
  });

  it("moves logical focus out of the browser when panel layout collapses the browser", () => {
    useAppStore.setState({ focus: "browser" });

    render(<WorkspaceContainer />);

    const activePanelCall = panelLayoutMock.mock.calls.find(
      ([props]) => props.workspaceId === "workspace-3",
    )?.[0] as { onLayoutChange?: (sizes: { primary?: number; secondary?: number }) => void };

    act(() => {
      activePanelCall.onLayoutChange?.({ primary: 100, secondary: 0 });
    });

    expect(useAppStore.getState().focus).toBe("global");
    expect(
      within(screen.getByTestId("workspace-page-motion-workspace-3")).getByRole("button", {
        name: "Hide browser",
      }),
    ).toHaveFocus();
    expect(workspaceSetBrowserVisibleMocks["workspace-3"]).toHaveBeenCalledWith(false);
  });

  it("requests a rendered split reset when layout collapse cannot hide the native browser", async () => {
    workspaceSetBrowserVisibleMocks["workspace-3"].mockResolvedValueOnce(false);

    render(<WorkspaceContainer />);

    const activePanelCall = panelLayoutMock.mock.calls.find(
      ([props]) => props.workspaceId === "workspace-3",
    )?.[0] as { onLayoutChange?: (sizes: { primary?: number; secondary?: number }) => void };

    act(() => {
      activePanelCall.onLayoutChange?.({ primary: 100, secondary: 0 });
    });

    await waitFor(() => {
      const activePanelCalls = panelLayoutMock.mock.calls
        .map(([props]) => props)
        .filter((props) => props.workspaceId === "workspace-3");

      expect(activePanelCalls[activePanelCalls.length - 1]).toEqual(
        expect.objectContaining({
          browserVisible: true,
          defaultPrimarySize: 52,
          layoutResetVersion: 1,
        }),
      );
    });
  });

  it("keeps the outgoing workspace split layout during its exit animation without live browser ownership", () => {
    vi.useFakeTimers();

    try {
      render(<WorkspaceContainer />);

      act(() => {
        useAppStore.setState({ activeWorkspaceId: "workspace-5" });
      });

      expect(screen.getByTestId("panel-layout-secondary-workspace-3")).toContainElement(
        screen.getByTestId("browser-panel-shell"),
      );
      expect(screen.getByTestId("panel-layout-secondary-workspace-5")).toContainElement(
        screen.getByTestId("browser-panel-live"),
      );
      expect(browserPanelMock).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "shell" }),
      );
      expect(browserPanelMock).toHaveBeenCalledWith(
        expect.objectContaining({ mode: undefined }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves the outgoing workspace during the active-workspace handoff frame", () => {
    vi.useFakeTimers();

    try {
      render(<WorkspaceContainer />);

      flushSync(() => {
        useAppStore.setState({ activeWorkspaceId: "workspace-5" });
      });

      expect(screen.getByTestId("workspace-page-motion-workspace-3")).toBeInTheDocument();
      expect(screen.getByTestId("workspace-page-motion-workspace-5")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides outgoing workspace pages from the accessibility tree during exit transitions", () => {
    vi.useFakeTimers();

    try {
      render(<WorkspaceContainer />);

      act(() => {
        useAppStore.setState({ activeWorkspaceId: "workspace-5" });
      });

      expect(screen.getByTestId("workspace-page-motion-workspace-3")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      expect(screen.getByTestId("workspace-page-motion-workspace-3")).toHaveAttribute("inert");
      expect(screen.getByTestId("workspace-page-motion-workspace-5")).toHaveAttribute(
        "aria-hidden",
        "false",
      );
      expect(screen.getByTestId("workspace-page-motion-workspace-5")).not.toHaveAttribute("inert");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the outgoing workspace mounted only until its exit animation completes", () => {
    vi.useFakeTimers();

    try {
      render(<WorkspaceContainer />);

      expect(screen.queryByTestId("sidebar-workspace-5")).not.toBeInTheDocument();
      expect(useWorkspaceLayoutMock).not.toHaveBeenCalledWith("workspace-5");

      act(() => {
        useAppStore.setState({ activeWorkspaceId: "workspace-5" });
      });

      expect(screen.getByTestId("sidebar-workspace-5")).toBeInTheDocument();
      expect(screen.getByTestId("canvas-workspace-5")).toBeInTheDocument();
      expect(useWorkspaceLayoutMock).toHaveBeenCalledWith("workspace-5");

      act(() => {
        useAppStore.setState({ activeWorkspaceId: "workspace-3" });
      });

      expect(screen.getByTestId("sidebar-workspace-5")).toBeInTheDocument();
      expect(screen.getByTestId("canvas-workspace-5")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(screen.queryByTestId("sidebar-workspace-5")).not.toBeInTheDocument();
      expect(screen.queryByTestId("canvas-workspace-5")).not.toBeInTheDocument();
      expect(screen.queryByTestId("workspace-page-motion-workspace-5")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps only the active workspace neighborhood mounted after a distant activation", () => {
    vi.useFakeTimers();

    try {
      render(<WorkspaceContainer />);

      act(() => {
        useAppStore.setState({ activeWorkspaceId: "workspace-5" });
      });

      expect(screen.queryByTestId("sidebar-workspace-2")).not.toBeInTheDocument();
      expect(screen.queryByTestId("canvas-workspace-2")).not.toBeInTheDocument();
      expect(screen.getByTestId("sidebar-workspace-3")).toBeInTheDocument();
      expect(screen.getByTestId("canvas-workspace-3")).toBeInTheDocument();
      expect(screen.getByTestId("workspace-page-motion-workspace-3")).not.toHaveClass(
        "hidden",
      );
      expect(screen.getByTestId("sidebar-workspace-4")).toBeInTheDocument();
      expect(screen.getByTestId("canvas-workspace-4")).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-workspace-5")).toBeInTheDocument();
      expect(screen.getByTestId("canvas-workspace-5")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(screen.queryByTestId("sidebar-workspace-3")).not.toBeInTheDocument();
      expect(screen.queryByTestId("canvas-workspace-3")).not.toBeInTheDocument();
      expect(screen.queryByTestId("workspace-page-motion-workspace-3")).not.toBeInTheDocument();
      expect(screen.getByTestId("sidebar-workspace-4")).toBeInTheDocument();
      expect(screen.getByTestId("canvas-workspace-4")).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-workspace-5")).toBeInTheDocument();
      expect(screen.getByTestId("canvas-workspace-5")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("animates a first-time distant activation from the correct side", () => {
    render(<WorkspaceContainer />);

    act(() => {
      useAppStore.setState({ activeWorkspaceId: "workspace-5" });
    });

    expect(motionDivMock.mock.calls).toContainEqual([
      expect.objectContaining({
        "data-workspace-id": "workspace-5",
        animate: "center",
        initial: "right",
      }),
    ]);
  });

  it("keeps the previous workspace rendered until a newly active workspace exists, then animates it in", () => {
    render(<WorkspaceContainer />);

    act(() => {
      useAppStore.setState({ activeWorkspaceId: "workspace-6" });
    });

    expect(screen.getByTestId("workspace-page-motion-workspace-3")).not.toHaveClass("hidden");
    expect(screen.queryByTestId("sidebar-workspace-6")).not.toBeInTheDocument();

    act(() => {
      useAppStore.setState((state) => ({
        workspaces: [
          ...state.workspaces,
          { id: "workspace-6", name: "New", icon: "✨", position: 5 },
        ],
      }));
    });

    expect(motionDivMock.mock.calls).toContainEqual([
      expect.objectContaining({
        "data-workspace-id": "workspace-6",
        animate: "center",
        initial: "right",
      }),
    ]);
    expect(screen.getByTestId("workspace-page-motion-workspace-3")).not.toHaveClass("hidden");
    expect(screen.getByTestId("sidebar-workspace-6")).toBeInTheDocument();
  });

  it("requests layout state only for mounted workspaces and skips mounted pages that are still loading", () => {
    useWorkspaceLayoutMock.mockImplementation((workspaceId: string) => {
      if (workspaceId === "workspace-4") {
        return {
          layout: {
            primaryPanelSize: 60,
            lastVisiblePrimaryPanelSize: 60,
            boardsVisible: true,
            browserVisible: true,
            activeBoardId: null,
          },
          isLoaded: false,
          updatePanelSize: vi.fn(),
          updateActiveBoard: vi.fn(),
        };
      }

      return {
          layout: {
            primaryPanelSize:
              workspacePrimarySizes[workspaceId as keyof typeof workspacePrimarySizes],
            lastVisiblePrimaryPanelSize:
              workspacePrimarySizes[workspaceId as keyof typeof workspacePrimarySizes],
            boardsVisible: true,
            browserVisible: true,
            activeBoardId: null,
          },
          isLoaded: true,
        updatePanelSize: vi.fn(),
        updateActiveBoard: vi.fn(),
      };
    });

    render(<WorkspaceContainer />);

    expect(useWorkspaceLayoutMock).toHaveBeenNthCalledWith(1, "workspace-2");
    expect(useWorkspaceLayoutMock).toHaveBeenNthCalledWith(2, "workspace-3");
    expect(useWorkspaceLayoutMock).toHaveBeenNthCalledWith(3, "workspace-4");
    expect(useWorkspaceLayoutMock).not.toHaveBeenCalledWith("workspace-1");
    expect(useWorkspaceLayoutMock).not.toHaveBeenCalledWith("workspace-5");
    expect(screen.getByTestId("sidebar-workspace-2")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-workspace-3")).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-workspace-4")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-workspace-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-workspace-5")).not.toBeInTheDocument();
    expect(screen.getByTestId("canvas-workspace-2")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-workspace-3")).toBeInTheDocument();
    expect(screen.queryByTestId("canvas-workspace-4")).not.toBeInTheDocument();
    expect(screen.queryByTestId("canvas-workspace-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("canvas-workspace-5")).not.toBeInTheDocument();
  });

  it("tracks slide direction from workspace index changes", () => {
    render(<WorkspaceContainer />);

    expect(screen.getByTestId("workspace-overlay")).toHaveAttribute("data-custom", "0");

    act(() => {
      useAppStore.setState({ activeWorkspaceId: "workspace-4" });
    });

    expect(screen.getByTestId("workspace-overlay")).toHaveAttribute("data-custom", "1");

    act(() => {
      useAppStore.setState({ activeWorkspaceId: "workspace-2" });
    });

    expect(screen.getByTestId("workspace-overlay")).toHaveAttribute("data-custom", "-1");
  });

  it("animates workspace page content instead of only the overlay", () => {
    render(<WorkspaceContainer />);

    expect(screen.getByTestId("workspace-page-motion-workspace-2")).toHaveAttribute(
      "data-has-variants",
      "true",
    );
    expect(screen.getByTestId("workspace-page-motion-workspace-3")).toHaveAttribute(
      "data-has-variants",
      "true",
    );
    expect(screen.getByTestId("workspace-page-motion-workspace-4")).toHaveAttribute(
      "data-has-variants",
      "true",
    );
  });

  it("updates canvas interactivity when the active workspace changes", () => {
    render(<WorkspaceContainer />);

    act(() => {
      useAppStore.setState({ activeWorkspaceId: "workspace-4" });
    });

    expect(canvasPanelMock).toHaveBeenCalledWith({
      workspaceId: "workspace-4",
      isInteractive: true,
    });
  });

  it("flushes layout persistence when a mounted workspace becomes inactive", () => {
    render(<WorkspaceContainer />);

    act(() => {
      useAppStore.setState({ activeWorkspaceId: "workspace-4" });
    });

    expect(workspaceFlushLayoutMocks["workspace-3"]).toHaveBeenCalledTimes(1);
    expect(workspaceFlushLayoutMocks["workspace-2"]).not.toHaveBeenCalled();
    expect(workspaceFlushLayoutMocks["workspace-4"]).not.toHaveBeenCalled();
  });

  it("dispatches a resize event when the active workspace slide completes", () => {
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");

    render(<WorkspaceContainer />);

    act(() => {
      useAppStore.setState({ activeWorkspaceId: "workspace-4" });
    });

    const motionDivProps = [...motionDivMock.mock.calls].map(([props]) => props as MotionDivProps);
    const activePageCall = [...motionDivProps]
      .reverse()
      .find((props: MotionDivProps) => props["data-workspace-id"] === "workspace-4");

    expect(activePageCall?.onAnimationComplete).toEqual(expect.any(Function));

    act(() => {
      activePageCall?.onAnimationComplete?.();
    });

    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.any(Event));
    const lastDispatchCall = dispatchEventSpy.mock.calls[dispatchEventSpy.mock.calls.length - 1];
    expect(lastDispatchCall?.[0].type).toBe("resize");
  });

  it("gives each workspace canvas area a fill-height flex shell", () => {
    render(<WorkspaceContainer />);

    const activePage = screen
      .getByTestId("sidebar-workspace-3")
      .closest('[data-testid="workspace-page-motion-workspace-3"]');

    expect(activePage).not.toBeNull();

    const main = within(activePage as HTMLElement).getByRole("main");
    expect(main).toHaveStyle({
      display: "flex",
      flex: "1",
      minHeight: "0px",
      overflow: "hidden",
      position: "relative",
    });
  });
});
