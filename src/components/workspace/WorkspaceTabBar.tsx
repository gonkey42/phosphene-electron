import { useEffect, useRef } from "react";

import {
  createWorkspace,
  deleteWorkspace,
  mapWorkspace,
  listWorkspaces,
  renameWorkspace,
  type WorkspaceListItem,
} from "../../lib/workspace-operations";
import { useCancellableEffect } from "../../hooks/use-cancellable-effect";
import { useErrorReporter } from "../../hooks/use-error-reporter";
import { useInlineRename } from "../../hooks/use-inline-rename";
import { useAppStore } from "../../stores/app-store";

import "./WorkspaceTabBar.css";

function isMacPlatform() {
  return /Mac|iPhone|iPad|iPod/.test(window.navigator.platform);
}

function getShortcutLabel(index: number) {
  if (index >= 9) {
    return null;
  }

  return `${isMacPlatform() ? "⌘" : "Ctrl+"}${index + 1}`;
}

export function WorkspaceTabBar() {
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
  const setWorkspaces = useAppStore((state) => state.setWorkspaces);
  const reportError = useErrorReporter("WorkspaceTabBar");
  const draftInputRef = useRef<HTMLInputElement | null>(null);

  function syncWorkspaces(items: WorkspaceListItem[]) {
    const nextWorkspaces = items.map(mapWorkspace);
    setWorkspaces(nextWorkspaces);

    const currentActiveWorkspaceId = useAppStore.getState().activeWorkspaceId;
    const hasActiveWorkspace = nextWorkspaces.some(
      (workspace) => workspace.id === currentActiveWorkspaceId,
    );

    if (!hasActiveWorkspace && nextWorkspaces.length > 0) {
      setActiveWorkspace(nextWorkspaces[0].id);
    }
  }

  async function refreshWorkspaces() {
    const items = await listWorkspaces();
    syncWorkspaces(items);
    return items;
  }

  const {
    editingId: editingWorkspaceId,
    draftName,
    setDraftName,
    startRename,
    cancelRename,
    commitRename,
  } = useInlineRename(async (workspaceId, trimmedName) => {
    await renameWorkspace(workspaceId, trimmedName);
    await refreshWorkspaces();
  });

  useCancellableEffect(
    (token) => {
      if (workspaces.length > 0) {
        return;
      }

      void (async () => {
        try {
          const items = await listWorkspaces();

          if (!token.cancelled) {
            syncWorkspaces(items);
          }
        } catch (error) {
          if (!token.cancelled) {
            reportError("Failed to load workspaces", error);
            setWorkspaces([]);
          }
        }
      })();
    },
    [setActiveWorkspace, setWorkspaces, workspaces.length],
  );

  useEffect(() => {
    if (!editingWorkspaceId) {
      return;
    }

    draftInputRef.current?.focus();
    draftInputRef.current?.select();
  }, [editingWorkspaceId]);

  async function handleCreateWorkspace() {
    try {
      const nextName = `Workspace ${workspaces.length + 1}`;
      const workspaceId = await createWorkspace(nextName, "🪟");
      setActiveWorkspace(workspaceId);
      await refreshWorkspaces();
    } catch (error) {
      reportError("Failed to create workspace", error);
    }
  }

  async function handleDeleteWorkspace(workspaceId: string) {
    try {
      const deleted = await deleteWorkspace(workspaceId);

      if (!deleted) {
        return;
      }

      if (editingWorkspaceId === workspaceId) {
        cancelRename();
      }

      await refreshWorkspaces();
    } catch (error) {
      reportError("Failed to delete workspace", error);
    }
  }

  async function handleCommitRename(workspaceId: string) {
    const trimmedName = draftName.trim();

    if (!trimmedName) {
      cancelRename();
      return;
    }

    try {
      await commitRename(workspaceId);
    } catch (error) {
      reportError("Failed to rename workspace", error);
    }
  }

  return (
    <header className="workspace-tab-bar" aria-label="Workspaces">
      <ul className="workspace-tab-bar__tabs">
        {workspaces.map((workspace, index) => {
          const isActive = workspace.id === activeWorkspaceId;
          const isEditing = workspace.id === editingWorkspaceId;
          const shortcut = getShortcutLabel(index);

          return (
            <li
              key={workspace.id}
              className={`workspace-tab-bar__tab-item${isActive ? " workspace-tab-bar__tab-item--active" : ""}`}
            >
              <div className="workspace-tab-bar__tab-row">
                {isEditing ? (
                  <input
                    ref={draftInputRef}
                    className="workspace-tab-bar__rename-input"
                    aria-label="Workspace name"
                    value={draftName}
                    onChange={(event) => {
                      setDraftName(event.target.value);
                    }}
                    onBlur={() => {
                      if (editingWorkspaceId === workspace.id) {
                        void handleCommitRename(workspace.id);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleCommitRename(workspace.id);
                      }

                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelRename();
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className={`workspace-tab-bar__tab-button${isActive ? " workspace-tab-bar__tab-button--active" : ""}`}
                    aria-label={workspace.name}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => {
                      setActiveWorkspace(workspace.id);
                    }}
                    onDoubleClick={() => {
                      startRename(workspace.id, workspace.name);
                    }}
                  >
                    <span className="workspace-tab-bar__icon" aria-hidden="true">
                      {workspace.icon}
                    </span>
                    <span className="workspace-tab-bar__name">{workspace.name}</span>
                    {shortcut ? (
                      <span className="workspace-tab-bar__shortcut" aria-hidden="true">
                        {shortcut}
                      </span>
                    ) : null}
                  </button>
                )}

                {workspaces.length > 1 ? (
                  <button
                    type="button"
                    className="workspace-tab-bar__close-button"
                    aria-label={`Delete ${workspace.name}`}
                    onClick={() => {
                      void handleDeleteWorkspace(workspace.id);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="workspace-tab-bar__create-button"
        aria-label="Create workspace"
        onClick={() => {
          void handleCreateWorkspace();
        }}
      >
        +
      </button>
    </header>
  );
}
