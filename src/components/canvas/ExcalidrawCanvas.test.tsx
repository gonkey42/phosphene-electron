import { render, act, screen, within } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const excalidrawMock = vi.fn();
const excalidrawApiMountMock = vi.fn();
const claimFocusMock = vi.fn();
const updateSceneMock = vi.fn();
const refreshMock = vi.fn();
let latestExcalidrawProps: Record<string, unknown> | null = null;
const { readImagePathAsFileMock, onDragDropEventMock, nativeDropUnlistenMock } = vi.hoisted(() => ({
  readImagePathAsFileMock: vi.fn(),
  onDragDropEventMock: vi.fn(),
  nativeDropUnlistenMock: vi.fn(),
}));
let latestNativeDropHandler:
  | ((event: {
      payload: {
        type: string;
        paths?: string[];
        position?: { toLogical: (scaleFactor: number) => { x: number; y: number } };
      };
    }) => unknown)
  | null = null;

vi.mock("@excalidraw/excalidraw", () => ({
  Excalidraw: (props: Record<string, unknown>) => {
    latestExcalidrawProps = props;
    excalidrawMock(props);
    const excalidrawAPIRef = useRef(props.excalidrawAPI as ((api: object) => void) | undefined);
    const onChangeRef = useRef(props.onChange as ((...args: unknown[]) => void) | undefined);
    useLayoutEffect(() => {
      excalidrawApiMountMock();
      excalidrawAPIRef.current?.({
        refresh: refreshMock,
        updateScene: updateSceneMock,
      });
      onChangeRef.current?.([], {}, {});
    }, []);
    return <div data-testid="mock-excalidraw" />;
  },
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: onDragDropEventMock,
  }),
}));

vi.mock("../../lib/drop-handler", () => ({
  readImagePathAsFile: readImagePathAsFileMock,
  isSupportedImagePath: (path: string) => /\.(png|jpe?g|gif|svg|webp)$/i.test(path),
}));

vi.mock("../../contexts/KeyboardContext", () => ({
  useKeyboardContext: () => ({
    focus: "global",
    setFocus: vi.fn(),
    claimFocus: claimFocusMock,
    releaseFocus: vi.fn(),
    isFocused: vi.fn(),
  }),
}));

import { ExcalidrawCanvas } from "./ExcalidrawCanvas";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";

type ObservedDropEvent = Event & {
  dataTransfer: { files: File[] | FileList };
  clientX: number;
  clientY: number;
};

describe("ExcalidrawCanvas", () => {
  beforeEach(() => {
    latestExcalidrawProps = null;
    latestNativeDropHandler = null;
    excalidrawMock.mockClear();
    excalidrawApiMountMock.mockReset();
    claimFocusMock.mockReset();
    refreshMock.mockReset();
    updateSceneMock.mockReset();
    readImagePathAsFileMock.mockReset();
    onDragDropEventMock.mockReset();
    nativeDropUnlistenMock.mockReset();
    onDragDropEventMock.mockImplementation((handler: typeof latestNativeDropHandler) => {
      latestNativeDropHandler = handler;
      return Promise.resolve(nativeDropUnlistenMock);
    });
    vi.stubGlobal("__TAURI_INTERNALS__", {
      metadata: {
        currentWebview: { label: "main" },
      },
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("suppresses immediate mount changes across board switches until ready", async () => {
    const onChange = vi.fn();
    const initialData: ExcalidrawInitialDataState = {
      elements: [],
      appState: { theme: "dark" },
    };

    const { rerender } = render(
      <ExcalidrawCanvas boardId="board-1" initialData={initialData} onChange={onChange} />,
    );

    expect(screen.getByTestId("mock-excalidraw")).toBeInTheDocument();
    expect(excalidrawMock).toHaveBeenCalledTimes(1);
    expect(latestExcalidrawProps).toMatchObject({
      initialData,
      UIOptions: {
        canvasActions: {
          loadScene: false,
          export: false,
          saveToActiveFile: false,
        },
      },
    });
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    const readyChangeHandler = latestExcalidrawProps?.onChange as
      | ((...args: unknown[]) => void)
      | undefined;

    readyChangeHandler?.([], {}, {});
    expect(onChange).toHaveBeenCalledTimes(1);

    rerender(<ExcalidrawCanvas boardId="board-2" initialData={initialData} onChange={onChange} />);

    expect(onChange).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    const rearmedChangeHandler = latestExcalidrawProps?.onChange as
      | ((...args: unknown[]) => void)
      | undefined;

    rearmedChangeHandler?.([], {}, {});
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("ignores Excalidraw change events while marked non-interactive", async () => {
    const onChange = vi.fn();

    render(
      <ExcalidrawCanvas
        boardId="board-1"
        initialData={null}
        onChange={onChange}
        isInteractive={false}
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    const readyChangeHandler = latestExcalidrawProps?.onChange as
      | ((...args: unknown[]) => void)
      | undefined;

    readyChangeHandler?.([], {}, {});
    expect(onChange).not.toHaveBeenCalled();
  });

  it("explicitly leaves view mode when a mounted workspace becomes interactive again", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ExcalidrawCanvas
        boardId="board-1"
        initialData={null}
        onChange={onChange}
        isInteractive={false}
      />,
    );

    updateSceneMock.mockReset();

    rerender(
      <ExcalidrawCanvas boardId="board-1" initialData={null} onChange={onChange} isInteractive />,
    );

    expect(updateSceneMock).toHaveBeenCalledWith({
      appState: {
        viewModeEnabled: false,
      },
    });
  });

  it("refreshes a mounted canvas when it becomes interactive again", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ExcalidrawCanvas
        boardId="board-1"
        initialData={null}
        onChange={onChange}
        isInteractive={false}
      />,
    );

    refreshMock.mockReset();

    rerender(
      <ExcalidrawCanvas boardId="board-1" initialData={null} onChange={onChange} isInteractive />,
    );

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("remounts Excalidraw when a hidden workspace becomes interactive again", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ExcalidrawCanvas
        boardId="board-1"
        initialData={null}
        onChange={onChange}
        isInteractive={false}
      />,
    );

    expect(excalidrawApiMountMock).toHaveBeenCalledTimes(1);

    rerender(
      <ExcalidrawCanvas boardId="board-1" initialData={null} onChange={onChange} isInteractive />,
    );

    expect(excalidrawApiMountMock).toHaveBeenCalledTimes(2);
  });

  it("suppresses mount-time change events during an interactive reactivation remount", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ExcalidrawCanvas
        boardId="board-1"
        initialData={null}
        onChange={onChange}
        isInteractive={false}
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    rerender(
      <ExcalidrawCanvas boardId="board-1" initialData={null} onChange={onChange} isInteractive />,
    );

    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    const readyChangeHandler = latestExcalidrawProps?.onChange as
      | ((...args: unknown[]) => void)
      | undefined;

    readyChangeHandler?.([], {}, {});
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not remount Excalidraw when the active workspace becomes passive", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ExcalidrawCanvas boardId="board-1" initialData={null} onChange={onChange} isInteractive />,
    );

    expect(excalidrawApiMountMock).toHaveBeenCalledTimes(1);

    rerender(
      <ExcalidrawCanvas
        boardId="board-1"
        initialData={null}
        onChange={onChange}
        isInteractive={false}
      />,
    );

    expect(excalidrawApiMountMock).toHaveBeenCalledTimes(1);
  });

  it("keeps Excalidraw integration props stable across parent rerenders", () => {
    const onChange = vi.fn();
    const initialData: ExcalidrawInitialDataState = {
      elements: [],
      appState: { theme: "dark" },
    };

    const { rerender } = render(
      <ExcalidrawCanvas boardId="board-1" initialData={initialData} onChange={onChange} />,
    );

    const firstProps = latestExcalidrawProps;

    rerender(<ExcalidrawCanvas boardId="board-1" initialData={initialData} onChange={onChange} />);

    const secondProps = latestExcalidrawProps;

    expect(secondProps).not.toBeNull();
    expect(secondProps?.onChange).toBe(firstProps?.onChange);
    expect(secondProps?.UIOptions).toBe(firstProps?.UIOptions);
    expect(secondProps?.excalidrawAPI).toBe(firstProps?.excalidrawAPI);
  });

  it("bridges native Tauri image drops onto the inner Excalidraw surface", async () => {
    const onChange = vi.fn();
    const droppedFile = new File(["png"], "image.png", { type: "image/png" });
    readImagePathAsFileMock.mockResolvedValue(droppedFile);

    const { container } = render(
      <ExcalidrawCanvas boardId="board-1" initialData={null} onChange={onChange} />,
    );

    const wrapper = container.firstElementChild as HTMLDivElement;
    const excalidrawSurface = within(container).getByTestId("mock-excalidraw");
    const wrapperBounds = vi.spyOn(wrapper, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 500,
      bottom: 500,
      width: 500,
      height: 500,
      toJSON: () => ({}),
    } as DOMRect);
    let observedDropEvent!: ObservedDropEvent;

    excalidrawSurface.addEventListener("drop", (event) => {
      observedDropEvent = event as ObservedDropEvent;
    });

    await act(async () => {
      await Promise.resolve();
      await latestNativeDropHandler?.({
        payload: {
          type: "drop",
          paths: ["/Users/hal9000/Desktop/image.png"],
          position: {
            toLogical: () => ({ x: 100, y: 120 }),
          },
        },
      });
    });

    expect(onDragDropEventMock).toHaveBeenCalledTimes(1);
    expect(readImagePathAsFileMock).toHaveBeenCalledWith("/Users/hal9000/Desktop/image.png");
    expect(observedDropEvent).toBeDefined();
    expect(observedDropEvent.type).toBe("drop");
    expect(observedDropEvent.clientX).toBe(100);
    expect(observedDropEvent.clientY).toBe(120);
    expect(Array.from(observedDropEvent.dataTransfer.files)).toEqual([droppedFile]);
    wrapperBounds.mockRestore();
  });

  it("does not subscribe to native Tauri drag-drop when non-interactive", () => {
    render(
      <ExcalidrawCanvas
        boardId="board-1"
        initialData={null}
        onChange={vi.fn()}
        isInteractive={false}
      />,
    );

    expect(onDragDropEventMock).not.toHaveBeenCalled();
  });

  it("ignores native Tauri drops outside the canvas bounds", async () => {
    const onChange = vi.fn();
    const droppedFile = new File(["png"], "image.png", { type: "image/png" });
    readImagePathAsFileMock.mockResolvedValue(droppedFile);

    const { container } = render(
      <ExcalidrawCanvas boardId="board-1" initialData={null} onChange={onChange} />,
    );

    const wrapper = container.firstElementChild as HTMLDivElement;
    const excalidrawSurface = within(container).getByTestId("mock-excalidraw");
    const wrapperBounds = vi.spyOn(wrapper, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 500,
      bottom: 500,
      width: 500,
      height: 500,
      toJSON: () => ({}),
    } as DOMRect);
    const dropListener = vi.fn();

    excalidrawSurface.addEventListener("drop", dropListener);

    await act(async () => {
      await Promise.resolve();
      await latestNativeDropHandler?.({
        payload: {
          type: "drop",
          paths: ["/Users/hal9000/Desktop/image.png"],
          position: {
            toLogical: () => ({ x: 700, y: 720 }),
          },
        },
      });
    });

    expect(readImagePathAsFileMock).not.toHaveBeenCalled();
    expect(dropListener).not.toHaveBeenCalled();
    wrapperBounds.mockRestore();
  });

  it("claims canvas focus on pointer interaction", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ExcalidrawCanvas boardId="board-1" initialData={null} onChange={onChange} />,
    );

    act(() => {
      (container.firstElementChild as HTMLDivElement).dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
        }),
      );
    });

    expect(claimFocusMock).toHaveBeenCalledWith("canvas");
  });

  it("does not claim canvas focus while non-interactive", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ExcalidrawCanvas
        boardId="board-1"
        initialData={null}
        onChange={onChange}
        isInteractive={false}
      />,
    );

    act(() => {
      (container.firstElementChild as HTMLDivElement).dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
        }),
      );
    });

    expect(claimFocusMock).not.toHaveBeenCalled();
  });
});
