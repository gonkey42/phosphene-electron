import { useCallback, useEffect } from "react";

import { createBoard } from "../lib/board-operations";
import { createWorkspace, mapWorkspace, listWorkspaces } from "../lib/workspace-operations";
import { useAppStore } from "../stores/app-store";

export function useKeyboardShortcuts() {
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const focus = useAppStore((state) => state.focus);
  const initialized = useAppStore((state) => state.initialized);
  const setActiveBoard = useAppStore((state) => state.setActiveBoard);
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
  const setWorkspaces = useAppStore((state) => state.setWorkspaces);
  const requestBoardListRefresh = useAppStore((state) => state.requestBoardListRefresh);

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
          const workspaceId = await createWorkspace(`Workspace ${workspaces.length + 1}`);
          const nextWorkspaces = await listWorkspaces();
          setWorkspaces(nextWorkspaces.map(mapWorkspace));
          setActiveWorkspace(workspaceId);
        } catch (error) {
          console.error("Failed to create workspace from keyboard shortcut", error);
        }
        return;
      }

      if (event.key.toLowerCase() === "n" && activeWorkspaceId) {
        event.preventDefault();
        event.stopPropagation();

        try {
          const boardId = await createBoard("New Board", activeWorkspaceId);
          setActiveBoard(boardId);
          requestBoardListRefresh(activeWorkspaceId);
        } catch (error) {
          console.error("Failed to create board from keyboard shortcut", error);
        }
      }
    },
    [
      activeWorkspaceId,
      focus,
      initialized,
      requestBoardListRefresh,
      setActiveBoard,
      setActiveWorkspace,
      setWorkspaces,
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
