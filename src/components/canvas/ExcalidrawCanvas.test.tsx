import { render, act, screen } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const excalidrawMock = vi.fn();
const excalidrawApiMountMock = vi.fn();
const claimFocusMock = vi.fn();
const updateSceneMock = vi.fn();
const refreshMock = vi.fn();
let latestExcalidrawProps: Record<string, unknown> | null = null;

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

describe("ExcalidrawCanvas", () => {
  beforeEach(() => {
    latestExcalidrawProps = null;
    excalidrawMock.mockClear();
    excalidrawApiMountMock.mockReset();
    claimFocusMock.mockReset();
    refreshMock.mockReset();
    updateSceneMock.mockReset();
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
