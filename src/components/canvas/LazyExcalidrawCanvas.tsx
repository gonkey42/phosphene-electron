import { lazy, Suspense, type CSSProperties } from "react";

import type { ExcalidrawCanvasProps } from "./ExcalidrawCanvas";
import { loadExcalidrawCanvasModule } from "./excalidraw-canvas-loader";

const loadingStateStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  height: "100%",
  justifyContent: "center",
  padding: "2rem",
  textAlign: "center",
};

const loadingCardStyle: CSSProperties = {
  color: "#475569",
  display: "grid",
  gap: "0.5rem",
  maxWidth: "22rem",
};

const ExcalidrawCanvasComponent = lazy(async () => {
  const module = await loadExcalidrawCanvasModule();
  return {
    default: module.ExcalidrawCanvas,
  };
});

export function LazyExcalidrawCanvas(props: ExcalidrawCanvasProps) {
  return (
    <Suspense
      fallback={
        <section style={loadingStateStyle}>
          <div style={loadingCardStyle}>
            <p>Loading canvas tools...</p>
          </div>
        </section>
      }
    >
      <ExcalidrawCanvasComponent {...props} />
    </Suspense>
  );
}
