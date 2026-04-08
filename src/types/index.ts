import type { ComponentType } from "react";

export interface WidgetDefinition {
  id: string;
  type: string;
  name: string;
  defaultConfig: Record<string, unknown>;
  component: ComponentType<WidgetProps>;
}

export interface WidgetProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
  size: { width: number; height: number };
}

export type PanelType = "canvas" | "browser" | "document" | "media" | "widget";

export interface PanelConfig {
  id: string;
  type: PanelType;
  position: "primary" | "secondary";
  sizePercent: number;
  config: Record<string, unknown>;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  icon: string | null;
  position: number;
  layout_config: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BoardRow {
  id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  canvas_data: string | null;
  thumbnail: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
