import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";

import { Group, Panel, Separator, useGroupRef } from "react-resizable-panels";
import type { Layout } from "react-resizable-panels";

import "./PanelLayout.css";

type PanelLayoutProps = {
  workspaceId: string;
  primaryContent: ReactNode;
  secondaryContent?: ReactNode;
  defaultPrimarySize?: number;
  browserVisible?: boolean;
  layoutResetVersion?: number;
  onLayoutApplied?: () => void;
  onLayoutApplyError?: (error: unknown) => void;
  onLayoutChange?: (sizes: Layout) => void;
};

export function PanelLayout({
  workspaceId,
  primaryContent,
  secondaryContent,
  defaultPrimarySize = 75,
  browserVisible = true,
  layoutResetVersion = 0,
  onLayoutApplied,
  onLayoutApplyError,
  onLayoutChange,
}: PanelLayoutProps) {
  const primaryPanelId = `${workspaceId}-primary`;
  const secondaryPanelId = `${workspaceId}-secondary`;
  const visiblePrimarySize = clampPercent(defaultPrimarySize, 30, 85);
  const primarySize = browserVisible ? visiblePrimarySize : 100;
  const secondarySize = browserVisible ? 100 - visiblePrimarySize : 0;
  const groupRef = useGroupRef();
  const isApplyingLayoutRef = useRef(false);
  const groupLayout = useMemo(
    () => ({
      [primaryPanelId]: primarySize,
      [secondaryPanelId]: secondarySize,
    }),
    [primaryPanelId, primarySize, secondaryPanelId, secondarySize],
  );
  const normalizedLayoutChanged = useCallback(
    (layout: Layout) => {
      if (isApplyingLayoutRef.current) {
        return;
      }

      onLayoutChange?.({
        primary: layout[primaryPanelId] ?? primarySize,
        secondary: layout[secondaryPanelId] ?? secondarySize,
      });
    },
    [onLayoutChange, primaryPanelId, primarySize, secondaryPanelId, secondarySize],
  );

  useEffect(() => {
    const group = groupRef.current;
    if (!group) {
      return;
    }

    try {
      isApplyingLayoutRef.current = true;
      const appliedLayout = group.setLayout(groupLayout);
      isApplyingLayoutRef.current = false;
      if (!areLayoutsEquivalent(appliedLayout, groupLayout)) {
        onLayoutApplyError?.(new Error("Browser panel layout did not apply"));
        return;
      }

      onLayoutApplied?.();
    } catch (error) {
      isApplyingLayoutRef.current = false;
      onLayoutApplyError?.(error);
    }
  }, [groupLayout, groupRef, layoutResetVersion, onLayoutApplied, onLayoutApplyError]);

  if (!secondaryContent) {
    return (
      <div className="panel-layout" style={{ height: "100%", width: "100%" }}>
        <div className="panel-primary" style={{ flex: 1, position: "relative" }}>
          {primaryContent}
        </div>
      </div>
    );
  }

  return (
    <Group
      className="panel-layout"
      defaultLayout={groupLayout}
      groupRef={groupRef}
      id={`workspace-layout-${workspaceId}`}
      onLayoutChanged={normalizedLayoutChanged}
      orientation="horizontal"
    >
      <Panel
        className="panel-primary"
        defaultSize={`${primarySize}%`}
        id={primaryPanelId}
        minSize="30%"
        style={{ position: "relative" }}
      >
        {primaryContent}
      </Panel>
      <Separator
        aria-controls={secondaryPanelId}
        className="panel-resize-handle"
        disabled={!browserVisible}
        hidden={!browserVisible}
      />
      <Panel
        className="panel-secondary"
        collapsedSize="0%"
        collapsible
        defaultSize={`${secondarySize}%`}
        disabled={!browserVisible}
        id={secondaryPanelId}
        minSize="15%"
      >
        {secondaryContent}
      </Panel>
    </Group>
  );
}

function clampPercent(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 75;
  }

  return Math.min(max, Math.max(min, value));
}

function areLayoutsEquivalent(actualLayout: Layout, expectedLayout: Layout): boolean {
  return Object.entries(expectedLayout).every(([panelId, expectedSize]) => {
    const actualSize = actualLayout[panelId];

    return Number.isFinite(actualSize) && Math.abs(actualSize - expectedSize) <= 0.01;
  });
}
