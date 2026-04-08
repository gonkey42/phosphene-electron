import type { CSSProperties, ReactNode } from "react";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { groupMock, panelMock, separatorMock } = vi.hoisted(() => ({
  groupMock: vi.fn(),
  panelMock: vi.fn(),
  separatorMock: vi.fn(),
}));

vi.mock("react-resizable-panels", () => ({
  Group: ({
    children,
    className,
    id,
    onLayoutChanged,
    orientation,
  }: {
    children: ReactNode;
    className?: string;
    id?: string;
    onLayoutChanged?: () => void;
    orientation?: string;
  }) => {
    groupMock({ className, id, onLayoutChanged, orientation });
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
    id,
    minSize,
    style,
  }: {
    children: ReactNode;
    className?: string;
    defaultSize?: number;
    id?: string;
    minSize?: number;
    style?: CSSProperties;
  }) => {
    panelMock({ className, defaultSize, id, minSize, style });
    return (
      <div className={className} data-testid={`panel-${id ?? "unknown"}`} style={style}>
        {children}
      </div>
    );
  },
  Separator: ({ className }: { className?: string }) => {
    separatorMock({ className });
    return <div className={className} data-testid="panel-separator" />;
  },
}));

import { PanelLayout } from "./PanelLayout";

describe("PanelLayout", () => {
  beforeEach(() => {
    groupMock.mockReset();
    panelMock.mockReset();
    separatorMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders only the primary content at full width when secondary content is absent", () => {
    const { container } = render(
      <PanelLayout workspaceId="workspace-1" primaryContent={<div>Primary content</div>} />,
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
        id: "workspace-layout-workspace-1",
        orientation: "horizontal",
      }),
    );
    expect(panelMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        className: "panel-primary",
        defaultSize: 75,
        id: "primary",
        minSize: 30,
        style: expect.objectContaining({ position: "relative" }),
      }),
    );
    expect(panelMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        className: "panel-secondary",
        defaultSize: 25,
        id: "secondary",
        minSize: 15,
      }),
    );
    expect(separatorMock).toHaveBeenCalledWith({
      className: "panel-resize-handle",
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

    expect(groupMock).toHaveBeenCalledWith(
      expect.objectContaining({
        onLayoutChanged: onLayoutChange,
      }),
    );
  });
});
