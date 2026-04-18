import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { suppressExpectedConsoleError } from "../../test/expected-console-error";

const { useAppStoreMock, useBoardPersistenceMock, excalidrawCanvasMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  useBoardPersistenceMock: vi.fn(),
  excalidrawCanvasMock: vi.fn(),
}));

let shouldThrowCanvas = false;

vi.mock("../../stores/app-store", () => ({
  useAppStore: useAppStoreMock,
}));

vi.mock("../../hooks/use-board-persistence", () => ({
  useBoardPersistence: useBoardPersistenceMock,
}));

vi.mock("./LazyExcalidrawCanvas", () => ({
  LazyExcalidrawCanvas: (props: Record<string, unknown>) => {
    if (shouldThrowCanvas) {
      throw new Error("Excalidraw crashed");
    }

    excalidrawCanvasMock(props);
    return <div data-testid="mock-excalidraw-canvas" />;
  },
}));

import { CanvasPanel } from "./CanvasPanel";

describe("CanvasPanel", () => {
  beforeEach(() => {
    useAppStoreMock.mockReset();
    useBoardPersistenceMock.mockReset();
    excalidrawCanvasMock.mockReset();
    shouldThrowCanvas = false;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function mockStoreState({
    activeBoardId = null,
    activeBoardPerWorkspace = {},
  }: {
    activeBoardId?: string | null;
    activeBoardPerWorkspace?: Record<string, string | null>;
  }) {
    useAppStoreMock.mockImplementation(
      (
        selector?: (state: {
          activeBoardId: string | null;
          activeBoardPerWorkspace: Record<string, string | null>;
        }) => unknown,
      ) =>
        selector
          ? selector({ activeBoardId, activeBoardPerWorkspace })
          : { activeBoardId, activeBoardPerWorkspace },
    );
  }

  it("shows the empty state when no board is selected", () => {
    mockStoreState({});
    useBoardPersistenceMock.mockReturnValue({
      initialData: null,
      isLoading: false,
      handleChange: vi.fn(),
    });

    render(<CanvasPanel />);

    expect(screen.getByText("No board selected")).toBeInTheDocument();
    expect(screen.getByText("Create a board or select one from the sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-excalidraw-canvas")).not.toBeInTheDocument();
  });

  it("uses the workspace-specific board selection when a workspace id is provided", () => {
    mockStoreState({
      activeBoardId: "board-1",
      activeBoardPerWorkspace: {
        "workspace-2": "board-2",
      },
    });
    useBoardPersistenceMock.mockReturnValue({
      initialData: { elements: [], appState: {}, files: {} },
      isLoading: false,
      handleChange: vi.fn(),
    });

    render(<CanvasPanel workspaceId="workspace-2" />);

    expect(useBoardPersistenceMock).toHaveBeenCalledWith("board-2");
    expect(screen.getByTestId("mock-excalidraw-canvas")).toBeInTheDocument();
  });

  it("passes interactivity through to the lazy Excalidraw canvas wrapper", () => {
    mockStoreState({
      activeBoardPerWorkspace: {
        "workspace-2": "board-2",
      },
    });
    useBoardPersistenceMock.mockReturnValue({
      initialData: { elements: [], appState: {}, files: {} },
      isLoading: false,
      handleChange: vi.fn(),
    });

    render(<CanvasPanel workspaceId="workspace-2" isInteractive={false} />);

    expect(excalidrawCanvasMock).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: "board-2",
        isInteractive: false,
      }),
    );
  });

  it("shows the loading state while the board loads", () => {
    mockStoreState({ activeBoardId: "board-1" });
    useBoardPersistenceMock.mockReturnValue({
      initialData: null,
      isLoading: true,
      handleChange: vi.fn(),
    });

    render(<CanvasPanel />);

    expect(screen.getByText("Loading board...")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-excalidraw-canvas")).not.toBeInTheDocument();
  });

  it("renders the canvas without a save indicator overlay when the board is ready", () => {
    const handleChange = vi.fn();
    const initialData = { elements: [], appState: {}, files: {} };

    mockStoreState({ activeBoardId: "board-1" });
    useBoardPersistenceMock.mockReturnValue({
      initialData,
      isLoading: false,
      handleChange,
    });

    render(<CanvasPanel />);

    expect(screen.queryByText("Unsaved")).not.toBeInTheDocument();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(screen.queryByText("Saving...")).not.toBeInTheDocument();
    expect(screen.getByTestId("mock-excalidraw-canvas")).toBeInTheDocument();
    expect(excalidrawCanvasMock).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: "board-1",
        initialData,
        onChange: handleChange,
      }),
    );
  });

  it("shows a load error state when the board cannot be loaded", () => {
    mockStoreState({ activeBoardId: "board-1" });
    useBoardPersistenceMock.mockReturnValue({
      initialData: null,
      isLoading: false,
      loadError: new Error("load failed"),
      handleChange: vi.fn(),
    });

    render(<CanvasPanel />);

    expect(screen.getByText("Failed to load board")).toBeInTheDocument();
    expect(screen.getByText("Please try again or select a different board.")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-excalidraw-canvas")).not.toBeInTheDocument();
  });

  it("shows a canvas error state instead of blanking the app when the canvas throws", () => {
    const consoleErrorSpy = suppressExpectedConsoleError();

    shouldThrowCanvas = true;

    mockStoreState({ activeBoardId: "board-1" });
    useBoardPersistenceMock.mockReturnValue({
      initialData: { elements: [], appState: {}, files: {} },
      isLoading: false,
      loadError: null,
      handleChange: vi.fn(),
    });

    render(<CanvasPanel />);

    expect(screen.getByText("Canvas failed to load")).toBeInTheDocument();
    expect(screen.getByText("Excalidraw crashed")).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
