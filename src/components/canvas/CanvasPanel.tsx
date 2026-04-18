import { Component, type CSSProperties, type ReactNode } from "react";

import { useAppStore } from "../../stores/app-store";
import { useBoardPersistence } from "../../hooks/use-board-persistence";

import { LazyExcalidrawCanvas } from "./LazyExcalidrawCanvas";

const panelStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  flexDirection: "column" as const,
  background: "#f5f7fb",
};

const centeredStateStyle = {
  alignItems: "center",
  display: "flex",
  flex: 1,
  justifyContent: "center",
  padding: "2rem",
  textAlign: "center" as const,
};

const stateCardStyle = {
  color: "#475569",
  display: "grid",
  gap: "0.5rem",
  maxWidth: "22rem",
};

const errorCardStyle = {
  ...stateCardStyle,
  color: "#991b1b",
};

const canvasAreaStyle = {
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  position: "relative" as const,
};

type CanvasRenderBoundaryProps = {
  boardId: string;
  children: ReactNode;
};

type CanvasRenderBoundaryState = {
  error: Error | null;
};

class CanvasRenderBoundary extends Component<CanvasRenderBoundaryProps, CanvasRenderBoundaryState> {
  override state: CanvasRenderBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): CanvasRenderBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error("Canvas render failed", {
      boardId: this.props.boardId,
      error,
    });
  }

  override componentDidUpdate(prevProps: CanvasRenderBoundaryProps) {
    if (prevProps.boardId !== this.props.boardId && this.state.error) {
      this.setState({ error: null });
    }
  }

  override render() {
    if (this.state.error) {
      return (
        <section style={centeredStateStyle}>
          <div aria-live="polite" role="alert" style={errorCardStyle}>
            <p>Canvas failed to load</p>
            <p>Please try again or select a different board.</p>
            <p>{this.state.error.message}</p>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}

interface CanvasPanelProps {
  workspaceId?: string;
  isInteractive?: boolean;
}

export function CanvasPanel({ workspaceId, isInteractive = true }: CanvasPanelProps) {
  const activeBoardId = useAppStore((state) =>
    workspaceId ? (state.activeBoardPerWorkspace[workspaceId] ?? null) : state.activeBoardId,
  );
  const { initialData, loadError, isLoading, handleChange } = useBoardPersistence(activeBoardId);

  if (!activeBoardId) {
    return (
      <section style={centeredStateStyle}>
        <div style={stateCardStyle}>
          <p>No board selected</p>
          <p>Create a board or select one from the sidebar</p>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section style={centeredStateStyle}>
        <div style={stateCardStyle}>
          <p>Loading board...</p>
        </div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section style={centeredStateStyle}>
        <div aria-live="polite" role="alert" style={errorCardStyle}>
          <p>Failed to load board</p>
          <p>Please try again or select a different board.</p>
          <p>{loadError.message}</p>
        </div>
      </section>
    );
  }

  return (
    <section style={panelStyle}>
      <div style={canvasAreaStyle}>
        <CanvasRenderBoundary boardId={activeBoardId}>
          <LazyExcalidrawCanvas
            boardId={activeBoardId}
            initialData={initialData}
            onChange={handleChange}
            isInteractive={isInteractive}
          />
        </CanvasRenderBoundary>
      </div>
    </section>
  );
}
