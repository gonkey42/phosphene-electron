import type { HTMLAttributes, ReactNode } from "react";

import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sidebarMock, canvasPanelMock, motionDivMock, panelLayoutMock } = vi.hoisted(() => ({
  sidebarMock: vi.fn(),
  canvasPanelMock: vi.fn(),
  motionDivMock: vi.fn(),
  panelLayoutMock: vi.fn(),
}));

const { useWorkspaceLayoutMock } = vi.hoisted(() => ({
  useWorkspaceLayoutMock: vi.fn(),
}));

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
  }: {
    workspaceId?: string;
    onBoardSelect?: (boardId: string | null) => void;
  }) => {
    sidebarMock({ workspaceId, onBoardSelect });
    return <aside data-testid={`sidebar-${workspaceId ?? "none"}`} />;
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

vi.mock("../layout/PanelLayout", () => ({
  PanelLayout: ({
    workspaceId,
    primaryContent,
    secondaryContent,
    defaultPrimarySize,
    onLayoutChange,
  }: {
    workspaceId: string;
    primaryContent: ReactNode;
    secondaryContent?: ReactNode;
    defaultPrimarySize?: number;
    onLayoutChange?: (sizes: number[]) => void;
  }) => {
    panelLayoutMock({
      workspaceId,
      hasSecondaryContent: Boolean(secondaryContent),
      defaultPrimarySize,
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
    useWorkspaceLayoutMock.mockReset();
    workspaceUpdateActiveBoardMocks["workspace-1"].mockReset();
    workspaceUpdateActiveBoardMocks["workspace-2"].mockReset();
    workspaceUpdateActiveBoardMocks["workspace-3"].mockReset();
    workspaceUpdateActiveBoardMocks["workspace-4"].mockReset();
    workspaceUpdateActiveBoardMocks["workspace-5"].mockReset();
    workspaceUpdateActiveBoardMocks["workspace-6"].mockReset();
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
        activeBoardId: null,
      },
      isLoaded: true,
      updatePanelSize: vi.fn(),
      updateActiveBoard:
        workspaceUpdateActiveBoardMocks[
          workspaceId as keyof typeof workspaceUpdateActiveBoardMocks
        ],
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
    });
    expect(sidebarMock).toHaveBeenNthCalledWith(2, {
      workspaceId: "workspace-3",
      onBoardSelect: workspaceUpdateActiveBoardMocks["workspace-3"],
    });
    expect(sidebarMock).toHaveBeenNthCalledWith(3, {
      workspaceId: "workspace-4",
      onBoardSelect: workspaceUpdateActiveBoardMocks["workspace-4"],
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

  it("routes each mounted workspace canvas through a panel layout with secondary placeholder content", () => {
    render(<WorkspaceContainer />);

    expect(panelLayoutMock).toHaveBeenCalledTimes(3);
    expect(panelLayoutMock).toHaveBeenNthCalledWith(1, {
      workspaceId: "workspace-2",
      hasSecondaryContent: true,
      defaultPrimarySize: 42,
      onLayoutChange: expect.any(Function),
    });
    expect(panelLayoutMock).toHaveBeenNthCalledWith(2, {
      workspaceId: "workspace-3",
      hasSecondaryContent: true,
      defaultPrimarySize: 52,
      onLayoutChange: expect.any(Function),
    });
    expect(panelLayoutMock).toHaveBeenNthCalledWith(3, {
      workspaceId: "workspace-4",
      hasSecondaryContent: true,
      defaultPrimarySize: 60,
      onLayoutChange: expect.any(Function),
    });

    expect(screen.queryByTestId("panel-layout-workspace-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("panel-layout-workspace-2")).toBeInTheDocument();
    expect(screen.getByTestId("panel-layout-workspace-3")).toBeInTheDocument();
    expect(screen.getByTestId("panel-layout-workspace-4")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-layout-workspace-5")).not.toBeInTheDocument();
    expect(screen.getAllByText("Secondary panel")).toHaveLength(3);
    expect(screen.getAllByText("Widgets and browser will go here")).toHaveLength(3);
  });

  it("lazy-mounts distant workspaces on first activation and keeps them mounted afterwards", () => {
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

      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(screen.getByTestId("sidebar-workspace-5")).toBeInTheDocument();
      expect(screen.getByTestId("canvas-workspace-5")).toBeInTheDocument();
      expect(screen.getByTestId("workspace-page-motion-workspace-5")).toHaveClass("hidden");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps previously mounted workspaces sticky after they fall out of range", () => {
    vi.useFakeTimers();

    try {
      render(<WorkspaceContainer />);

      act(() => {
        useAppStore.setState({ activeWorkspaceId: "workspace-5" });
      });

      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(screen.getByTestId("sidebar-workspace-2")).toBeInTheDocument();
      expect(screen.getByTestId("canvas-workspace-2")).toBeInTheDocument();
      expect(screen.getByTestId("workspace-page-motion-workspace-2")).toHaveClass("hidden");
      expect(screen.getByTestId("sidebar-workspace-3")).toBeInTheDocument();
      expect(screen.getByTestId("canvas-workspace-3")).toBeInTheDocument();
      expect(screen.getByTestId("workspace-page-motion-workspace-3")).toHaveClass("hidden");
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
