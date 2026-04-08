import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";

import { Excalidraw } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

import { useKeyboardContext } from "../../contexts/KeyboardContext";

import "./ExcalidrawCanvas.css";

type ExcalidrawCanvasProps = {
  boardId: string;
  initialData: ExcalidrawInitialDataState | null;
  onChange: NonNullable<ComponentProps<typeof Excalidraw>["onChange"]>;
  isInteractive?: boolean;
};

type ExcalidrawChangeHandler = NonNullable<ComponentProps<typeof Excalidraw>["onChange"]>;

const canvasUIOptions = {
  canvasActions: {
    loadScene: false,
    export: false,
    saveToActiveFile: false,
  },
} as const;

export function ExcalidrawCanvas({
  boardId,
  initialData,
  onChange,
  isInteractive = true,
}: ExcalidrawCanvasProps) {
  const { claimFocus } = useKeyboardContext();
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const isReadyRef = useRef(false);
  const activeBoardIdRef = useRef(boardId);
  const wasInteractiveRef = useRef(isInteractive);
  const [reactivationKey, setReactivationKey] = useState(0);

  if (activeBoardIdRef.current !== boardId) {
    activeBoardIdRef.current = boardId;
    isReadyRef.current = false;
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      isReadyRef.current = true;
    }, 50);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [boardId, reactivationKey]);

  useEffect(() => {
    apiRef.current?.updateScene({
      appState: {
        viewModeEnabled: !isInteractive,
      },
    });

    if (isInteractive) {
      apiRef.current?.refresh();
    }
  }, [isInteractive]);

  useEffect(() => {
    if (isInteractive && !wasInteractiveRef.current) {
      isReadyRef.current = false;
      setReactivationKey((currentKey) => currentKey + 1);
    }

    wasInteractiveRef.current = isInteractive;
  }, [isInteractive]);

  const setExcalidrawApi = useCallback((api: ExcalidrawImperativeAPI | null) => {
    apiRef.current = api;
  }, []);

  const handleChange = useCallback(
    (
      elements: Parameters<ExcalidrawChangeHandler>[0],
      appState: Parameters<ExcalidrawChangeHandler>[1],
      files: Parameters<ExcalidrawChangeHandler>[2],
    ) => {
      if (!isReadyRef.current || !isInteractive) {
        return;
      }

      onChange(elements, appState, files);
    },
    [isInteractive, onChange],
  );

  const handlePointerDown = useCallback(() => {
    if (!isInteractive) {
      return;
    }

    claimFocus("canvas");
  }, [claimFocus, isInteractive]);

  return (
    <div ref={wrapperRef} className="excalidraw-wrapper" onPointerDown={handlePointerDown}>
      <Excalidraw
        key={`${boardId}:${reactivationKey}`}
        excalidrawAPI={setExcalidrawApi}
        initialData={initialData ?? undefined}
        onChange={handleChange}
        UIOptions={canvasUIOptions}
        viewModeEnabled={!isInteractive}
      />
    </div>
  );
}

export function isPointInsideRect(point: { x: number; y: number }, rect: DOMRect): boolean {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  );
}

export function getDropTarget(wrapper: HTMLDivElement): HTMLElement {
  return wrapper.firstElementChild instanceof HTMLElement ? wrapper.firstElementChild : wrapper;
}

export function createSyntheticDropEvent(files: File[], point: { x: number; y: number }): Event {
  const event = new Event("drop", {
    bubbles: true,
    cancelable: true,
  });

  Object.defineProperties(event, {
    dataTransfer: {
      value: createDataTransfer(files),
    },
    clientX: {
      value: point.x,
    },
    clientY: {
      value: point.y,
    },
  });

  return event;
}

function createDataTransfer(files: File[]): { files: File[] | FileList } | DataTransfer {
  if (typeof DataTransfer === "function") {
    const dataTransfer = new DataTransfer();

    for (const file of files) {
      dataTransfer.items.add(file);
    }

    return dataTransfer;
  }

  return { files };
}
