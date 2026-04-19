import { useCallback, useEffect, useRef, useState, type ComponentProps, type DragEvent } from "react";

import { Excalidraw } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

import { useKeyboardContext } from "../../contexts/KeyboardContext";
import { useAppStore } from "../../stores/app-store";
import {
  createSyntheticDropTransfer,
  extractWebImageUrl,
  readImageUrlAsFile,
} from "../../lib/web-image-drop";

import "./ExcalidrawCanvas.css";

export type ExcalidrawCanvasProps = {
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
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
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

  const translateBrowserDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>, imageUrl: string) => {
      try {
        const file = await readImageUrlAsFile(imageUrl);
        const syntheticTransfer = createSyntheticDropTransfer(file);
        const target = event.target instanceof Element ? event.target : wrapperRef.current?.firstElementChild;

        if (!target) {
          return;
        }

        const syntheticDropEvent = new Event("drop", {
          bubbles: true,
          cancelable: true,
        });

        Object.defineProperty(syntheticDropEvent, "dataTransfer", {
          configurable: true,
          enumerable: true,
          value: syntheticTransfer,
        });

        target.dispatchEvent(syntheticDropEvent);
      } catch (error) {
        const message = "Failed to import dropped image.";

        apiRef.current?.setToast({
          message,
        });
        console.error(message, error);
      }
    },
    [],
  );

  const handleDropCapture = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!isInteractive) {
        return;
      }

      const dataTransfer = event.dataTransfer;

      if (dataTransfer.files.length > 0) {
        return;
      }

      const imageUrl = extractWebImageUrl(dataTransfer);

      if (!imageUrl) {
        console.warn("Unsupported browser drop payload", Array.from(dataTransfer.types));
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      void translateBrowserDrop(event, imageUrl);
    },
    [isInteractive],
  );

  return (
    <div
      ref={wrapperRef}
      className="excalidraw-wrapper"
      onDropCapture={handleDropCapture}
      onPointerDown={handlePointerDown}
    >
      <Excalidraw
        key={`${boardId}:${reactivationKey}`}
        excalidrawAPI={setExcalidrawApi}
        initialData={initialData ?? undefined}
        onChange={handleChange}
        UIOptions={canvasUIOptions}
        theme={resolvedTheme}
        viewModeEnabled={!isInteractive}
      />
    </div>
  );
}
