import { useCallback, useEffect, useRef, useState } from "react";
import type { Layout } from "react-resizable-panels";

import { debounce, type DebouncedFunction } from "../lib/debounce";
import { getWorkspaceLayout, saveWorkspaceLayout } from "../lib/workspace-operations";
import { lifecycle } from "../platform/desktop-api";
import { useAppStore } from "../stores/app-store";
import { useCancellableEffect } from "./use-cancellable-effect";
import { useErrorReporter } from "./use-error-reporter";

export interface WorkspaceLayoutConfig {
  primaryPanelSize: number;
  activeBoardId: string | null;
}

export const DEFAULT_LAYOUT: WorkspaceLayoutConfig = {
  primaryPanelSize: 75,
  activeBoardId: null,
};

const SAVE_DEBOUNCE_MS = 500;

type PendingLayoutSave = {
  workspaceId: string;
  layout: WorkspaceLayoutConfig;
};

export function useWorkspaceLayout(workspaceId: string | null) {
  const [layout, setLayout] = useState<WorkspaceLayoutConfig>(DEFAULT_LAYOUT);
  const [isLoaded, setIsLoaded] = useState(false);
  const reportError = useErrorReporter("WorkspaceLayout");
  const workspaceIdRef = useRef<string | null>(workspaceId);
  const reportErrorRef = useRef(reportError);
  const pendingLayoutSaveRef = useRef<PendingLayoutSave | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const latestQueuedSavePromiseRef = useRef<Promise<void> | null>(null);
  const saveLayoutRef = useRef<
    DebouncedFunction<(targetWorkspaceId: string, nextLayout: WorkspaceLayoutConfig) => Promise<void>>
    | null
  >(null);

  workspaceIdRef.current = workspaceId;
  reportErrorRef.current = reportError;

  if (!saveLayoutRef.current) {
    const queuePendingLayoutSave = () => {
      const pendingLayoutSave = pendingLayoutSaveRef.current;

      if (!pendingLayoutSave) {
        return Promise.resolve();
      }

      pendingLayoutSaveRef.current = null;

      const queuedSavePromise = saveChainRef.current.catch(() => undefined).then(async () => {
        try {
          await saveWorkspaceLayout(pendingLayoutSave.workspaceId, pendingLayoutSave.layout);
        } catch (error) {
          reportErrorRef.current("Failed to save workspace layout", error);
          throw error;
        }
      });

      saveChainRef.current = queuedSavePromise;
      latestQueuedSavePromiseRef.current = queuedSavePromise;

      void queuedSavePromise.then(
        () => {
          if (latestQueuedSavePromiseRef.current === queuedSavePromise) {
            latestQueuedSavePromiseRef.current = null;
          }
        },
        () => {
          if (latestQueuedSavePromiseRef.current === queuedSavePromise) {
            latestQueuedSavePromiseRef.current = null;
          }
        },
      );
      void queuedSavePromise.catch(() => undefined);

      return queuedSavePromise;
    };

    saveLayoutRef.current = debounce((targetWorkspaceId: string, nextLayout: WorkspaceLayoutConfig) => {
      pendingLayoutSaveRef.current = {
        workspaceId: targetWorkspaceId,
        layout: nextLayout,
      };

      return queuePendingLayoutSave();
    }, SAVE_DEBOUNCE_MS);
  }

  const flushPendingLayoutSave = useCallback(async () => {
    const flushResult = saveLayoutRef.current?.flush();

    if (flushResult) {
      await flushResult;
    }

    if (latestQueuedSavePromiseRef.current) {
      await latestQueuedSavePromiseRef.current;
    }
  }, []);

  useEffect(() => {
    return () => {
      void Promise.resolve(flushPendingLayoutSave()).catch(() => undefined);
    };
  }, [flushPendingLayoutSave, workspaceId]);

  useEffect(() => {
    return lifecycle.registerPendingWork(() => flushPendingLayoutSave());
  }, [flushPendingLayoutSave]);

  useCancellableEffect(
    (token) => {
      if (!workspaceId) {
        setLayout(DEFAULT_LAYOUT);
        setIsLoaded(true);
        return;
      }

      setIsLoaded(false);

      void (async () => {
        try {
          const storedLayout = await getWorkspaceLayout(workspaceId);

          if (token.cancelled || workspaceIdRef.current !== workspaceId) {
            return;
          }

          if (storedLayout && typeof storedLayout === "object") {
            const nextLayout = {
              ...DEFAULT_LAYOUT,
              ...storedLayout,
            } as WorkspaceLayoutConfig;

            setLayout(nextLayout);
            useAppStore
              .getState()
              .setActiveBoardForWorkspace(workspaceId, nextLayout.activeBoardId);
          } else {
            setLayout(DEFAULT_LAYOUT);
          }
        } catch (error) {
          if (token.cancelled || workspaceIdRef.current !== workspaceId) {
            return;
          }

          reportError("Failed to load workspace layout", error);
          setLayout(DEFAULT_LAYOUT);
        } finally {
          if (!token.cancelled && workspaceIdRef.current === workspaceId) {
            setIsLoaded(true);
          }
        }
      })();
    },
    [workspaceId],
  );

  const updatePanelSize = (sizes: Layout) => {
    if (!workspaceId) {
      return;
    }

    setLayout((currentLayout) => {
      const nextLayout = {
        ...currentLayout,
        primaryPanelSize: sizes.primary ?? currentLayout.primaryPanelSize,
      };

      pendingLayoutSaveRef.current = {
        workspaceId,
        layout: nextLayout,
      };
      saveLayoutRef.current?.(workspaceId, nextLayout);
      return nextLayout;
    });
  };

  const updateActiveBoard = (activeBoardId: string | null) => {
    if (!workspaceId) {
      return;
    }

    useAppStore.getState().setActiveBoardForWorkspace(workspaceId, activeBoardId);

    setLayout((currentLayout) => {
      const nextLayout = {
        ...currentLayout,
        activeBoardId,
      };

      pendingLayoutSaveRef.current = {
        workspaceId,
        layout: nextLayout,
      };
      saveLayoutRef.current?.(workspaceId, nextLayout);
      return nextLayout;
    });
  };

  return {
    layout,
    isLoaded,
    updatePanelSize,
    updateActiveBoard,
    flushPendingLayoutSave,
  };
}
