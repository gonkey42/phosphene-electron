import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { getBoard, saveBoardCanvasData } from "../lib/board-operations";
import { debounce, type DebouncedFunction } from "../lib/debounce";
import { extractImagesToFilesystem, injectImagesFromFilesystem } from "../lib/image-extraction";
import { lifecycle } from "../platform/desktop-api";
import { useErrorReporter } from "./use-error-reporter";

export type SaveStatus = "saved" | "saving" | "unsaved";

export const DEBOUNCE_MS = 500;

type PersistencePhase =
  | { type: "idle" }
  | { type: "loading"; boardId: string }
  | { type: "loaded"; boardId: string; initialData: ExcalidrawInitialDataState | null }
  | { type: "error"; boardId: string; initialData: null; error: Error };

type PersistenceAction =
  | { type: "START_LOAD"; boardId: string }
  | { type: "LOAD_SUCCESS"; boardId: string; initialData: ExcalidrawInitialDataState | null }
  | { type: "LOAD_ERROR"; boardId: string; error: Error }
  | { type: "RESET" }
  | {
      type: "UPDATE_LOCAL_SNAPSHOT";
      boardId: string;
      initialData: ExcalidrawInitialDataState;
    }
  | { type: "MARK_UNSAVED"; boardId: string }
  | { type: "MARK_SAVING"; boardId: string }
  | { type: "MARK_SAVED"; boardId: string }
  | { type: "MARK_SAVE_FAILED"; boardId: string };

interface PersistenceState {
  phase: PersistencePhase;
  saveStatus: SaveStatus;
}

function persistenceReducer(state: PersistenceState, action: PersistenceAction): PersistenceState {
  switch (action.type) {
    case "START_LOAD":
      return {
        phase: { type: "loading", boardId: action.boardId },
        saveStatus: "saved",
      };

    case "LOAD_SUCCESS":
      return {
        phase: {
          type: "loaded",
          boardId: action.boardId,
          initialData: action.initialData,
        },
        saveStatus: "saved",
      };

    case "LOAD_ERROR":
      return {
        phase: {
          type: "error",
          boardId: action.boardId,
          initialData: null,
          error: action.error,
        },
        saveStatus: "saved",
      };

    case "RESET":
      return { phase: { type: "idle" }, saveStatus: "saved" };

    case "UPDATE_LOCAL_SNAPSHOT":
      if (state.phase.type !== "loaded" || state.phase.boardId !== action.boardId) {
        return state;
      }

      return {
        phase: {
          ...state.phase,
          initialData: action.initialData,
        },
        saveStatus: "unsaved",
      };

    case "MARK_UNSAVED":
      if (state.phase.type === "idle" || state.phase.boardId !== action.boardId) {
        return state;
      }
      return { ...state, saveStatus: "unsaved" };

    case "MARK_SAVING":
      if (state.phase.type === "idle" || state.phase.boardId !== action.boardId) {
        return state;
      }
      return { ...state, saveStatus: "saving" };

    case "MARK_SAVED":
      if (state.phase.type === "idle" || state.phase.boardId !== action.boardId) {
        return state;
      }
      return { ...state, saveStatus: "saved" };

    case "MARK_SAVE_FAILED":
      if (state.phase.type === "idle" || state.phase.boardId !== action.boardId) {
        return state;
      }
      return { ...state, saveStatus: "unsaved" };

    default:
      return state;
  }
}

type StoredCanvasData = {
  elements?: ExcalidrawInitialDataState["elements"];
  appState?: ExcalidrawInitialDataState["appState"];
  files?: ExcalidrawInitialDataState["files"];
};

type CanvasChangeAppState = {
  viewBackgroundColor?: string;
  gridSize?: number;
  gridColor?: string;
};

type PendingSave = {
  boardId: string;
  saveToken: number;
  saveSessionId: number;
  elements: ExcalidrawInitialDataState["elements"];
  appState: CanvasChangeAppState;
  files: ExcalidrawInitialDataState["files"];
};

function buildCanvasData(
  elements: ExcalidrawInitialDataState["elements"],
  appState: CanvasChangeAppState,
  files: ExcalidrawInitialDataState["files"],
) {
  return JSON.stringify({
    elements,
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      gridSize: appState.gridSize,
      gridColor: appState.gridColor,
    },
    files,
  });
}

function getSaveIdentity(pendingSave: Pick<PendingSave, "boardId" | "saveToken" | "saveSessionId">) {
  return `${pendingSave.boardId}:${pendingSave.saveSessionId}:${pendingSave.saveToken}`;
}

export function useBoardPersistence(boardId: string | null | undefined) {
  const [state, dispatch] = useReducer(persistenceReducer, {
    phase: { type: "idle" },
    saveStatus: "saved",
  });
  const reportError = useErrorReporter("BoardPersistence");

  const currentBoardIdRef = useRef<string | null>(boardId ?? null);
  const loadRequestRef = useRef(0);
  const boardSessionRef = useRef(0);
  const saveSequenceRef = useRef(0);
  const pendingSaveRef = useRef<PendingSave | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const latestQueuedSavePromiseRef = useRef<Promise<void> | null>(null);
  const latestQueuedSaveRef = useRef<PendingSave | null>(null);
  const forcedFailureReportKeysRef = useRef(new Set<string>());
  const saveDispatcherRef = useRef<DebouncedFunction<() => Promise<void>> | null>(null);
  const hasBoardId = boardId !== undefined && boardId !== null;

  const initialData =
    hasBoardId && state.phase.type === "loaded" && state.phase.boardId === boardId
      ? state.phase.initialData
      : null;

  const loadError =
    hasBoardId && state.phase.type === "error" && state.phase.boardId === boardId
      ? state.phase.error
      : null;

  const isLoading = hasBoardId
    ? state.phase.type === "idle" ||
      state.phase.type === "loading" ||
      state.phase.boardId !== boardId
    : false;

  const saveStatus =
    hasBoardId && state.phase.type !== "idle" && state.phase.boardId === boardId
      ? state.saveStatus
      : "saved";

  useEffect(() => {
    currentBoardIdRef.current = boardId ?? null;
  }, [boardId]);

  const executeSave = useCallback(
    async (pendingSave: PendingSave) => {
      dispatch({ type: "MARK_SAVING", boardId: pendingSave.boardId });

      try {
        const extractedFiles =
          pendingSave.files && Object.keys(pendingSave.files).length > 0
            ? await extractImagesToFilesystem(pendingSave.boardId, pendingSave.files)
            : {};
        const canvasData = buildCanvasData(
          pendingSave.elements,
          pendingSave.appState,
          extractedFiles,
        );
        await saveBoardCanvasData(pendingSave.boardId, canvasData);

        if (
          currentBoardIdRef.current === pendingSave.boardId &&
          saveSequenceRef.current === pendingSave.saveToken &&
          boardSessionRef.current === pendingSave.saveSessionId
        ) {
          dispatch({ type: "MARK_SAVED", boardId: pendingSave.boardId });
        }
      } catch (error) {
        const saveIdentity = getSaveIdentity(pendingSave);
        const shouldReportFailure =
          forcedFailureReportKeysRef.current.has(saveIdentity) ||
          (currentBoardIdRef.current === pendingSave.boardId &&
            saveSequenceRef.current === pendingSave.saveToken &&
            boardSessionRef.current === pendingSave.saveSessionId);

        if (shouldReportFailure) {
          reportError(`Failed to save board canvas data for board ${pendingSave.boardId}`, error, {
            boardId: pendingSave.boardId,
            saveToken: pendingSave.saveToken,
            saveSessionId: pendingSave.saveSessionId,
            forcedFlush: forcedFailureReportKeysRef.current.has(saveIdentity),
          });
        }

        if (
          currentBoardIdRef.current === pendingSave.boardId &&
          saveSequenceRef.current === pendingSave.saveToken &&
          boardSessionRef.current === pendingSave.saveSessionId
        ) {
          dispatch({ type: "MARK_SAVE_FAILED", boardId: pendingSave.boardId });
        }

        throw error;
      } finally {
        forcedFailureReportKeysRef.current.delete(getSaveIdentity(pendingSave));
      }
    },
    [reportError],
  );

  const queuePendingSave = useCallback(() => {
    const pendingSave = pendingSaveRef.current;

    if (!pendingSave) {
      return undefined;
    }

    pendingSaveRef.current = null;
    latestQueuedSaveRef.current = pendingSave;

    const queuedSavePromise = saveChainRef.current.catch(() => undefined).then(() => {
      return executeSave(pendingSave);
    });

    saveChainRef.current = queuedSavePromise;
    latestQueuedSavePromiseRef.current = queuedSavePromise;

    void queuedSavePromise.then(
      () => {
        if (latestQueuedSavePromiseRef.current === queuedSavePromise) {
          latestQueuedSavePromiseRef.current = null;
        }
        if (latestQueuedSaveRef.current === pendingSave) {
          latestQueuedSaveRef.current = null;
        }
      },
      () => {
        if (latestQueuedSavePromiseRef.current === queuedSavePromise) {
          latestQueuedSavePromiseRef.current = null;
        }
        if (latestQueuedSaveRef.current === pendingSave) {
          latestQueuedSaveRef.current = null;
        }
      },
    );

    return queuedSavePromise;
  }, [executeSave]);

  if (!saveDispatcherRef.current) {
    saveDispatcherRef.current = debounce(() => {
      const savePromise = queuePendingSave();

      if (!savePromise) {
        return Promise.resolve();
      }

      void savePromise.catch(() => undefined);
      return savePromise;
    }, DEBOUNCE_MS);
  }

  const flushPendingSave = useCallback(async () => {
    if (pendingSaveRef.current) {
      forcedFailureReportKeysRef.current.add(getSaveIdentity(pendingSaveRef.current));
    }
    if (latestQueuedSaveRef.current) {
      forcedFailureReportKeysRef.current.add(getSaveIdentity(latestQueuedSaveRef.current));
    }

    const flushResult = saveDispatcherRef.current?.flush();

    if (flushResult) {
      await flushResult;
    }

    if (latestQueuedSavePromiseRef.current) {
      await latestQueuedSavePromiseRef.current;
    }
  }, []);

  useEffect(() => {
    return lifecycle.registerPendingWork(() => flushPendingSave());
  }, [flushPendingSave]);

  useEffect(() => {
    const flushCurrentPendingSave = () => flushPendingSave();

    if (pendingSaveRef.current && pendingSaveRef.current.boardId !== boardId) {
      void flushCurrentPendingSave().catch(() => undefined);
    }

    loadRequestRef.current += 1;
    const requestId = loadRequestRef.current;
    boardSessionRef.current += 1;
    const sessionId = boardSessionRef.current;

    if (boardId === undefined || boardId === null) {
      dispatch({ type: "RESET" });
      return;
    }

    dispatch({ type: "START_LOAD", boardId });

    void (async () => {
      try {
        const board = await getBoard(boardId);

        if (
          loadRequestRef.current !== requestId ||
          currentBoardIdRef.current !== boardId ||
          boardSessionRef.current !== sessionId
        ) {
          return;
        }

        if (!board?.canvas_data) {
          dispatch({ type: "LOAD_SUCCESS", boardId, initialData: null });
          return;
        }

        let parsed: StoredCanvasData;

        try {
          parsed = JSON.parse(board.canvas_data) as StoredCanvasData;
        } catch (error) {
          console.error("Failed to parse board canvas data", error);
          dispatch({
            type: "LOAD_ERROR",
            boardId,
            error: error instanceof Error ? error : new Error("Failed to parse board canvas data"),
          });
          return;
        }

        const files = parsed.files ? await injectImagesFromFilesystem(parsed.files) : {};

        if (
          loadRequestRef.current !== requestId ||
          currentBoardIdRef.current !== boardId ||
          boardSessionRef.current !== sessionId
        ) {
          return;
        }

        dispatch({
          type: "LOAD_SUCCESS",
          boardId,
          initialData: {
            elements: parsed.elements || [],
            appState: parsed.appState || {},
            files,
          },
        });
      } catch (error) {
        if (
          loadRequestRef.current === requestId &&
          currentBoardIdRef.current === boardId &&
          boardSessionRef.current === sessionId
        ) {
          console.error("Failed to load board canvas data", error);
          dispatch({
            type: "LOAD_ERROR",
            boardId,
            error: error instanceof Error ? error : new Error("Failed to load board canvas data"),
          });
        }
      }
    })();

    return () => {
      void flushCurrentPendingSave().catch(() => undefined);
    };
  }, [boardId, flushPendingSave]);

  const handleChange = useCallback(
    (
      elements: ExcalidrawInitialDataState["elements"],
      appState: CanvasChangeAppState,
      files: ExcalidrawInitialDataState["files"],
    ) => {
      if (boardId === undefined || boardId === null) {
        return;
      }

      const scheduledBoardId = boardId;
      const saveToken = ++saveSequenceRef.current;
      const saveSessionId = boardSessionRef.current;
      dispatch({
        type: "UPDATE_LOCAL_SNAPSHOT",
        boardId: scheduledBoardId,
        initialData: {
          elements,
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor,
            gridSize: appState.gridSize,
            gridColor: appState.gridColor,
          } as ExcalidrawInitialDataState["appState"],
          files,
        },
      });

      pendingSaveRef.current = {
        boardId: scheduledBoardId,
        saveToken,
        saveSessionId,
        elements,
        appState,
        files,
      };
      saveDispatcherRef.current?.();
    },
    [boardId],
  );

  return {
    initialData,
    loadError,
    isLoading,
    saveStatus,
    handleChange,
    flushPendingSave,
  };
}
