import { useCallback, useEffect } from "react";

import { createBoard } from "../lib/board-operations";
import { createWorkspace, mapWorkspace, listWorkspaces } from "../lib/workspace-operations";
import { clearSharedErrorChannel } from "./shared-error-store";
import { useErrorReporter } from "./use-error-reporter";
import { useAppStore } from "../stores/app-store";

const KEYBOARD_CREATE_WORKSPACE_CHANNEL = "keyboard-shortcut:create-workspace";
const KEYBOARD_RELOAD_WORKSPACE_CHANNEL = "keyboard-shortcut:reload-workspaces";
const KEYBOARD_CREATE_BOARD_CHANNEL = "keyboard-shortcut:create-board";
const KEYBOARD_WORKSPACE_ICON = "🪟";

export function useKeyboardShortcuts() {
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const focus = useAppStore((state) => state.focus);
  const initialized = useAppStore((state) => state.initialized);
  const setActiveBoardForWorkspace = useAppStore((state) => state.setActiveBoardForWorkspace);
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
  const setWorkspaces = useAppStore((state) => state.setWorkspaces);
  const requestBoardListRefresh = useAppStore((state) => state.requestBoardListRefresh);
  const reportError = useErrorReporter("KeyboardShortcuts");

  const setVisibleWorkspaces = useCallback(
    (nextWorkspaces: ReturnType<typeof mapWorkspace>[]) => {
      setWorkspaces(nextWorkspaces);

      const currentActiveWorkspaceId = useAppStore.getState().activeWorkspaceId;
      const hasActiveWorkspace = nextWorkspaces.some(
        (workspace) => workspace.id === currentActiveWorkspaceId,
      );

      if (!hasActiveWorkspace && nextWorkspaces.length > 0) {
        setActiveWorkspace(nextWorkspaces[0].id);
      }
    },
    [setActiveWorkspace, setWorkspaces],
  );

  const refreshWorkspaces = useCallback(async () => {
    try {
      const nextWorkspaces = await listWorkspaces();
      setVisibleWorkspaces(nextWorkspaces.map(mapWorkspace));
      clearSharedErrorChannel(KEYBOARD_RELOAD_WORKSPACE_CHANNEL);
      return nextWorkspaces;
    } catch (error) {
      reportError("Failed to reload workspaces from keyboard shortcut", error, undefined, {
        channel: KEYBOARD_RELOAD_WORKSPACE_CHANNEL,
        retry: {
          label: "Retry",
          run: async () => {
            await refreshWorkspaces();
          },
        },
      });
      return null;
    }
  }, [reportError, setVisibleWorkspaces]);

  const handleKeyDown = useCallback(
    async (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }

      if (focus === "canvas" || !initialized || isEditableEventTarget(event.target)) {
        return;
      }

      const numberKey = Number.parseInt(event.key, 10);
      if (numberKey >= 1 && numberKey <= 9 && numberKey <= workspaces.length) {
        event.preventDefault();
        event.stopPropagation();
        setActiveWorkspace(workspaces[numberKey - 1].id);
        return;
      }

      if (event.key === "[") {
        const currentIndex = workspaces.findIndex(
          (workspace) => workspace.id === activeWorkspaceId,
        );

        if (currentIndex > 0) {
          event.preventDefault();
          event.stopPropagation();
          setActiveWorkspace(workspaces[currentIndex - 1].id);
        }
        return;
      }

      if (event.key === "]") {
        const currentIndex = workspaces.findIndex(
          (workspace) => workspace.id === activeWorkspaceId,
        );

        if (currentIndex >= 0 && currentIndex < workspaces.length - 1) {
          event.preventDefault();
          event.stopPropagation();
          setActiveWorkspace(workspaces[currentIndex + 1].id);
        }
        return;
      }

      if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        event.stopPropagation();

        try {
          const nextWorkspaceName = `Workspace ${workspaces.length + 1}`;
          const workspaceId = await createWorkspace(nextWorkspaceName, KEYBOARD_WORKSPACE_ICON);
          const nextPosition =
            workspaces.reduce(
              (maxPosition, workspace) => Math.max(maxPosition, workspace.position),
              -1,
            ) + 1;
          const nextWorkspaces = workspaces.some((workspace) => workspace.id === workspaceId)
            ? workspaces
            : [
                ...workspaces,
                mapWorkspace({
                  id: workspaceId,
                  name: nextWorkspaceName,
                  icon: KEYBOARD_WORKSPACE_ICON,
                  position: nextPosition,
                }),
              ];

          setVisibleWorkspaces(nextWorkspaces);
          clearSharedErrorChannel(KEYBOARD_CREATE_WORKSPACE_CHANNEL);
          setActiveWorkspace(workspaceId);
          await refreshWorkspaces();
        } catch (error) {
          reportError("Failed to create workspace from keyboard shortcut", error, undefined, {
            channel: KEYBOARD_CREATE_WORKSPACE_CHANNEL,
          });
        }
        return;
      }

      if (event.key.toLowerCase() === "n" && activeWorkspaceId) {
        event.preventDefault();
        event.stopPropagation();

        try {
          const boardId = await createBoard("New Board", activeWorkspaceId);
          clearSharedErrorChannel(KEYBOARD_CREATE_BOARD_CHANNEL);
          setActiveBoardForWorkspace(activeWorkspaceId, boardId);
          requestBoardListRefresh(activeWorkspaceId);
        } catch (error) {
          reportError("Failed to create board from keyboard shortcut", error, undefined, {
            channel: KEYBOARD_CREATE_BOARD_CHANNEL,
          });
        }
      }
    },
    [
      activeWorkspaceId,
      focus,
      initialized,
      refreshWorkspaces,
      requestBoardListRefresh,
      reportError,
      setActiveWorkspace,
      setActiveBoardForWorkspace,
      setVisibleWorkspaces,
      workspaces,
    ],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [handleKeyDown]);
}

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
