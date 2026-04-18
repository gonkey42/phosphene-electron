import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DeferredModule = {
  promise: Promise<typeof import("./ExcalidrawCanvas")>;
  resolve: (module: typeof import("./ExcalidrawCanvas")) => void;
};

const { loadExcalidrawCanvasModuleMock } = vi.hoisted(() => ({
  loadExcalidrawCanvasModuleMock: vi.fn(),
}));

vi.mock("./excalidraw-canvas-loader", () => ({
  loadExcalidrawCanvasModule: loadExcalidrawCanvasModuleMock,
}));

function createDeferredModule(): DeferredModule {
  let resolve!: (module: typeof import("./ExcalidrawCanvas")) => void;
  const promise = new Promise<typeof import("./ExcalidrawCanvas")>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe("LazyExcalidrawCanvas", () => {
  beforeEach(() => {
    vi.resetModules();
    loadExcalidrawCanvasModuleMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading state until the Excalidraw canvas module resolves", async () => {
    const deferredModule = createDeferredModule();
    const onChange = vi.fn();

    loadExcalidrawCanvasModuleMock.mockReturnValue(deferredModule.promise);

    const { LazyExcalidrawCanvas } = await import("./LazyExcalidrawCanvas");

    render(
      <LazyExcalidrawCanvas
        boardId="board-1"
        initialData={null}
        onChange={onChange}
        isInteractive={false}
      />,
    );

    expect(screen.getByText("Loading canvas tools...")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-lazy-excalidraw-canvas")).not.toBeInTheDocument();

    deferredModule.resolve({
      ExcalidrawCanvas: (props: Record<string, unknown>) => (
        <div data-testid="mock-lazy-excalidraw-canvas" data-board-id={String(props.boardId)} />
      ),
    } as typeof import("./ExcalidrawCanvas"));

    expect(await screen.findByTestId("mock-lazy-excalidraw-canvas")).toHaveAttribute(
      "data-board-id",
      "board-1",
    );
    expect(screen.queryByText("Loading canvas tools...")).not.toBeInTheDocument();
  });
});
