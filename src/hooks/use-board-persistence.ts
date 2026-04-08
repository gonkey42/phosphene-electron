import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { getBoard, saveBoardCanvasData } from "../lib/board-operations";
import { extractImagesToFilesystem, injectImagesFromFilesystem } from "../lib/image-extraction";

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

export function useBoardPersistence(boardId: string | null | undefined) {
  const [state, dispatch] = useReducer(persistenceReducer, {
    phase: { type: "idle" },
    saveStatus: "saved",
  });

  const currentBoardIdRef = useRef<string | null>(boardId ?? null);
  const loadRequestRef = useRef(0);
  const boardSessionRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSequenceRef = useRef(0);
  const pendingSaveRef = useRef<null | { boardId: string; flush: () => void }>(null);
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

  useEffect(() => {
    const flushPendingSave = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      const pendingSave = pendingSaveRef.current;
      pendingSaveRef.current = null;
      pendingSave?.flush();
    };

    if (pendingSaveRef.current && pendingSaveRef.current.boardId !== boardId) {
      flushPendingSave();
    }

    loadRequestRef.current += 1;
    const requestId = loadRequestRef.current;
    boardSessionRef.current += 1;
    const sessionId = boardSessionRef.current;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

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
      flushPendingSave();
    };
  }, [boardId]);

  const handleChange = useCallback(
    (
      elements: ExcalidrawInitialDataState["elements"],
      appState: CanvasChangeAppState,
      files: ExcalidrawInitialDataState["files"],
    ) => {
      if (boardId === undefined || boardId === null) {
        return;
      }

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
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

      const flushSave = () => {
        if (
          currentBoardIdRef.current === scheduledBoardId &&
          boardSessionRef.current === saveSessionId
        ) {
          dispatch({ type: "MARK_SAVING", boardId: scheduledBoardId });
        }

        void (async () => {
          try {
            const extractedFiles =
              files && Object.keys(files).length > 0
                ? await extractImagesToFilesystem(scheduledBoardId, files)
                : {};
            const canvasData = buildCanvasData(elements, appState, extractedFiles);
            await saveBoardCanvasData(scheduledBoardId, canvasData);

            if (
              currentBoardIdRef.current === scheduledBoardId &&
              saveSequenceRef.current === saveToken &&
              boardSessionRef.current === saveSessionId
            ) {
              dispatch({ type: "MARK_SAVED", boardId: scheduledBoardId });
            }
          } catch (error) {
            console.error("Failed to save board canvas data", error);

            if (
              currentBoardIdRef.current === scheduledBoardId &&
              saveSequenceRef.current === saveToken &&
              boardSessionRef.current === saveSessionId
            ) {
              dispatch({ type: "MARK_SAVE_FAILED", boardId: scheduledBoardId });
            }
          }
        })();
      };

      pendingSaveRef.current = {
        boardId: scheduledBoardId,
        flush: flushSave,
      };

      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;

        if (pendingSaveRef.current?.boardId === scheduledBoardId) {
          pendingSaveRef.current = null;
        }

        flushSave();
      }, DEBOUNCE_MS);
    },
    [boardId],
  );

  return {
    initialData,
    loadError,
    isLoading,
    saveStatus,
    handleChange,
  };
}
