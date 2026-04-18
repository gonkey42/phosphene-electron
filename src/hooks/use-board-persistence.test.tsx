import { renderHook, act, waitFor } from "@testing-library/react";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { suppressExpectedConsoleError } from "../test/expected-console-error";

const { getBoardMock, saveBoardCanvasDataMock } = vi.hoisted(() => ({
  getBoardMock: vi.fn(),
  saveBoardCanvasDataMock: vi.fn(),
}));

const { extractImagesToFilesystemMock, injectImagesFromFilesystemMock } = vi.hoisted(() => ({
  extractImagesToFilesystemMock: vi.fn(),
  injectImagesFromFilesystemMock: vi.fn(),
}));

const { reportErrorMock } = vi.hoisted(() => ({
  reportErrorMock: vi.fn(),
}));

const { lifecycleHandlers } = vi.hoisted(() => ({
  lifecycleHandlers: new Set<() => Promise<void> | void>(),
}));

vi.mock("../lib/board-operations", () => ({
  getBoard: getBoardMock,
  saveBoardCanvasData: saveBoardCanvasDataMock,
}));

vi.mock("../lib/image-extraction", () => ({
  extractImagesToFilesystem: extractImagesToFilesystemMock,
  injectImagesFromFilesystem: injectImagesFromFilesystemMock,
}));

vi.mock("./use-error-reporter", () => ({
  useErrorReporter: () => reportErrorMock,
}));

vi.mock("../platform/desktop-api", () => ({
  lifecycle: {
    registerPendingWork(handler: () => Promise<void> | void) {
      lifecycleHandlers.add(handler);
      return () => {
        lifecycleHandlers.delete(handler);
      };
    },
    flushPendingWork: vi.fn(),
  },
}));

import { useBoardPersistence } from "./use-board-persistence";

describe("useBoardPersistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBoardMock.mockReset();
    saveBoardCanvasDataMock.mockReset();
    extractImagesToFilesystemMock.mockReset();
    injectImagesFromFilesystemMock.mockReset();
    reportErrorMock.mockReset();
    lifecycleHandlers.clear();
    extractImagesToFilesystemMock.mockImplementation(async (_boardId, files) => files);
    injectImagesFromFilesystemMock.mockImplementation(async (files) => files);
    saveBoardCanvasDataMock.mockResolvedValue(undefined);
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    lifecycleHandlers.clear();
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
    const consoleErrorSpy = suppressExpectedConsoleError();
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
    const consoleErrorSpy = suppressExpectedConsoleError();
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

  it("keeps the latest in-memory snapshot available while a save is pending", async () => {
    getBoardMock.mockResolvedValue({ canvas_data: null });

    const { result } = renderHook(() => useBoardPersistence("board-1"));

    await act(async () => {
      await Promise.resolve();
    });

    vi.useFakeTimers();

    act(() => {
      result.current.handleChange(
        [element("element-live")],
        {
          viewBackgroundColor: "#fafafa",
          gridSize: 12,
          gridColor: "#bbbbbb",
        },
        files,
      );
    });

    expect(result.current.initialData).toEqual({
      elements: [element("element-live")],
      appState: {
        viewBackgroundColor: "#fafafa",
        gridSize: 12,
        gridColor: "#bbbbbb",
      },
      files,
    });
    expect(result.current.saveStatus).toBe("unsaved");
    expect(saveBoardCanvasDataMock).not.toHaveBeenCalled();
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

  it("keeps the board unsaved and reports the error when save rejects", async () => {
    vi.useFakeTimers();
    getBoardMock.mockResolvedValue({ canvas_data: null });
    const saveError = new Error("Board save affected 0 rows");
    saveBoardCanvasDataMock.mockRejectedValueOnce(saveError);

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
        files,
      );
    });

    expect(result.current.saveStatus).toBe("unsaved");

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.saveStatus).toBe("unsaved");
    expect(reportErrorMock).toHaveBeenCalledWith(
      "Failed to save board canvas data for board board-1",
      saveError,
      expect.objectContaining({
        boardId: "board-1",
        saveToken: 1,
        saveSessionId: 1,
      }),
    );
  });

  it("suppresses stale save failure reporting when a newer save succeeds", async () => {
    vi.useFakeTimers();
    getBoardMock.mockResolvedValue({ canvas_data: null });
    const firstSave = deferred<void>();
    const staleSaveError = new Error("Board save affected 0 rows");

    saveBoardCanvasDataMock
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useBoardPersistence("board-1"));

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.handleChange([element("older-element")], {}, {});
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(result.current.saveStatus).toBe("saving");

    act(() => {
      result.current.handleChange([element("newer-element")], {}, {});
    });

    expect(result.current.saveStatus).toBe("unsaved");

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(result.current.saveStatus).toBe("unsaved");

    await act(async () => {
      firstSave.reject(staleSaveError);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.saveStatus).toBe("saved");
    expect(result.current.saveStatus).toBe("saved");
    expect(reportErrorMock).not.toHaveBeenCalled();
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

  it("reports a forced flush failure for the board being left without regressing the next board state", async () => {
    const saveError = new Error("Board save affected 0 rows during switch");
    getBoardMock.mockResolvedValueOnce({ canvas_data: null });
    getBoardMock.mockResolvedValueOnce({
      canvas_data: JSON.stringify({
        elements: [element("board-2-element")],
        appState: {
          viewBackgroundColor: "#222222",
        },
        files: {},
      }),
    });
    saveBoardCanvasDataMock.mockRejectedValueOnce(saveError);

    const { result, rerender } = renderHook(({ boardId }) => useBoardPersistence(boardId), {
      initialProps: { boardId: "board-1" },
    });

    await act(async () => {
      await flush();
    });

    vi.useFakeTimers();

    act(() => {
      result.current.handleChange([element("board-1-unsaved")], {}, {});
    });

    rerender({ boardId: "board-2" });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(reportErrorMock).toHaveBeenCalledWith(
      "Failed to save board canvas data for board board-1",
      saveError,
      expect.objectContaining({
        boardId: "board-1",
      }),
    );
    expect(result.current.initialData).toEqual({
      elements: [element("board-2-element")],
      appState: {
        viewBackgroundColor: "#222222",
      },
      files: {},
    });
    expect(result.current.saveStatus).toBe("saved");
  });

  it("flushes pending changes when the persistence hook unmounts", async () => {
    getBoardMock.mockResolvedValue({ canvas_data: null });

    const { result, unmount } = renderHook(() => useBoardPersistence("board-1"));

    await act(async () => {
      await Promise.resolve();
    });

    vi.useFakeTimers();

    act(() => {
      result.current.handleChange([element("before-unmount")], {}, {});
    });

    await act(async () => {
      unmount();
      await Promise.resolve();
    });

    expect(saveBoardCanvasDataMock).toHaveBeenCalledWith(
      "board-1",
      JSON.stringify({
        elements: [element("before-unmount")],
        appState: {
          viewBackgroundColor: undefined,
          gridSize: undefined,
          gridColor: undefined,
        },
        files: {},
      }),
    );
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

  it("ignores an old save completion after switching away from and back to the same board", async () => {
    vi.useFakeTimers();

    const firstSave = deferred<void>();
    saveBoardCanvasDataMock.mockImplementationOnce(() => firstSave.promise);

    getBoardMock.mockResolvedValueOnce({ canvas_data: null });
    getBoardMock.mockResolvedValueOnce({
      canvas_data: JSON.stringify({
        elements: [element("board-2-loaded")],
        appState: {
          viewBackgroundColor: "#eeeeee",
          gridSize: 10,
          gridColor: "#cccccc",
        },
        files: {},
      }),
    });
    getBoardMock.mockResolvedValueOnce({
      canvas_data: JSON.stringify({
        elements: [element("board-1-reloaded")],
        appState: {
          viewBackgroundColor: "#dddddd",
          gridSize: 6,
          gridColor: "#bbbbbb",
        },
        files: {},
      }),
    });

    const { result, rerender } = renderHook(({ boardId }) => useBoardPersistence(boardId), {
      initialProps: { boardId: "board-1" },
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.handleChange([element("board-1-unsaved")], {}, {});
    });

    rerender({ boardId: "board-2" });

    await act(async () => {
      await Promise.resolve();
    });

    rerender({ boardId: "board-1" });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.initialData).toEqual({
      elements: [element("board-1-reloaded")],
      appState: {
        viewBackgroundColor: "#dddddd",
        gridSize: 6,
        gridColor: "#bbbbbb",
      },
      files: {},
    });
    expect(result.current.saveStatus).toBe("saved");

    await act(async () => {
      firstSave.resolve();
      await Promise.resolve();
    });

    expect(result.current.initialData).toEqual({
      elements: [element("board-1-reloaded")],
      appState: {
        viewBackgroundColor: "#dddddd",
        gridSize: 6,
        gridColor: "#bbbbbb",
      },
      files: {},
    });
    expect(result.current.saveStatus).toBe("saved");
  });

  it("exposes a flushPendingSave promise that resolves after extraction and persistence finish", async () => {
    vi.useFakeTimers();
    getBoardMock.mockResolvedValue({ canvas_data: null });

    const extraction = deferred<ExcalidrawInitialDataState["files"]>();
    const save = deferred<void>();
    extractImagesToFilesystemMock.mockImplementationOnce(() => extraction.promise);
    saveBoardCanvasDataMock.mockImplementationOnce(() => save.promise);

    const { result } = renderHook(() => useBoardPersistence("board-1"));

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.handleChange([element("pending-flush")], {}, files);
    });

    let resolved = false;
    const flushPromise = result.current.flushPendingSave().then(() => {
      resolved = true;
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(extractImagesToFilesystemMock).toHaveBeenCalledWith("board-1", files);
    expect(saveBoardCanvasDataMock).not.toHaveBeenCalled();
    expect(resolved).toBe(false);

    await act(async () => {
      extraction.resolve(files);
      await Promise.resolve();
    });

    expect(saveBoardCanvasDataMock).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(false);

    await act(async () => {
      save.resolve();
      await flushPromise;
    });

    expect(resolved).toBe(true);
    expect(result.current.saveStatus).toBe("saved");
  });

  it("flushes the latest pending change through the forced flush path", async () => {
    vi.useFakeTimers();
    getBoardMock.mockResolvedValue({ canvas_data: null });

    const { result } = renderHook(() => useBoardPersistence("board-1"));

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.handleChange([element("older-change")], {}, {});
      result.current.handleChange(
        [element("newest-change")],
        {
          viewBackgroundColor: "#123456",
          gridSize: 9,
          gridColor: "#654321",
        },
        files,
      );
    });

    await act(async () => {
      await result.current.flushPendingSave();
    });

    expect(saveBoardCanvasDataMock).toHaveBeenCalledTimes(1);
    expect(saveBoardCanvasDataMock).toHaveBeenCalledWith(
      "board-1",
      JSON.stringify({
        elements: [element("newest-change")],
        appState: {
          viewBackgroundColor: "#123456",
          gridSize: 9,
          gridColor: "#654321",
        },
        files,
      }),
    );
    expect(result.current.initialData).toEqual({
      elements: [element("newest-change")],
      appState: {
        viewBackgroundColor: "#123456",
        gridSize: 9,
        gridColor: "#654321",
      },
      files,
    });
  });

  it("waits for the older in-flight save before writing and resolving a forced newer flush", async () => {
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
      result.current.handleChange([element("older-change")], {}, {});
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(saveBoardCanvasDataMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.handleChange([element("newer-change")], {}, {});
    });

    let resolved = false;
    const flushPromise = result.current.flushPendingSave().then(() => {
      resolved = true;
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(saveBoardCanvasDataMock).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(false);

    await act(async () => {
      firstSave.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveBoardCanvasDataMock).toHaveBeenCalledTimes(2);
    expect(resolved).toBe(false);

    await act(async () => {
      secondSave.resolve();
      await flushPromise;
    });

    expect(resolved).toBe(true);
    expect(result.current.saveStatus).toBe("saved");
  });
});
