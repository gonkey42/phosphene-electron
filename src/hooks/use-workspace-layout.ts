import { useRef, useState } from "react";
import type { Layout } from "react-resizable-panels";

import { debounce } from "../lib/debounce";
import { getWorkspaceLayout, saveWorkspaceLayout } from "../lib/workspace-operations";
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

export function useWorkspaceLayout(workspaceId: string | null) {
  const [layout, setLayout] = useState<WorkspaceLayoutConfig>(DEFAULT_LAYOUT);
  const [isLoaded, setIsLoaded] = useState(false);
  const reportError = useErrorReporter("WorkspaceLayout");
  const workspaceIdRef = useRef<string | null>(workspaceId);
  const saveLayoutRef = useRef<
    ((targetWorkspaceId: string, nextLayout: WorkspaceLayoutConfig) => void) | null
  >(null);

  workspaceIdRef.current = workspaceId;

  if (!saveLayoutRef.current) {
    saveLayoutRef.current = debounce(
      (targetWorkspaceId: string, nextLayout: WorkspaceLayoutConfig) => {
        void (async () => {
          try {
            await saveWorkspaceLayout(targetWorkspaceId, nextLayout);
          } catch (error) {
            reportError("Failed to save workspace layout", error);
          }
        })();
      },
      SAVE_DEBOUNCE_MS,
    );
  }

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

      saveLayoutRef.current?.(workspaceId, nextLayout);
      return nextLayout;
    });
  };

  return {
    layout,
    isLoaded,
    updatePanelSize,
    updateActiveBoard,
  };
}
