import type { ReactNode } from "react";

import { Group, Panel, Separator } from "react-resizable-panels";
import type { Layout } from "react-resizable-panels";

import "./PanelLayout.css";

type PanelLayoutProps = {
  workspaceId: string;
  primaryContent: ReactNode;
  secondaryContent?: ReactNode;
  defaultPrimarySize?: number;
  onLayoutChange?: (sizes: Layout) => void;
};

export function PanelLayout({
  workspaceId,
  primaryContent,
  secondaryContent,
  defaultPrimarySize = 75,
  onLayoutChange,
}: PanelLayoutProps) {
  const defaultSecondarySize = 100 - defaultPrimarySize;

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
      id={`workspace-layout-${workspaceId}`}
      onLayoutChanged={onLayoutChange}
      orientation="horizontal"
    >
      <Panel
        className="panel-primary"
        defaultSize={defaultPrimarySize}
        id="primary"
        minSize={30}
        style={{ position: "relative" }}
      >
        {primaryContent}
      </Panel>
      <Separator className="panel-resize-handle" />
      <Panel
        className="panel-secondary"
        defaultSize={defaultSecondarySize}
        id="secondary"
        minSize={15}
      >
        {secondaryContent}
      </Panel>
    </Group>
  );
}
