import { useEffect, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";

import { useWorkspaceMounting } from "../../hooks/use-workspace-mounting";
import { useWorkspaceLayout } from "../../hooks/use-workspace-layout";
import { useAppStore } from "../../stores/app-store";
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
    mountedWorkspaces,
    mountedWorkspaceIds,
    direction,
  } = useWorkspaceMounting(workspaces, activeWorkspaceId);
  const previousActiveWorkspaceIdRef = useRef(previousActiveWorkspaceId);

  useEffect(() => {
    previousActiveWorkspaceIdRef.current = previousActiveWorkspaceId;
  }, [previousActiveWorkspaceId]);

  useEffect(() => {
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
      {mountedWorkspaces.map((workspace) => {
        const isActive = workspace.id === renderedActiveWorkspaceId;
        const isExiting = workspace.id === exitingWorkspaceId;
        const isVisible = isActive || isExiting;
        const workspaceIndex = workspaces.findIndex((item) => item.id === workspace.id);
        const hasMountedWorkspace = mountedWorkspaceIds.includes(workspace.id);

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
            onAnimationComplete={() => {
              if (isActive) {
                notifyWorkspaceActivationLayoutChange();
              }
            }}
            transition={slideTransition}
            style={{ zIndex: isActive ? 2 : isExiting ? 1 : 0 }}
          >
            <WorkspacePage workspaceId={workspace.id} isActive={isActive} />
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

function WorkspacePage({ workspaceId, isActive }: { workspaceId: string; isActive: boolean }) {
  const { layout, isLoaded, updatePanelSize, updateActiveBoard } = useWorkspaceLayout(workspaceId);

  if (!isLoaded) {
    return null;
  }

  return (
    <>
      <Sidebar workspaceId={workspaceId} onBoardSelect={updateActiveBoard} />
      <main style={workspaceMainStyle}>
        <PanelLayout
          workspaceId={workspaceId}
          defaultPrimarySize={layout.primaryPanelSize}
          onLayoutChange={updatePanelSize}
          primaryContent={<CanvasPanel workspaceId={workspaceId} isInteractive={isActive} />}
          secondaryContent={
            <div style={secondaryPlaceholderStyle}>
              <p style={secondaryPlaceholderHeadingStyle}>Secondary panel</p>
              <p style={secondaryPlaceholderBodyStyle}>Widgets and browser will go here</p>
            </div>
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

const secondaryPlaceholderStyle = {
  padding: "16px",
  textAlign: "center" as const,
};

const secondaryPlaceholderHeadingStyle = {
  color: "#999",
  fontSize: "14px",
};

const secondaryPlaceholderBodyStyle = {
  color: "#bbb",
  fontSize: "12px",
  marginTop: "4px",
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
