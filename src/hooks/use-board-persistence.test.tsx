import { renderHook, act, waitFor } from "@testing-library/react";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getBoardMock, saveBoardCanvasDataMock } = vi.hoisted(() => ({
  getBoardMock: vi.fn(),
  saveBoardCanvasDataMock: vi.fn(),
}));

const { extractImagesToFilesystemMock, injectImagesFromFilesystemMock } = vi.hoisted(() => ({
  extractImagesToFilesystemMock: vi.fn(),
  injectImagesFromFilesystemMock: vi.fn(),
}));

vi.mock("../lib/board-operations", () => ({
  getBoard: getBoardMock,
  saveBoardCanvasData: saveBoardCanvasDataMock,
}));

vi.mock("../lib/image-extraction", () => ({
  extractImagesToFilesystem: extractImagesToFilesystemMock,
  injectImagesFromFilesystem: injectImagesFromFilesystemMock,
}));

import { useBoardPersistence } from "./use-board-persistence";

describe("useBoardPersistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBoardMock.mockReset();
    saveBoardCanvasDataMock.mockReset();
    extractImagesToFilesystemMock.mockReset();
    injectImagesFromFilesystemMock.mockReset();
    extractImagesToFilesystemMock.mockImplementation(async (_boardId, files) => files);
    injectImagesFromFilesystemMock.mockImplementation(async (files) => files);
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const element = (id: string) =>
    ({ id }) as NonNullable<ExcalidrawInitialDataState["elements"]>[number];
  const files = { file1: { id: "file1" } } as unknown as ExcalidrawInitialDataState["files"];
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });

    return { promise, resolve, reject };
  };

  it("loads saved canvas data for the active board", async () => {
    getBoardMock.mockResolvedValue({
      canvas_data: JSON.stringify({
        elements: [element("element-1")],
        appState: {
          viewBackgroundColor: "#ffffff",
          gridSize: 10,
          gridColor: "#dddddd",
          theme: "dark",
        },
        files,
      }),
    });

    const { result } = renderHook(() => useBoardPersistence("board-1"));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.saveStatus).toBe("saved");

    await act(async () => {
      await flush();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.initialData).toEqual({
      elements: [element("element-1")],
      appState: {
        viewBackgroundColor: "#ffffff",
        gridSize: 10,
        gridColor: "#dddddd",
        theme: "dark",
      },
      files,
    });
    expect(result.current.saveStatus).toBe("saved");
    expect(getBoardMock).toHaveBeenCalledWith("board-1");
  });

  it("falls back to empty canvas fields when saved data omits them", async () => {
    getBoardMock.mockResolvedValue({
      canvas_data: JSON.stringify({
        appState: {
          viewBackgroundColor: "#ffffff",
        },
      }),
    });

    const { result } = renderHook(() => useBoardPersistence("board-1"));

    await act(async () => {
      await flush();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.initialData).toEqual({
      elements: [],
      appState: {
        viewBackgroundColor: "#ffffff",
      },
      files: {},
    });
    expect(result.current.saveStatus).toBe("saved");
  });

  it("treats an empty string board id as a real board id", async () => {
    getBoardMock.mockResolvedValue({
      canvas_data: JSON.stringify({
        elements: [element("element-empty")],
        appState: {
          viewBackgroundColor: "#ffffff",
        },
        files: {},
      }),
    });

    const { result } = renderHook(() => useBoardPersistence(""));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.initialData).toBeNull();
    expect(result.current.loadError).toBeNull();
    expect(result.current.saveStatus).toBe("saved");

    await act(async () => {
      await flush();
    });

    expect(getBoardMock).toHaveBeenCalledWith("");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.initialData).toEqual({
      elements: [element("element-empty")],
      appState: {
        viewBackgroundColor: "#ffffff",
      },
      files: {},
    });

    vi.useFakeTimers();

    act(() => {
      result.current.handleChange([element("element-empty")], {}, {});
    });

    expect(result.current.saveStatus).toBe("unsaved");

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(saveBoardCanvasDataMock).toHaveBeenCalledWith(
      "",
      JSON.stringify({
        elements: [element("element-empty")],
        appState: {
          viewBackgroundColor: undefined,
          gridSize: undefined,
          gridColor: undefined,
        },
        files: {},
      }),
    );
    expect(result.current.saveStatus).toBe("saved");
  });

  it("injects extracted image files back into the loaded canvas data", async () => {
    const storedFiles = {
      file1: {
        mimeType: "image/png",
        dataURL: "phosphene-file:///app/images/board-1_file-1.png",
        created: 100,
      },
    };
    const injectedFiles = {
      file1: {
        mimeType: "image/png",
        dataURL: "data:image/png;base64,cG5nLWJ5dGVz",
        created: 100,
      },
    };

    getBoardMock.mockResolvedValue({
      canvas_data: JSON.stringify({
        elements: [element("element-1")],
        appState: {
          viewBackgroundColor: "#ffffff",
        },
        files: storedFiles,
      }),
    });
    injectImagesFromFilesystemMock.mockResolvedValue(injectedFiles);

    const { result } = renderHook(() => useBoardPersistence("board-1"));

    await act(async () => {
      await flush();
    });

    expect(injectImagesFromFilesystemMock).toHaveBeenCalledWith(storedFiles);
    expect(result.current.initialData).toEqual({
      elements: [element("element-1")],
      appState: {
        viewBackgroundColor: "#ffffff",
      },
      files: injectedFiles,
    });
  });

  it("logs a failed board load and clears loading state", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const loadError = new Error("load failed");
    getBoardMock.mockRejectedValue(loadError);

    const { result } = renderHook(() => useBoardPersistence("board-1"));

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await flush();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.initialData).toBeNull();
    expect(result.current.loadError).toBe(loadError);
    expect(result.current.saveStatus).toBe("saved");
    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to load board canvas data", loadError);
  });

  it("logs parse failures and falls back to null initial data", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const parseError = new Error("Unexpected token");
    getBoardMock.mockResolvedValue({
      canvas_data: "{invalid json",
    });

    const jsonParseSpy = vi.spyOn(JSON, "parse").mockImplementation(() => {
      throw parseError;
    });

    const { result } = renderHook(() => useBoardPersistence("board-1"));

    await act(async () => {
      await flush();
    });

    await waitFor(() => expect(result.current.loadError).toBe(parseError));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.initialData).toBeNull();
    expect(result.current.saveStatus).toBe("saved");
    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to parse board canvas data", parseError);

    jsonParseSpy.mockRestore();
  });

  it("debounces canvas changes and persists the selected app state fields", async () => {
    getBoardMock.mockResolvedValue({ canvas_data: null });

    const { result } = renderHook(() => useBoardPersistence("board-1"));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);

    vi.useFakeTimers();

    act(() => {
      result.current.handleChange(
        [element("element-1")],
        {
          viewBackgroundColor: "#fefefe",
          gridSize: 8,
          gridColor: "#cccccc",
        },
        files,
      );
    });

    expect(result.current.saveStatus).toBe("unsaved");
    expect(saveBoardCanvasDataMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(result.current.saveStatus).toBe("saved");
    expect(saveBoardCanvasDataMock).toHaveBeenCalledWith(
      "board-1",
      JSON.stringify({
        elements: [element("element-1")],
        appState: {
          viewBackgroundColor: "#fefefe",
          gridSize: 8,
          gridColor: "#cccccc",
        },
        files,
      }),
    );
  });

  it("extracts image files before persisting canvas changes", async () => {
    vi.useFakeTimers();
    getBoardMock.mockResolvedValue({ canvas_data: null });

    const inlineFiles = {
      file1: {
        mimeType: "image/png",
        dataURL: "data:image/png;base64,cG5nLWJ5dGVz",
        created: 100,
      },
    } as unknown as ExcalidrawInitialDataState["files"];
    const extractedFiles = {
      file1: {
        mimeType: "image/png",
        dataURL: "phosphene-file:///app/images/board-1_file-1.png",
        created: 100,
      },
    };

    extractImagesToFilesystemMock.mockResolvedValue(extractedFiles);

    const { result } = renderHook(() => useBoardPersistence("board-1"));

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.handleChange(
        [element("element-1")],
        {
          viewBackgroundColor: "#fefefe",
          gridSize: 8,
          gridColor: "#cccccc",
        },
        inlineFiles,
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(extractImagesToFilesystemMock).toHaveBeenCalledWith("board-1", inlineFiles);
    expect(saveBoardCanvasDataMock).toHaveBeenCalledWith(
      "board-1",
      JSON.stringify({
        elements: [element("element-1")],
        appState: {
          viewBackgroundColor: "#fefefe",
          gridSize: 8,
          gridColor: "#cccccc",
        },
        files: extractedFiles,
      }),
    );
  });

  it("flushes pending changes for the previous board before switching boards", async () => {
    getBoardMock.mockResolvedValueOnce({ canvas_data: null });
    getBoardMock.mockResolvedValueOnce({
      canvas_data: JSON.stringify({
        elements: [element("board-2-element")],
        appState: {
          viewBackgroundColor: "#222222",
          gridSize: 16,
          gridColor: "#444444",
        },
        files: {},
      }),
    });

    const { result, rerender } = renderHook(({ boardId }) => useBoardPersistence(boardId), {
      initialProps: { boardId: "board-1" },
    });

    await act(async () => {
      await flush();
    });

    vi.useFakeTimers();

    act(() => {
      result.current.handleChange([element("board-1-element")], {}, {});
    });

    rerender({ boardId: "board-2" });

    await act(async () => {
      await Promise.resolve();
    });

    expect(saveBoardCanvasDataMock).toHaveBeenCalledWith(
      "board-1",
      JSON.stringify({
        elements: [element("board-1-element")],
        appState: {
          viewBackgroundColor: undefined,
          gridSize: undefined,
          gridColor: undefined,
        },
        files: {},
      }),
    );
    expect(result.current.initialData).toEqual({
      elements: [element("board-2-element")],
      appState: {
        viewBackgroundColor: "#222222",
        gridSize: 16,
        gridColor: "#444444",
      },
      files: {},
    });
  });

  it("does not expose the previous board snapshot during a board switch render", async () => {
    getBoardMock.mockResolvedValueOnce({
      canvas_data: JSON.stringify({
        elements: [element("board-1-element")],
        appState: {
          viewBackgroundColor: "#111111",
          gridSize: 4,
          gridColor: "#222222",
        },
        files: {},
      }),
    });
    getBoardMock.mockResolvedValueOnce({
      canvas_data: JSON.stringify({
        elements: [element("board-2-element")],
        appState: {
          viewBackgroundColor: "#333333",
          gridSize: 6,
          gridColor: "#444444",
        },
        files: {},
      }),
    });

    const { result, rerender } = renderHook(({ boardId }) => useBoardPersistence(boardId), {
      initialProps: { boardId: "board-1" },
    });

    await act(async () => {
      await flush();
    });

    expect(result.current.initialData).toEqual({
      elements: [element("board-1-element")],
      appState: {
        viewBackgroundColor: "#111111",
        gridSize: 4,
        gridColor: "#222222",
      },
      files: {},
    });
    expect(result.current.isLoading).toBe(false);

    rerender({ boardId: "board-2" });

    expect(result.current.initialData).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it("keeps an older in-flight save from marking the board saved while a newer change is pending", async () => {
    vi.useFakeTimers();
    getBoardMock.mockResolvedValue({ canvas_data: null });

    const firstSave = deferred<void>();
    const secondSave = deferred<void>();
    saveBoardCanvasDataMock
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce(() => secondSave.promise);

    const { result } = renderHook(() => useBoardPersistence("board-1"));

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.handleChange([element("first")], {}, files);
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.saveStatus).toBe("saving");
    expect(saveBoardCanvasDataMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.handleChange([element("second")], {}, files);
    });

    expect(result.current.saveStatus).toBe("unsaved");

    await act(async () => {
      firstSave.resolve();
      await Promise.resolve();
    });

    expect(result.current.saveStatus).not.toBe("saved");

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveBoardCanvasDataMock).toHaveBeenCalledTimes(2);
    expect(result.current.saveStatus).toBe("saving");

    await act(async () => {
      secondSave.resolve();
      await Promise.resolve();
    });

    expect(result.current.saveStatus).toBe("saved");
  });
});
