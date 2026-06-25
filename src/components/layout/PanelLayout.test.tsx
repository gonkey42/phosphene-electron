import type { CSSProperties, ReactNode } from "react";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { groupMock, panelMock, separatorMock, groupSetLayoutMock, groupGetLayoutMock } = vi.hoisted(() => ({
  groupMock: vi.fn(),
  panelMock: vi.fn(),
  separatorMock: vi.fn(),
  groupSetLayoutMock: vi.fn((layout: Record<string, number>) => layout),
  groupGetLayoutMock: vi.fn(() => ({})),
}));
const { setFocusMock } = vi.hoisted(() => ({
  setFocusMock: vi.fn(),
}));

vi.mock("react-resizable-panels", () => ({
  Group: ({
    children,
    className,
    defaultLayout,
    groupRef,
    id,
    onLayoutChanged,
    orientation,
  }: {
    children: ReactNode;
    className?: string;
    defaultLayout?: Record<string, number>;
    groupRef?: {
      current: {
        getLayout: () => Record<string, number>;
        setLayout: (layout: Record<string, number>) => Record<string, number>;
      } | null;
    };
    id?: string;
    onLayoutChanged?: (layout: Record<string, number>) => void;
    orientation?: string;
  }) => {
    if (groupRef) {
      groupRef.current = {
        getLayout: groupGetLayoutMock,
        setLayout: (layout: Record<string, number>) => {
          const appliedLayout = groupSetLayoutMock(layout);
          onLayoutChanged?.(layout);
          return appliedLayout;
        },
      };
    }
    groupMock({ className, defaultLayout, groupRef, id, onLayoutChanged, orientation });
    return (
      <div className={className} data-testid="panel-group">
        {children}
      </div>
    );
  },
  Panel: ({
    children,
    className,
    defaultSize,
    collapsedSize,
    collapsible,
    disabled,
    id,
    minSize,
    style,
  }: {
    children: ReactNode;
    className?: string;
    defaultSize?: number;
    collapsedSize?: number | string;
    collapsible?: boolean;
    disabled?: boolean;
    id?: string;
    minSize?: number | string;
    style?: CSSProperties;
  }) => {
    panelMock({ className, collapsedSize, collapsible, defaultSize, disabled, id, minSize, style });
    return (
      <div className={className} data-testid={`panel-${id ?? "unknown"}`} style={style}>
        {children}
      </div>
    );
  },
  Separator: ({
    "aria-controls": ariaControls,
    className,
    disabled,
    hidden,
  }: {
    "aria-controls"?: string;
    className?: string;
    disabled?: boolean;
    hidden?: boolean;
  }) => {
    separatorMock({ ariaControls, className, disabled, hidden });
    return <div aria-controls={ariaControls} className={className} data-testid="panel-separator" hidden={hidden} />;
  },
  useGroupRef: () => ({ current: null }),
}));

vi.mock("../../platform/desktop-api", () => ({
  browser: {
    attach: vi.fn(),
    setBounds: vi.fn(),
    hide: vi.fn(),
    getState: vi.fn(),
    navigate: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    reload: vi.fn(),
    destroy: vi.fn(),
    onStateChanged: vi.fn(() => () => undefined),
  },
}));

vi.mock("../../stores/app-store", () => ({
  useAppStore: (
    selector?: (state: { resolvedTheme: "light" | "dark"; setFocus: (focus: string) => void }) => unknown,
  ) =>
    selector
      ? selector({
          resolvedTheme: "light",
          setFocus: setFocusMock,
        })
      : {
          resolvedTheme: "light",
          setFocus: setFocusMock,
        },
}));

import { PanelLayout } from "./PanelLayout";
import { BrowserPanel } from "../browser/BrowserPanel";

describe("PanelLayout", () => {
  beforeEach(() => {
    groupMock.mockReset();
    panelMock.mockReset();
    separatorMock.mockReset();
    groupSetLayoutMock.mockClear();
    groupGetLayoutMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders only the primary content at full width when secondary content is absent", () => {
    const onLayoutApplied = vi.fn();
    const { container } = render(
      <PanelLayout
        workspaceId="workspace-1"
        primaryContent={<div>Primary content</div>}
        onLayoutApplied={onLayoutApplied}
      />,
    );

    expect(screen.getByText("Primary content")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-group")).not.toBeInTheDocument();
    expect(screen.queryByTestId("panel-separator")).not.toBeInTheDocument();

    const primaryShell = container.querySelector(".panel-primary");
    expect(primaryShell).not.toBeNull();
    expect(primaryShell).toHaveStyle({
      flex: "1",
      position: "relative",
    });
    expect(onLayoutApplied).not.toHaveBeenCalled();
  });

  it("renders a horizontal split layout with the configured default panel sizes", () => {
    render(
      <PanelLayout
        workspaceId="workspace-1"
        primaryContent={<div>Primary content</div>}
        secondaryContent={<div>Secondary content</div>}
      />,
    );

    expect(groupMock).toHaveBeenCalledWith(
      expect.objectContaining({
        className: "panel-layout",
        defaultLayout: {
          "workspace-1-primary": 75,
          "workspace-1-secondary": 25,
        },
        id: "workspace-layout-workspace-1",
        orientation: "horizontal",
      }),
    );
    expect(panelMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        className: "panel-primary",
        defaultSize: "75%",
        id: "workspace-1-primary",
        minSize: "30%",
        style: expect.objectContaining({ position: "relative" }),
      }),
    );
    expect(panelMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        className: "panel-secondary",
        collapsedSize: "0%",
        collapsible: true,
        defaultSize: "25%",
        id: "workspace-1-secondary",
        minSize: "15%",
      }),
    );
    expect(separatorMock).toHaveBeenCalledWith({
      ariaControls: "workspace-1-secondary",
      className: "panel-resize-handle",
      disabled: false,
      hidden: false,
    });
    expect(screen.getByText("Primary content")).toBeInTheDocument();
    expect(screen.getByText("Secondary content")).toBeInTheDocument();
  });

  it("forwards panel layout changes to the resizable group", () => {
    const onLayoutChange = vi.fn();

    render(
      <PanelLayout
        workspaceId="workspace-1"
        primaryContent={<div>Primary content</div>}
        secondaryContent={<div>Secondary content</div>}
        onLayoutChange={onLayoutChange}
      />,
    );

    const onLayoutChanged = groupMock.mock.calls[0]?.[0].onLayoutChanged as
      | ((layout: Record<string, number>) => void)
      | undefined;

    onLayoutChanged?.({
      "workspace-1-primary": 62,
      "workspace-1-secondary": 38,
    });

    expect(onLayoutChange).toHaveBeenCalledWith({ primary: 62, secondary: 38 });
  });

  it("keeps split mode with the browser collapsed to 0px and hides the handle", () => {
    const { rerender } = render(
      <PanelLayout
        workspaceId="workspace-1"
        browserVisible
        primaryContent={<div>Primary content</div>}
        secondaryContent={<div>Secondary content</div>}
      />,
    );

    expect(groupSetLayoutMock).toHaveBeenLastCalledWith({
      "workspace-1-primary": 75,
      "workspace-1-secondary": 25,
    });

    rerender(
      <PanelLayout
        workspaceId="workspace-1"
        browserVisible={false}
        primaryContent={<div>Primary content</div>}
        secondaryContent={<div>Secondary content</div>}
      />,
    );

    expect(screen.getByTestId("panel-group")).toBeInTheDocument();
    expect(groupSetLayoutMock).toHaveBeenLastCalledWith({
      "workspace-1-primary": 100,
      "workspace-1-secondary": 0,
    });
    expect(panelMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        defaultSize: "100%",
        id: "workspace-1-primary",
      }),
    );
    expect(panelMock).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        collapsedSize: "0%",
        collapsible: true,
        defaultSize: "0%",
        disabled: true,
        id: "workspace-1-secondary",
      }),
    );
    expect(separatorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        disabled: true,
        hidden: true,
      }),
    );
  });

  it("reapplies the current split when the reset version changes", () => {
    const { rerender } = render(
      <PanelLayout
        workspaceId="workspace-1"
        browserVisible
        defaultPrimarySize={58}
        layoutResetVersion={0}
        primaryContent={<div>Primary content</div>}
        secondaryContent={<div>Secondary content</div>}
      />,
    );

    const callsBeforeReset = groupSetLayoutMock.mock.calls.length;

    rerender(
      <PanelLayout
        workspaceId="workspace-1"
        browserVisible
        defaultPrimarySize={58}
        layoutResetVersion={1}
        primaryContent={<div>Primary content</div>}
        secondaryContent={<div>Secondary content</div>}
      />,
    );

    expect(groupSetLayoutMock.mock.calls.length).toBe(callsBeforeReset + 1);
    expect(groupSetLayoutMock).toHaveBeenLastCalledWith({
      "workspace-1-primary": 58,
      "workspace-1-secondary": 42,
    });
  });

  it("reports programmatic layout apply failures without throwing", () => {
    const onLayoutApplied = vi.fn();
    const onLayoutApplyError = vi.fn();
    const layoutError = new Error("set layout failed");
    groupSetLayoutMock.mockImplementationOnce(() => {
      throw layoutError;
    });

    render(
      <PanelLayout
        workspaceId="workspace-1"
        browserVisible={false}
        primaryContent={<div>Primary content</div>}
        secondaryContent={<div>Secondary content</div>}
        onLayoutApplied={onLayoutApplied}
        onLayoutApplyError={onLayoutApplyError}
      />,
    );

    expect(onLayoutApplied).not.toHaveBeenCalled();
    expect(onLayoutApplyError).toHaveBeenCalledWith(layoutError);
  });

  it("does not report layout changes emitted by programmatic layout application", () => {
    const onLayoutChange = vi.fn();

    render(
      <PanelLayout
        workspaceId="workspace-1"
        browserVisible={false}
        primaryContent={<div>Primary content</div>}
        secondaryContent={<div>Secondary content</div>}
        onLayoutChange={onLayoutChange}
      />,
    );

    expect(groupSetLayoutMock).toHaveBeenCalledWith({
      "workspace-1-primary": 100,
      "workspace-1-secondary": 0,
    });
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  it("reports an apply error when the resizable group returns a mismatched layout", () => {
    const onLayoutApplied = vi.fn();
    const onLayoutApplyError = vi.fn();
    groupSetLayoutMock.mockReturnValueOnce({
      "workspace-1-primary": 75,
      "workspace-1-secondary": 25,
    });

    render(
      <PanelLayout
        workspaceId="workspace-1"
        browserVisible={false}
        primaryContent={<div>Primary content</div>}
        secondaryContent={<div>Secondary content</div>}
        onLayoutApplied={onLayoutApplied}
        onLayoutApplyError={onLayoutApplyError}
      />,
    );

    expect(onLayoutApplied).not.toHaveBeenCalled();
    expect(onLayoutApplyError).toHaveBeenCalledWith(expect.any(Error));
    expect(onLayoutApplyError.mock.calls[0]?.[0]).toMatchObject({
      message: "Browser panel layout did not apply",
    });
  });

  it("keeps the exiting shell browser panel full-bleed inside the secondary panel", () => {
    const { container } = render(
      <PanelLayout
        workspaceId="workspace-1"
        primaryContent={<div>Primary content</div>}
        secondaryContent={<BrowserPanel mode="shell" />}
      />,
    );

    const secondaryPanel = screen.getByTestId("panel-workspace-1-secondary");
    const shellPanel = screen.getByTestId("browser-panel-shell");

    expect(secondaryPanel).toHaveClass("panel-secondary");
    expect(secondaryPanel.firstElementChild).toBe(shellPanel);
    expect(shellPanel).toHaveClass("browser-panel--shell", "browser-panel--full-bleed");
    expect(shellPanel.querySelector(".browser-panel__controls--shell")).toBeInTheDocument();
    expect(shellPanel.querySelector(".browser-panel__host--shell")).toBeInTheDocument();
    expect(container.querySelector(".browser-panel__chrome")).not.toBeInTheDocument();
  });
});
