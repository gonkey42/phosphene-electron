import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";

import { useWorkspaceMounting } from "../../hooks/use-workspace-mounting";
import { useWorkspaceLayout } from "../../hooks/use-workspace-layout";
import { useAppStore } from "../../stores/app-store";
import { BrowserPanel } from "../browser/BrowserPanel";
import { CanvasPanel } from "../canvas/CanvasPanel";
import { PanelLayout } from "../layout/PanelLayout";
import { Sidebar } from "../sidebar/Sidebar";

import "./WorkspaceContainer.css";

export function WorkspaceContainer() {
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const [exitingWorkspaceId, setExitingWorkspaceId] = useState<string | null>(null);
  const {
    activeWorkspaceIndex,
    previousActiveWorkspaceId,
    renderedActiveWorkspaceId,
    renderedActiveWorkspaceIndex,
    mountedWorkspaceIds,
    direction,
  } = useWorkspaceMounting(workspaces, activeWorkspaceId);
  const previousActiveWorkspaceIdRef = useRef(previousActiveWorkspaceId);
  const previousMountedWorkspaceIdsRef = useRef<string[]>(mountedWorkspaceIds);
  previousActiveWorkspaceIdRef.current = previousActiveWorkspaceId;
  const renderedWorkspaceIds = useMemo(() => {
    const ids = new Set(mountedWorkspaceIds);

    if (exitingWorkspaceId) {
      ids.add(exitingWorkspaceId);
    }

    return ids;
  }, [exitingWorkspaceId, mountedWorkspaceIds]);
  const renderedWorkspaces = useMemo(
    () => workspaces.filter((workspace) => renderedWorkspaceIds.has(workspace.id)),
    [renderedWorkspaceIds, workspaces],
  );

  useEffect(() => {
    previousMountedWorkspaceIdsRef.current = mountedWorkspaceIds;
  }, [mountedWorkspaceIds]);

  useLayoutEffect(() => {
    const previousWorkspaceId = previousActiveWorkspaceIdRef.current;

    if (activeWorkspaceIndex < 0) {
      return;
    }

    if (previousWorkspaceId && activeWorkspaceId && previousWorkspaceId !== activeWorkspaceId) {
      setExitingWorkspaceId(previousWorkspaceId);
      const timeoutId = window.setTimeout(() => {
        setExitingWorkspaceId((current) => (current === previousWorkspaceId ? null : current));
      }, slideTransition.duration * 1000);
      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [activeWorkspaceId, activeWorkspaceIndex]);

  return (
    <div className="workspace-viewport">
      {renderedWorkspaces.map((workspace) => {
        const isActive = workspace.id === renderedActiveWorkspaceId;
        const isExiting = workspace.id === exitingWorkspaceId;
        const isVisible = isActive || isExiting;
        const isInteractive = isActive;
        const workspaceIndex = workspaces.findIndex((item) => item.id === workspace.id);
        const hasMountedWorkspace = previousMountedWorkspaceIdsRef.current.includes(workspace.id);

        return (
          <motion.div
            key={workspace.id}
            className={`workspace-page${isVisible ? "" : " hidden"}`}
            data-workspace-id={workspace.id}
            variants={pageVariants}
            initial={getPageInitialState({
              direction,
              hasMountedWorkspace,
              isActive,
            })}
            animate={getPageAnimationState({
              workspaceIndex,
              activeWorkspaceIndex: renderedActiveWorkspaceIndex,
              isActive,
            })}
            aria-hidden={!isInteractive}
            inert={!isInteractive}
            onAnimationComplete={() => {
              if (isActive) {
                notifyWorkspaceActivationLayoutChange();
              }
            }}
            transition={slideTransition}
            style={{
              zIndex: isActive ? 2 : isExiting ? 1 : 0,
              pointerEvents: isInteractive ? "auto" : "none",
            }}
          >
            <WorkspacePage workspaceId={workspace.id} isActive={isActive} isExiting={isExiting} />
          </motion.div>
        );
      })}

      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={renderedActiveWorkspaceId ?? "empty"}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={slideTransition}
          style={overlayStyle}
        />
      </AnimatePresence>
    </div>
  );
}

function WorkspacePage({
  workspaceId,
  isActive,
  isExiting,
}: {
  workspaceId: string;
  isActive: boolean;
  isExiting: boolean;
}) {
  const {
    layout,
    isLoaded,
    updatePanelSize,
    updateActiveBoard,
    setBoardsVisible,
    setBrowserVisible,
    ensureBrowserHidden,
    confirmBrowserRestored,
    confirmBrowserLayoutApplied,
    handleBrowserRestoreFailure,
    handleBrowserLayoutApplyFailure,
    flushPendingLayoutSave,
  } = useWorkspaceLayout(workspaceId);
  const setFocus = useAppStore((state) => state.setFocus);
  const [layoutResetVersion, setLayoutResetVersion] = useState(0);
  const wasActiveRef = useRef(isActive);
  const previousPanelVisibilityRef = useRef<{
    boardsVisible: boolean;
    browserVisible: boolean;
  } | null>(null);
  const sidebarShellRef = useRef<HTMLDivElement | null>(null);
  const boardsToggleRef = useRef<HTMLButtonElement | null>(null);
  const browserToggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (wasActiveRef.current && !isActive) {
      void Promise.resolve(flushPendingLayoutSave()).catch((error) => {
        console.error("[WorkspaceContainer] Failed to flush inactive workspace layout", {
          workspaceId,
          error,
        });
      });
    }

    wasActiveRef.current = isActive;
  }, [flushPendingLayoutSave, isActive, workspaceId]);

  useEffect(() => {
    if (!isActive || !isLoaded || layout.browserVisible) {
      return;
    }

    void ensureBrowserHidden();
  }, [ensureBrowserHidden, isActive, isLoaded, layout.browserVisible]);

  useEffect(() => {
    if (layout.boardsVisible || !sidebarShellRef.current?.contains(document.activeElement)) {
      return;
    }

    boardsToggleRef.current?.focus();
  }, [layout.boardsVisible]);

  useEffect(() => {
    const nextVisibility = {
      boardsVisible: layout.boardsVisible,
      browserVisible: layout.browserVisible,
    };
    const previousVisibility = previousPanelVisibilityRef.current;
    previousPanelVisibilityRef.current = nextVisibility;

    if (!isActive || !isLoaded || !previousVisibility) {
      return;
    }

    if (
      previousVisibility.boardsVisible !== nextVisibility.boardsVisible ||
      previousVisibility.browserVisible !== nextVisibility.browserVisible
    ) {
      notifyPanelVisibilityChange();
    }
  }, [isActive, isLoaded, layout.boardsVisible, layout.browserVisible]);

  if (!isLoaded) {
    return null;
  }

  const boardsPanelId = `${workspaceId}-boards-panel`;
  const browserPanelId = `${workspaceId}-secondary`;
  const browserRegionIsRendered = isActive || isExiting;
  const focusControlLabel =
    layout.boardsVisible || layout.browserVisible ? "Focus canvas" : "Restore panels";
  const inactiveTabIndex = isActive ? undefined : -1;

  const handleBoardsToggle = () => {
    const nextVisible = !layout.boardsVisible;

    if (!nextVisible && sidebarShellRef.current?.contains(document.activeElement)) {
      boardsToggleRef.current?.focus();
    }

    setBoardsVisible(nextVisible);
  };

  const handleBrowserToggle = () => {
    const nextVisible = !layout.browserVisible;

    if (!nextVisible) {
      browserToggleRef.current?.focus();
      setFocus("global");
    }

    void setBrowserVisible(nextVisible);
  };

  const handleCanvasFocusToggle = () => {
    const nextVisible = !layout.boardsVisible && !layout.browserVisible;

    if (!nextVisible) {
      setFocus("global");
    }

    setBoardsVisible(nextVisible);
    void setBrowserVisible(nextVisible);
  };

  const handleLayoutChange = (sizes: Parameters<typeof updatePanelSize>[0]) => {
    if ((sizes.secondary ?? 100 - (sizes.primary ?? layout.primaryPanelSize)) <= 0) {
      if (!layout.browserVisible) {
        return;
      }

      setFocus("global");
      browserToggleRef.current?.focus();
      void setBrowserVisible(false).then((didHide) => {
        if (!didHide) {
          setLayoutResetVersion((currentVersion) => currentVersion + 1);
        }
      });
      return;
    }

    updatePanelSize(sizes);
  };

  return (
    <>
      <div
        ref={sidebarShellRef}
        id={boardsPanelId}
        className={`workspace-sidebar-shell${layout.boardsVisible ? "" : " workspace-sidebar-shell--hidden"}`}
        aria-hidden={!layout.boardsVisible}
        inert={!layout.boardsVisible}
      >
        <Sidebar
          workspaceId={workspaceId}
          onBoardSelect={updateActiveBoard}
          isVisible={layout.boardsVisible}
        />
      </div>
      <main style={workspaceMainStyle} tabIndex={-1}>
        <PanelLayout
          workspaceId={workspaceId}
          defaultPrimarySize={layout.primaryPanelSize}
          browserVisible={layout.browserVisible}
          layoutResetVersion={layoutResetVersion}
          onLayoutApplied={confirmBrowserLayoutApplied}
          onLayoutApplyError={handleBrowserLayoutApplyFailure}
          onLayoutChange={handleLayoutChange}
          primaryContent={
            <div className="workspace-canvas-shell">
              <CanvasPanel workspaceId={workspaceId} isInteractive={isActive} />
              <div className="workspace-canvas-controls" role="group" aria-label="Canvas panel controls">
                <button
                  ref={boardsToggleRef}
                  type="button"
                  className="workspace-canvas-control workspace-canvas-control--boards"
                  aria-controls={boardsPanelId}
                  aria-expanded={layout.boardsVisible}
                  aria-label={layout.boardsVisible ? "Hide boards panel" : "Show boards panel"}
                  tabIndex={inactiveTabIndex}
                  onClick={handleBoardsToggle}
                >
                  {"<"}
                </button>
                <button
                  type="button"
                  className="workspace-canvas-control workspace-canvas-control--focus"
                  aria-label={focusControlLabel}
                  aria-pressed={!layout.boardsVisible && !layout.browserVisible}
                  tabIndex={inactiveTabIndex}
                  onClick={handleCanvasFocusToggle}
                >
                  []
                </button>
                <button
                  ref={browserToggleRef}
                  type="button"
                  className="workspace-canvas-control workspace-canvas-control--browser"
                  aria-controls={browserRegionIsRendered ? browserPanelId : undefined}
                  aria-expanded={layout.browserVisible}
                  aria-label={layout.browserVisible ? "Hide browser panel" : "Show browser panel"}
                  tabIndex={inactiveTabIndex}
                  onClick={handleBrowserToggle}
                >
                  {">"}
                </button>
              </div>
            </div>
          }
          secondaryContent={
            isActive ? (
              <BrowserPanel
                visible={layout.browserVisible}
                onNativeAttachComplete={confirmBrowserRestored}
                onNativeAttachError={handleBrowserRestoreFailure}
              />
            ) : isExiting ? (
              <BrowserPanel mode="shell" />
            ) : undefined
          }
        />
      </main>
    </>
  );
}

const pageVariants = {
  left: {
    x: "-100%",
    opacity: 0.92,
  },
  center: {
    x: "0%",
    opacity: 1,
  },
  right: {
    x: "100%",
    opacity: 0.92,
  },
};

const slideVariants = {
  enter: (direction: number) => ({
    x: direction === 0 ? 0 : direction > 0 ? "100%" : "-100%",
    opacity: 0.8,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction === 0 ? 0 : direction > 0 ? "-100%" : "100%",
    opacity: 0.8,
  }),
};

const slideTransition = {
  type: "spring" as const,
  stiffness: 400,
  damping: 40,
  duration: 0.3,
};

const overlayStyle = {
  position: "absolute" as const,
  inset: 0,
  pointerEvents: "none" as const,
  backgroundColor: "rgba(255, 255, 255, 0.03)",
  zIndex: 5,
};

const workspaceMainStyle = {
  display: "flex",
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  overflow: "hidden",
  position: "relative" as const,
};

function getPageAnimationState({
  workspaceIndex,
  activeWorkspaceIndex,
  isActive,
}: {
  workspaceIndex: number;
  activeWorkspaceIndex: number;
  isActive: boolean;
}) {
  if (isActive || workspaceIndex === activeWorkspaceIndex) {
    return "center";
  }

  if (activeWorkspaceIndex < 0 || workspaceIndex < 0) {
    return "center";
  }

  return workspaceIndex < activeWorkspaceIndex ? "left" : "right";
}

function getPageInitialState({
  direction,
  hasMountedWorkspace,
  isActive,
}: {
  direction: number;
  hasMountedWorkspace: boolean;
  isActive: boolean;
}) {
  if (!isActive || hasMountedWorkspace || direction === 0) {
    return false;
  }

  return direction > 0 ? "right" : "left";
}

function notifyWorkspaceActivationLayoutChange() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event("resize"));
}

function notifyPanelVisibilityChange() {
  if (typeof window === "undefined") {
    return;
  }

  window.requestAnimationFrame(() => {
    window.dispatchEvent(new Event("resize"));
  });
}
