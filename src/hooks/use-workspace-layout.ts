import { useCallback, useEffect, useRef, useState } from "react";
import type { Layout } from "react-resizable-panels";

import { debounce, type DebouncedFunction } from "../lib/debounce";
import { getWorkspaceLayout, saveWorkspaceLayout } from "../lib/workspace-operations";
import { browser, lifecycle } from "../platform/desktop-api";
import { useAppStore } from "../stores/app-store";
import { useCancellableEffect } from "./use-cancellable-effect";
import { useErrorReporter } from "./use-error-reporter";

export interface WorkspaceLayoutConfig {
  primaryPanelSize: number;
  lastVisiblePrimaryPanelSize: number;
  boardsVisible: boolean;
  browserVisible: boolean;
  activeBoardId: string | null;
}

export const DEFAULT_LAYOUT: WorkspaceLayoutConfig = {
  primaryPanelSize: 75,
  lastVisiblePrimaryPanelSize: 75,
  boardsVisible: true,
  browserVisible: true,
  activeBoardId: null,
};

const SAVE_DEBOUNCE_MS = 500;

type PendingLayoutSave = {
  workspaceId: string;
  layout: WorkspaceLayoutConfig;
};

type ConfirmedBrowserLayoutFields = Pick<
  WorkspaceLayoutConfig,
  "browserVisible" | "primaryPanelSize" | "lastVisiblePrimaryPanelSize"
>;

const MIN_VISIBLE_PRIMARY_PANEL_SIZE = 30;
const MAX_VISIBLE_PRIMARY_PANEL_SIZE = 85;
const COLLAPSED_BROWSER_PRIMARY_PANEL_SIZE = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampVisiblePrimaryPanelSize(value: number): number {
  return Math.min(
    MAX_VISIBLE_PRIMARY_PANEL_SIZE,
    Math.max(MIN_VISIBLE_PRIMARY_PANEL_SIZE, value),
  );
}

function getFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function getActiveBoardId(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  return typeof value === "string" && value.trim().length > 0 ? value : DEFAULT_LAYOUT.activeBoardId;
}

function getConfirmedBrowserLayoutFields(layout: WorkspaceLayoutConfig): ConfirmedBrowserLayoutFields {
  return {
    browserVisible: layout.browserVisible,
    primaryPanelSize: layout.primaryPanelSize,
    lastVisiblePrimaryPanelSize: layout.lastVisiblePrimaryPanelSize,
  };
}

function getHiddenBrowserLayoutFields(layout: WorkspaceLayoutConfig): ConfirmedBrowserLayoutFields {
  return {
    browserVisible: false,
    primaryPanelSize: COLLAPSED_BROWSER_PRIMARY_PANEL_SIZE,
    lastVisiblePrimaryPanelSize: layout.lastVisiblePrimaryPanelSize,
  };
}

export function normalizeWorkspaceLayoutConfig(value: unknown): WorkspaceLayoutConfig {
  if (!isRecord(value)) {
    return DEFAULT_LAYOUT;
  }

  const boardsVisible = getBoolean(value.boardsVisible, DEFAULT_LAYOUT.boardsVisible);
  const browserVisible = getBoolean(value.browserVisible, DEFAULT_LAYOUT.browserVisible);
  const rawLastVisibleSize = getFiniteNumber(value.lastVisiblePrimaryPanelSize);
  const rawPrimarySize = getFiniteNumber(value.primaryPanelSize);
  let lastVisiblePrimaryPanelSize =
    rawLastVisibleSize === null
      ? DEFAULT_LAYOUT.lastVisiblePrimaryPanelSize
      : clampVisiblePrimaryPanelSize(rawLastVisibleSize);
  let primaryPanelSize: number;

  if (browserVisible) {
    if (
      rawPrimarySize === null ||
      rawPrimarySize === COLLAPSED_BROWSER_PRIMARY_PANEL_SIZE
    ) {
      primaryPanelSize = lastVisiblePrimaryPanelSize;
    } else {
      primaryPanelSize = clampVisiblePrimaryPanelSize(rawPrimarySize);
    }
  } else {
    if (
      rawPrimarySize !== null &&
      rawPrimarySize >= MIN_VISIBLE_PRIMARY_PANEL_SIZE &&
      rawPrimarySize <= MAX_VISIBLE_PRIMARY_PANEL_SIZE
    ) {
      lastVisiblePrimaryPanelSize = clampVisiblePrimaryPanelSize(rawPrimarySize);
    }

    primaryPanelSize = COLLAPSED_BROWSER_PRIMARY_PANEL_SIZE;
  }

  return {
    primaryPanelSize,
    lastVisiblePrimaryPanelSize,
    boardsVisible,
    browserVisible,
    activeBoardId: getActiveBoardId(value.activeBoardId),
  };
}

export function useWorkspaceLayout(workspaceId: string | null) {
  const [layout, setLayout] = useState<WorkspaceLayoutConfig>(DEFAULT_LAYOUT);
  const [isLoaded, setIsLoaded] = useState(false);
  const reportError = useErrorReporter("WorkspaceLayout");
  const workspaceIdRef = useRef<string | null>(workspaceId);
  const reportErrorRef = useRef(reportError);
  const pendingLayoutSaveRef = useRef<PendingLayoutSave | null>(null);
  const pendingBrowserHideRef = useRef(false);
  const pendingBrowserRestoreRef = useRef(false);
  const pendingBrowserRestoreNativeRef = useRef(false);
  const pendingBrowserRestoreRenderedRef = useRef(false);
  const suppressPendingBrowserRestoreSavesRef = useRef(false);
  const pendingBrowserRestoreFallbackRef = useRef<ConfirmedBrowserLayoutFields | null>(null);
  const confirmedBrowserLayoutRef = useRef<ConfirmedBrowserLayoutFields>({
    browserVisible: DEFAULT_LAYOUT.browserVisible,
    primaryPanelSize: DEFAULT_LAYOUT.primaryPanelSize,
    lastVisiblePrimaryPanelSize: DEFAULT_LAYOUT.lastVisiblePrimaryPanelSize,
  });
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

  const persistLayout = useCallback((targetWorkspaceId: string, nextLayout: WorkspaceLayoutConfig) => {
    if (
      pendingBrowserRestoreRef.current &&
      suppressPendingBrowserRestoreSavesRef.current &&
      nextLayout.browserVisible
    ) {
      return;
    }

    const layoutForSave =
      (pendingBrowserHideRef.current && !nextLayout.browserVisible) ||
      (pendingBrowserRestoreRef.current && nextLayout.browserVisible)
        ? {
            ...nextLayout,
            ...confirmedBrowserLayoutRef.current,
          }
        : nextLayout;

    pendingLayoutSaveRef.current = {
      workspaceId: targetWorkspaceId,
      layout: layoutForSave,
    };
    saveLayoutRef.current?.(targetWorkspaceId, layoutForSave);
  }, []);

  const clearPendingBrowserVisibility = () => {
    pendingBrowserHideRef.current = false;
    pendingBrowserRestoreRef.current = false;
    pendingBrowserRestoreNativeRef.current = false;
    pendingBrowserRestoreRenderedRef.current = false;
    suppressPendingBrowserRestoreSavesRef.current = false;
    pendingBrowserRestoreFallbackRef.current = null;
  };

  const beginBrowserRestore = (
    currentLayout: WorkspaceLayoutConfig,
    renderedApplied: boolean,
    confirmedFields = getConfirmedBrowserLayoutFields(currentLayout),
    suppressSaves = false,
  ) => {
    pendingBrowserHideRef.current = false;
    pendingBrowserRestoreRef.current = true;
    pendingBrowserRestoreNativeRef.current = false;
    pendingBrowserRestoreRenderedRef.current = renderedApplied;
    suppressPendingBrowserRestoreSavesRef.current = suppressSaves;
    confirmedBrowserLayoutRef.current = confirmedFields;
    pendingBrowserRestoreFallbackRef.current = suppressSaves
      ? getHiddenBrowserLayoutFields(currentLayout)
      : null;
  };

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
        clearPendingBrowserVisibility();
        setLayout(DEFAULT_LAYOUT);
        confirmedBrowserLayoutRef.current = getConfirmedBrowserLayoutFields(DEFAULT_LAYOUT);
        setIsLoaded(true);
        return;
      }

      clearPendingBrowserVisibility();
      setIsLoaded(false);

      void (async () => {
        try {
          const storedLayout = await getWorkspaceLayout(workspaceId);

          if (token.cancelled || workspaceIdRef.current !== workspaceId) {
            return;
          }

          if (storedLayout && typeof storedLayout === "object") {
            const nextLayout = normalizeWorkspaceLayoutConfig(storedLayout);

            setLayout(nextLayout);
            confirmedBrowserLayoutRef.current = getConfirmedBrowserLayoutFields(nextLayout);
            useAppStore
              .getState()
              .setActiveBoardForWorkspace(workspaceId, nextLayout.activeBoardId);
          } else {
            setLayout(DEFAULT_LAYOUT);
            confirmedBrowserLayoutRef.current = getConfirmedBrowserLayoutFields(DEFAULT_LAYOUT);
          }
        } catch (error) {
          if (token.cancelled || workspaceIdRef.current !== workspaceId) {
            return;
          }

          reportError("Failed to load workspace layout", error);
          setLayout(DEFAULT_LAYOUT);
          confirmedBrowserLayoutRef.current = getConfirmedBrowserLayoutFields(DEFAULT_LAYOUT);
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
      const primarySize = sizes.primary ?? currentLayout.primaryPanelSize;
      const secondarySize = sizes.secondary ?? 100 - primarySize;
      const isCollapsed = secondarySize <= 0 || primarySize >= COLLAPSED_BROWSER_PRIMARY_PANEL_SIZE;
      const isUsefulVisible =
        secondarySize >= 15 &&
        primarySize >= MIN_VISIBLE_PRIMARY_PANEL_SIZE &&
        primarySize <= MAX_VISIBLE_PRIMARY_PANEL_SIZE;
      const browserVisible = isCollapsed ? false : isUsefulVisible ? true : currentLayout.browserVisible;
      const primaryPanelSize =
        !currentLayout.browserVisible && !isUsefulVisible
          ? COLLAPSED_BROWSER_PRIMARY_PANEL_SIZE
          : isCollapsed
            ? COLLAPSED_BROWSER_PRIMARY_PANEL_SIZE
            : clampVisiblePrimaryPanelSize(primarySize);
      const nextLayout = {
        ...currentLayout,
        primaryPanelSize,
        lastVisiblePrimaryPanelSize: isUsefulVisible
          ? clampVisiblePrimaryPanelSize(primarySize)
          : currentLayout.lastVisiblePrimaryPanelSize,
        browserVisible,
      };

      if (!currentLayout.browserVisible && isUsefulVisible) {
        beginBrowserRestore(currentLayout, true);
      }

      if (!(pendingBrowserRestoreRef.current && nextLayout.browserVisible)) {
        persistLayout(workspaceId, nextLayout);
      }
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

      persistLayout(workspaceId, nextLayout);
      return nextLayout;
    });
  };

  const setBoardsVisible = useCallback((visible: boolean) => {
    if (!workspaceId) {
      return;
    }

    setLayout((currentLayout) => {
      if (currentLayout.boardsVisible === visible) {
        return currentLayout;
      }

      const nextLayout = {
        ...currentLayout,
        boardsVisible: visible,
      };

      persistLayout(workspaceId, nextLayout);
      return nextLayout;
    });
  }, [persistLayout, workspaceId]);

  const toggleBoardsVisible = () => {
    setBoardsVisible(!layout.boardsVisible);
  };

  const ensureBrowserHidden = useCallback(async (): Promise<boolean> => {
    try {
      await browser.hide();
      return true;
    } catch (error) {
      reportError("Failed to hide browser panel", error);
      setLayout((currentLayout) => {
        if (currentLayout.browserVisible) {
          return currentLayout;
        }

        const restoredPrimarySize = clampVisiblePrimaryPanelSize(
          currentLayout.lastVisiblePrimaryPanelSize,
        );
        const nextLayout = {
          ...currentLayout,
          primaryPanelSize: restoredPrimarySize,
          lastVisiblePrimaryPanelSize: restoredPrimarySize,
          browserVisible: true,
        };

        beginBrowserRestore(currentLayout, false);
        return nextLayout;
      });
      return false;
    }
  }, [reportError]);

  const commitBrowserRestoreIfReady = useCallback(() => {
    if (!workspaceId) {
      return;
    }

    if (
      !pendingBrowserRestoreRef.current ||
      !pendingBrowserRestoreNativeRef.current ||
      !pendingBrowserRestoreRenderedRef.current
    ) {
      return;
    }

    clearPendingBrowserVisibility();

    setLayout((currentLayout) => {
      if (!currentLayout.browserVisible) {
        return currentLayout;
      }

      confirmedBrowserLayoutRef.current = getConfirmedBrowserLayoutFields(currentLayout);
      persistLayout(workspaceId, currentLayout);
      return currentLayout;
    });
  }, [persistLayout, workspaceId]);

  const confirmBrowserRestored = useCallback(() => {
    pendingBrowserRestoreNativeRef.current = true;
    commitBrowserRestoreIfReady();
  }, [commitBrowserRestoreIfReady]);

  const confirmBrowserLayoutApplied = useCallback(() => {
    if (pendingBrowserHideRef.current) {
      if (!workspaceId) {
        return;
      }

      pendingBrowserHideRef.current = false;
      setLayout((currentLayout) => {
        if (currentLayout.browserVisible) {
          return currentLayout;
        }

        confirmedBrowserLayoutRef.current = getConfirmedBrowserLayoutFields(currentLayout);
        persistLayout(workspaceId, currentLayout);
        return currentLayout;
      });
      return;
    }

    if (pendingBrowserRestoreRef.current) {
      pendingBrowserRestoreRenderedRef.current = true;
      commitBrowserRestoreIfReady();
    }
  }, [commitBrowserRestoreIfReady, persistLayout, workspaceId]);

  const handleBrowserLayoutApplyFailure = useCallback((error: unknown) => {
    if (!pendingBrowserHideRef.current && !pendingBrowserRestoreRef.current) {
      return;
    }

    reportError("Failed to apply browser panel layout", error);
    const wasPendingHide = pendingBrowserHideRef.current;
    const shouldFallbackHidden = suppressPendingBrowserRestoreSavesRef.current;
    const confirmedFields = confirmedBrowserLayoutRef.current;
    const fallbackFields = pendingBrowserRestoreFallbackRef.current;
    clearPendingBrowserVisibility();

    if (!workspaceId) {
      return;
    }

    setLayout((currentLayout) => {
      const nextLayout = {
        ...currentLayout,
        ...confirmedFields,
      };

      if (wasPendingHide) {
        beginBrowserRestore(currentLayout, false, confirmedFields, true);
      } else if (shouldFallbackHidden) {
        const fallbackLayout = {
          ...currentLayout,
          ...(fallbackFields ?? getHiddenBrowserLayoutFields(currentLayout)),
        };
        confirmedBrowserLayoutRef.current = getConfirmedBrowserLayoutFields(fallbackLayout);
        persistLayout(workspaceId, fallbackLayout);
        return fallbackLayout;
      } else {
        persistLayout(workspaceId, nextLayout);
      }
      return nextLayout;
    });
  }, [persistLayout, reportError, workspaceId]);

  const handleBrowserRestoreFailure = useCallback((error: unknown) => {
    if (!workspaceId) {
      return;
    }

    reportError("Failed to restore browser panel", error);
    const shouldFallbackHidden = suppressPendingBrowserRestoreSavesRef.current;
    const confirmedFields = confirmedBrowserLayoutRef.current;
    const fallbackFields = pendingBrowserRestoreFallbackRef.current;
    clearPendingBrowserVisibility();

    setLayout((currentLayout) => {
      if (!currentLayout.browserVisible) {
        return currentLayout;
      }

      const nextLayout = {
        ...currentLayout,
        ...(shouldFallbackHidden
          ? fallbackFields ?? getHiddenBrowserLayoutFields(currentLayout)
          : confirmedFields),
      };

      confirmedBrowserLayoutRef.current = getConfirmedBrowserLayoutFields(nextLayout);
      if (shouldFallbackHidden || !confirmedFields.browserVisible) {
        persistLayout(workspaceId, nextLayout);
      }
      return nextLayout;
    });
  }, [persistLayout, reportError, workspaceId]);

  const setBrowserVisible = async (visible: boolean): Promise<boolean> => {
    if (!workspaceId) {
      return false;
    }

    if (!visible) {
      const layoutAtHideStart = layout;
      const usefulLastVisibleSize =
        layoutAtHideStart.browserVisible &&
        layoutAtHideStart.primaryPanelSize >= MIN_VISIBLE_PRIMARY_PANEL_SIZE &&
        layoutAtHideStart.primaryPanelSize <= MAX_VISIBLE_PRIMARY_PANEL_SIZE
          ? layoutAtHideStart.primaryPanelSize
          : layoutAtHideStart.lastVisiblePrimaryPanelSize;

      try {
        await browser.hide();
      } catch (error) {
        reportError("Failed to hide browser panel", error);
        return false;
      }

      if (workspaceIdRef.current !== workspaceId) {
        return false;
      }

      pendingBrowserHideRef.current = true;
      pendingBrowserRestoreRef.current = false;
      pendingBrowserRestoreNativeRef.current = false;
      pendingBrowserRestoreRenderedRef.current = false;
      setLayout((currentLayout) => {
        const nextLayout = {
          ...currentLayout,
          primaryPanelSize: COLLAPSED_BROWSER_PRIMARY_PANEL_SIZE,
          lastVisiblePrimaryPanelSize: usefulLastVisibleSize,
          browserVisible: false,
        };

        return nextLayout;
      });
      return true;
    }

    let didStartRestore = false;
    setLayout((currentLayout) => {
      if (currentLayout.browserVisible) {
        return currentLayout;
      }

      const restoredPrimarySize = clampVisiblePrimaryPanelSize(
        currentLayout.lastVisiblePrimaryPanelSize,
      );
      const nextLayout = {
        ...currentLayout,
        primaryPanelSize: restoredPrimarySize,
        lastVisiblePrimaryPanelSize: restoredPrimarySize,
        browserVisible: true,
      };

      beginBrowserRestore(currentLayout, false);
      didStartRestore = true;
      return nextLayout;
    });

    return didStartRestore;
  };

  const toggleBrowserVisible = () => setBrowserVisible(!layout.browserVisible);

  const setBothPanelsVisible = (visible: boolean) => {
    setBoardsVisible(visible);
    void setBrowserVisible(visible);
  };

  const toggleCanvasFocusMode = () => {
    const nextVisible = !layout.boardsVisible && !layout.browserVisible;
    setBothPanelsVisible(nextVisible);
  };

  return {
    layout,
    isLoaded,
    updatePanelSize,
    updateActiveBoard,
    setBoardsVisible,
    toggleBoardsVisible,
    setBrowserVisible,
    toggleBrowserVisible,
    setBothPanelsVisible,
    toggleCanvasFocusMode,
    ensureBrowserHidden,
    confirmBrowserRestored,
    confirmBrowserLayoutApplied,
    handleBrowserRestoreFailure,
    handleBrowserLayoutApplyFailure,
    flushPendingLayoutSave,
  };
}
