import { render, act, screen } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const excalidrawMock = vi.fn();
const excalidrawApiMountMock = vi.fn();
const excalidrawDropMock = vi.fn();
const excalidrawDropSnapshots: Array<{
  currentTarget: EventTarget | null;
  event: Event;
  target: EventTarget | null;
}> = [];
const setToastMock = vi.fn();
const claimFocusMock = vi.fn();
const updateSceneMock = vi.fn();
const refreshMock = vi.fn();
const { useAppStoreMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
}));
let latestExcalidrawProps: Record<string, unknown> | null = null;

vi.mock("../../stores/app-store", () => ({
  useAppStore: useAppStoreMock,
}));

vi.mock("@excalidraw/excalidraw", () => ({
  Excalidraw: (props: Record<string, unknown>) => {
    latestExcalidrawProps = props;
    excalidrawMock(props);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const excalidrawAPIRef = useRef(props.excalidrawAPI as ((api: object) => void) | undefined);
    const onChangeRef = useRef(props.onChange as ((...args: unknown[]) => void) | undefined);
    useLayoutEffect(() => {
      excalidrawApiMountMock();
      const rootElement = rootRef.current;

      if (!rootElement) {
        return;
      }

      const handleDrop = (event: Event) => {
        excalidrawDropMock(event);
        excalidrawDropSnapshots.push({
          currentTarget: event.currentTarget,
          event,
          target: event.target,
        });
      };

      rootElement.addEventListener("drop", handleDrop);
      excalidrawAPIRef.current?.({
        refresh: refreshMock,
        setToast: setToastMock,
        updateScene: updateSceneMock,
      });
      onChangeRef.current?.([], {}, {});
      return () => {
        rootElement.removeEventListener("drop", handleDrop);
      };
    }, []);
    return <div data-testid="mock-excalidraw" ref={rootRef} />;
  },
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

function createDataTransfer(types: string[], getData: (type: string) => string, files?: FileList) {
  return {
    files: files ?? createFileList([]),
    types,
    getData,
  } satisfies Pick<DataTransfer, "files" | "types" | "getData">;
}

function createFileList(files: File[]): FileList {
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
    [Symbol.iterator]: function* () {
      yield* files;
    },
  } as FileList;

  files.forEach((file, index) => {
    Object.defineProperty(fileList, index, {
      configurable: true,
      enumerable: true,
      value: file,
      writable: false,
    });
  });

  return fileList;
}

function dispatchDrop(
  target: Element,
  dataTransfer: Pick<DataTransfer, "files" | "types" | "getData">,
  coords: { clientX: number; clientY: number } = { clientX: 0, clientY: 0 },
) {
  const event = new Event("drop", {
    bubbles: true,
    cancelable: true,
  });

  Object.defineProperty(event, "dataTransfer", {
    configurable: true,
    enumerable: true,
    value: dataTransfer,
  });
  Object.defineProperty(event, "clientX", {
    configurable: true,
    enumerable: true,
    value: coords.clientX,
  });
  Object.defineProperty(event, "clientY", {
    configurable: true,
    enumerable: true,
    value: coords.clientY,
  });

  target.dispatchEvent(event);
  return event;
}

describe("ExcalidrawCanvas", () => {
  beforeEach(() => {
    latestExcalidrawProps = null;
    excalidrawMock.mockClear();
    excalidrawApiMountMock.mockReset();
    excalidrawDropMock.mockReset();
    excalidrawDropSnapshots.length = 0;
    setToastMock.mockReset();
    claimFocusMock.mockReset();
    refreshMock.mockReset();
    updateSceneMock.mockReset();
    useAppStoreMock.mockReset();
    useAppStoreMock.mockImplementation(
      (selector?: (state: { resolvedTheme: "light" | "dark" }) => unknown) =>
        selector ? selector({ resolvedTheme: "dark" }) : { resolvedTheme: "dark" },
    );
    vi.useFakeTimers();
  });

  afterEach(() => {
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

  it("passes the resolved app theme through to Excalidraw", () => {
    const onChange = vi.fn();

    render(<ExcalidrawCanvas boardId="board-1" initialData={null} onChange={onChange} />);

    expect(latestExcalidrawProps).toMatchObject({
      theme: "dark",
    });
  });

  it("updates the theme after ready without causing a synthetic mount-time change", async () => {
    const onChange = vi.fn();
    let resolvedTheme: "light" | "dark" = "light";

    useAppStoreMock.mockImplementation(
      (selector?: (state: { resolvedTheme: "light" | "dark" }) => unknown) =>
        selector ? selector({ resolvedTheme }) : { resolvedTheme },
    );

    const { rerender } = render(
      <ExcalidrawCanvas boardId="board-1" initialData={null} onChange={onChange} />,
    );

    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    const readyChangeHandler = latestExcalidrawProps?.onChange as
      | ((...args: unknown[]) => void)
      | undefined;

    readyChangeHandler?.([], {}, {});
    expect(onChange).toHaveBeenCalledTimes(1);

    resolvedTheme = "dark";

    rerender(<ExcalidrawCanvas boardId="board-1" initialData={null} onChange={onChange} />);

    expect(excalidrawApiMountMock).toHaveBeenCalledTimes(1);
    expect(latestExcalidrawProps).toMatchObject({
      theme: "dark",
    });
    expect(onChange).toHaveBeenCalledTimes(1);
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

  it("translates browser image drops into synthetic file drops", async () => {
    const onChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("png-bytes", {
        headers: { "content-type": "image/png" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <ExcalidrawCanvas boardId="board-1" initialData={null} onChange={onChange} />,
    );

    const dropTarget = container.querySelector("[data-testid='mock-excalidraw']");
    expect(dropTarget).toBeTruthy();

    const browserDropEvent = dispatchDrop(
      dropTarget as Element,
      createDataTransfer(["text/uri-list"], (type) => (type === "text/uri-list" ? "https://example.com/photo.png" : "")),
      { clientX: 123, clientY: 456 },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(browserDropEvent.defaultPrevented).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/photo.png");
    expect(excalidrawDropMock).toHaveBeenCalledTimes(1);
    expect(excalidrawDropSnapshots).toHaveLength(1);
    const translatedEvent = excalidrawDropSnapshots[0];
    expect(translatedEvent.currentTarget).toBe(dropTarget);
    expect(translatedEvent.target).toBe(dropTarget);
    expect(translatedEvent.event).toBe(excalidrawDropMock.mock.calls[0]?.[0]);
    expect(translatedEvent.event.dataTransfer?.files.length).toBe(1);
    expect(translatedEvent.event.dataTransfer?.files[0]?.name).toBe("photo.png");
    expect(translatedEvent.event.dataTransfer?.files[0]?.type).toBe("image/png");
    expect(translatedEvent.event.clientX).toBe(123);
    expect(translatedEvent.event.clientY).toBe(456);
  });

  it("does not intercept an existing filesystem drop", async () => {
    const onChange = vi.fn();
    const file = new File(["png-bytes"], "finder.png", { type: "image/png" });

    const { container } = render(
      <ExcalidrawCanvas boardId="board-1" initialData={null} onChange={onChange} />,
    );

    const dropTarget = container.querySelector("[data-testid='mock-excalidraw']");
    expect(dropTarget).toBeTruthy();

    const browserDropEvent = dispatchDrop(
      dropTarget as Element,
      createDataTransfer(["Files"], vi.fn(), createFileList([file])),
    );

    expect(browserDropEvent.defaultPrevented).toBe(false);
    expect(excalidrawDropMock).toHaveBeenCalledTimes(1);
    expect(excalidrawDropSnapshots).toHaveLength(1);
    const receivedEvent = excalidrawDropSnapshots[0];
    expect(receivedEvent.currentTarget).toBe(dropTarget);
    expect(receivedEvent.target).toBe(dropTarget);
    expect(receivedEvent.event.dataTransfer?.files[0]).toBe(file);
  });

  it("does nothing when non-interactive", async () => {
    const onChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("png-bytes", {
        headers: { "content-type": "image/png" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <ExcalidrawCanvas
        boardId="board-1"
        initialData={null}
        onChange={onChange}
        isInteractive={false}
      />,
    );

    const dropTarget = container.querySelector("[data-testid='mock-excalidraw']");
    expect(dropTarget).toBeTruthy();

    const browserDropEvent = dispatchDrop(
      dropTarget as Element,
      createDataTransfer(["text/uri-list"], (type) =>
        type === "text/uri-list" ? "https://example.com/photo.png" : "",
      ),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(browserDropEvent.defaultPrevented).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(excalidrawDropMock).toHaveBeenCalledTimes(1);
    expect(excalidrawDropSnapshots).toHaveLength(1);
    const receivedEvent = excalidrawDropSnapshots[0];
    expect(receivedEvent.currentTarget).toBe(dropTarget);
    expect(receivedEvent.target).toBe(dropTarget);
    expect(receivedEvent.event.dataTransfer?.files.length).toBe(0);
  });

  it("shows a toast when browser image import fails", async () => {
    const onChange = vi.fn();
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <ExcalidrawCanvas boardId="board-1" initialData={null} onChange={onChange} />,
    );

    const dropTarget = container.querySelector("[data-testid='mock-excalidraw']");
    expect(dropTarget).toBeTruthy();

    const browserDropEvent = dispatchDrop(
      dropTarget as Element,
      createDataTransfer(["text/plain"], (type) =>
        type === "text/plain" ? "https://example.com/photo.png" : "",
      ),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(browserDropEvent.defaultPrevented).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/photo.png");
    expect(setToastMock).toHaveBeenCalledWith({
      message: "Failed to import dropped image.",
    });
    expect(excalidrawDropMock).not.toHaveBeenCalled();
    expect(excalidrawDropSnapshots).toHaveLength(0);
  });
});
