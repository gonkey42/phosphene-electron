import { useCallback, useEffect, useId, useMemo, useRef } from "react";

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
import { useSafeDelete } from "../../hooks/use-safe-delete";
import { useWorkspacePublish } from "../../hooks/use-workspace-publish";
import { clearSharedErrorChannel } from "../../hooks/shared-error-store";
import { useAppStore } from "../../stores/app-store";
import type { DeleteEligibility } from "../../stores/app-store";
import { WorkspacePublishControls } from "../publish/WorkspacePublishControls";
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

const WORKSPACE_LOAD_ERROR_CHANNEL = "workspace-tab-bar:load";
const WORKSPACE_RELOAD_ERROR_CHANNEL = "workspace-tab-bar:reload";
const WORKSPACE_CREATE_ERROR_CHANNEL = "workspace-tab-bar:create";
const WORKSPACE_RENAME_ERROR_CHANNEL = "workspace-tab-bar:rename";
const WORKSPACE_DELETE_ERROR_CHANNEL = "workspace-tab-bar:delete";

export function WorkspaceTabBar() {
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const initialized = useAppStore((state) => state.initialized);
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
  const setWorkspaces = useAppStore((state) => state.setWorkspaces);
  const cancelArmedDelete = useAppStore((state) => state.cancelArmedDelete);
  const reportError = useErrorReporter("WorkspaceTabBar");
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  const hasAttemptedInitialLoadRef = useRef(false);

  const setVisibleWorkspaces = useCallback((nextWorkspaces: ReturnType<typeof mapWorkspace>[]) => {
    setWorkspaces(nextWorkspaces);

    const currentActiveWorkspaceId = useAppStore.getState().activeWorkspaceId;
    const hasActiveWorkspace = nextWorkspaces.some(
      (workspace) => workspace.id === currentActiveWorkspaceId,
    );

    if (!hasActiveWorkspace && nextWorkspaces.length > 0) {
      setActiveWorkspace(nextWorkspaces[0].id);
    }
  }, [setActiveWorkspace, setWorkspaces]);

  const syncWorkspaces = useCallback((items: WorkspaceListItem[]) => {
    const nextWorkspaces = items.map(mapWorkspace);
    setVisibleWorkspaces(nextWorkspaces);

    clearSharedErrorChannel(WORKSPACE_LOAD_ERROR_CHANNEL);
    clearSharedErrorChannel(WORKSPACE_RELOAD_ERROR_CHANNEL);
  }, [setVisibleWorkspaces]);

  const fetchWorkspaces = useCallback(async () => {
    return await listWorkspaces();
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const items = await fetchWorkspaces();
      syncWorkspaces(items);
      return items;
    } catch (error) {
      reportError("Failed to reload workspaces", error, undefined, {
        channel: WORKSPACE_RELOAD_ERROR_CHANNEL,
        retry: {
          label: "Retry",
          run: async () => {
            await refreshWorkspaces();
          },
        },
      });
      return null;
    }
  }, [fetchWorkspaces, reportError, syncWorkspaces]);

  const retryInitialLoad = useCallback(async () => {
    try {
      const items = await fetchWorkspaces();
      syncWorkspaces(items);
      return items;
    } catch (error) {
      reportError("Failed to load workspaces", error, undefined, {
        channel: WORKSPACE_LOAD_ERROR_CHANNEL,
        retry: {
          label: "Retry",
          run: async () => {
            await retryInitialLoad();
          },
        },
      });
      setWorkspaces([]);
      return null;
    }
  }, [fetchWorkspaces, reportError, setWorkspaces, syncWorkspaces]);

  const {
    editingId: editingWorkspaceId,
    draftName,
    setDraftName,
    startRename,
    cancelRename,
    commitRename,
  } = useInlineRename(async (workspaceId, trimmedName) => {
    try {
      await renameWorkspace(workspaceId, trimmedName);
    } catch (error) {
      reportError("Failed to rename workspace", error, undefined, {
        channel: WORKSPACE_RENAME_ERROR_CHANNEL,
      });
      throw error;
    }
  });

  useCancellableEffect(
    (token) => {
      if (initialized || workspaces.length > 0 || hasAttemptedInitialLoadRef.current) {
        return;
      }

      hasAttemptedInitialLoadRef.current = true;

      void (async () => {
        try {
          const items = await fetchWorkspaces();

          if (token.cancelled) {
            return;
          }

          syncWorkspaces(items);
        } catch (error) {
          if (token.cancelled) {
            return;
          }

          reportError("Failed to load workspaces", error, undefined, {
            channel: WORKSPACE_LOAD_ERROR_CHANNEL,
            retry: {
              label: "Retry",
              run: async () => {
                await retryInitialLoad();
              },
            },
          });
          setWorkspaces([]);
        }
      })();
    },
    [
      fetchWorkspaces,
      initialized,
      reportError,
      retryInitialLoad,
      setActiveWorkspace,
      setWorkspaces,
      workspaces.length,
    ],
  );

  useEffect(() => {
    if (!editingWorkspaceId) {
      return;
    }

    draftInputRef.current?.focus();
    draftInputRef.current?.select();
  }, [editingWorkspaceId]);

  async function handleCreateWorkspace() {
    cancelArmedDelete();

    try {
      const nextName = `Workspace ${workspaces.length + 1}`;
      const workspaceId = await createWorkspace(nextName);
      const nextPosition =
        workspaces.reduce((maxPosition, workspace) => Math.max(maxPosition, workspace.position), -1) + 1;
      const nextWorkspaces = workspaces.some((workspace) => workspace.id === workspaceId)
        ? workspaces
        : [
            ...workspaces,
            mapWorkspace({ id: workspaceId, name: nextName, icon: null, position: nextPosition }),
          ];

      setVisibleWorkspaces(nextWorkspaces);
      clearSharedErrorChannel(WORKSPACE_CREATE_ERROR_CHANNEL);
      setActiveWorkspace(workspaceId);
      await refreshWorkspaces();
    } catch (error) {
      reportError("Failed to create workspace", error, undefined, {
        channel: WORKSPACE_CREATE_ERROR_CHANNEL,
      });
    }
  }

  async function handleDeleteWorkspace(workspaceId: string) {
    try {
      const deleted = await deleteWorkspace(workspaceId);

      if (!deleted) {
        return;
      }

      clearSharedErrorChannel(WORKSPACE_DELETE_ERROR_CHANNEL);

      if (editingWorkspaceId === workspaceId) {
        cancelRename();
      }

      const nextWorkspaces = workspaces.filter((workspace) => workspace.id !== workspaceId);
      setVisibleWorkspaces(nextWorkspaces);
      await refreshWorkspaces();
    } catch (error) {
      reportError("Failed to delete workspace", error, undefined, {
        channel: WORKSPACE_DELETE_ERROR_CHANNEL,
      });
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
      clearSharedErrorChannel(WORKSPACE_RENAME_ERROR_CHANNEL);
      await refreshWorkspaces();
    } catch {
      // The inline rename callback already reported the failure.
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
                  <>
                    <button
                      type="button"
                      className={`workspace-tab-bar__tab-button${isActive ? " workspace-tab-bar__tab-button--active" : ""}`}
                      aria-label={workspace.name}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => {
                        setActiveWorkspace(workspace.id);
                      }}
                      onDoubleClick={() => {
                        cancelArmedDelete();
                        startRename(workspace.id, workspace.name);
                      }}
                    >
                      <span className="workspace-tab-bar__name">{workspace.name}</span>
                      {shortcut ? (
                        <span className="workspace-tab-bar__shortcut" aria-hidden="true">
                          {shortcut}
                        </span>
                      ) : null}
                    </button>
                    <WorkspacePublishControls workspaceId={workspace.id} workspaceName={workspace.name} />
                  </>
                )}

                {workspaces.length > 1 ? (
                  <WorkspaceDeleteButton
                    workspaceId={workspace.id}
                    workspaceName={workspace.name}
                    workspaceCount={workspaces.length}
                    onConfirm={handleDeleteWorkspace}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
        <li className="workspace-tab-bar__tab-item workspace-tab-bar__tab-item--create">
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
        </li>
      </ul>
    </header>
  );
}

function WorkspaceDeleteButton({
  workspaceId,
  workspaceName,
  workspaceCount,
  onConfirm,
}: {
  workspaceId: string;
  workspaceName: string;
  workspaceCount: number;
  onConfirm: (workspaceId: string) => Promise<void>;
}) {
  const reasonId = useId();
  const publishState = useWorkspacePublish(workspaceId);
  const deletePendingToken = useAppStore((state) => state.deletePendingToken);
  const target = useMemo(
    () => ({ kind: "workspace" as const, id: workspaceId, label: workspaceName }),
    [workspaceId, workspaceName],
  );
  const eligibility = getWorkspaceDeleteEligibility({
    workspaceCount,
    publishEligibility: publishState.deleteEligibility,
    isDeleteBusy: Boolean(deletePendingToken),
  });
  const safeDelete = useSafeDelete({
    target,
    eligibility,
    onConfirm: () => onConfirm(workspaceId),
  });
  const unavailableReason = safeDelete.isPending
    ? "Workspace delete is in progress."
    : eligibility.state === "allowed"
      ? null
      : eligibility.reason;
  const buttonLabel = safeDelete.isPending
    ? `Deleting ${workspaceName}`
    : unavailableReason
      ? `Delete ${workspaceName} unavailable: ${unavailableReason}`
      : safeDelete.isArmed
        ? `Confirm delete ${workspaceName}`
        : `Delete ${workspaceName}`;
  const buttonProps = unavailableReason
    ? {
        "aria-busy": safeDelete.buttonProps["aria-busy"],
        "aria-pressed": safeDelete.buttonProps["aria-pressed"],
      }
    : safeDelete.buttonProps;

  return (
    <>
      <button
        type="button"
        className="workspace-tab-bar__close-button"
        aria-describedby={unavailableReason ? reasonId : undefined}
        aria-label={buttonLabel}
        disabled={Boolean(unavailableReason)}
        title={unavailableReason ?? undefined}
        {...buttonProps}
      >
        {safeDelete.isPending ? "..." : safeDelete.isArmed ? "x?" : "x"}
      </button>
      {unavailableReason ? (
        <span id={reasonId} className="workspace-tab-bar__delete-reason">
          {unavailableReason}
        </span>
      ) : null}
    </>
  );
}

function getWorkspaceDeleteEligibility({
  workspaceCount,
  publishEligibility,
  isDeleteBusy,
}: {
  workspaceCount: number;
  publishEligibility: DeleteEligibility;
  isDeleteBusy: boolean;
}): DeleteEligibility {
  if (workspaceCount <= 1) {
    return {
      state: "blocked",
      reason: "At least one workspace must remain.",
    };
  }

  if (isDeleteBusy) {
    return {
      state: "unknown",
      reason: "A workspace delete is already in progress.",
    };
  }

  return publishEligibility;
}
