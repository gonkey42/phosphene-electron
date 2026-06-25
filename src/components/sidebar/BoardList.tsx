import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createBoard,
  deleteBoard,
  mapBoardItems,
  listBoards,
  renameBoard,
  type BoardListItem,
} from "../../lib/board-operations";
import { formatRelativeUpdatedTime } from "../../lib/date-format";
import { useCancellableEffect } from "../../hooks/use-cancellable-effect";
import { useErrorReporter } from "../../hooks/use-error-reporter";
import { useInlineRename } from "../../hooks/use-inline-rename";
import { useSafeDelete } from "../../hooks/use-safe-delete";
import { clearSharedErrorChannel } from "../../hooks/shared-error-store";
import { useAppStore } from "../../stores/app-store";

import "./BoardList.css";

interface BoardListProps {
  workspaceId?: string;
  onBoardSelect?: (boardId: string | null) => void;
  isVisible?: boolean;
}

const BOARD_LOAD_ERROR_CHANNEL = "board-list:load";
const BOARD_RELOAD_ERROR_CHANNEL = "board-list:reload";
const BOARD_CREATE_ERROR_CHANNEL = "board-list:create";
const BOARD_RENAME_ERROR_CHANNEL = "board-list:rename";
const BOARD_DELETE_ERROR_CHANNEL = "board-list:delete";

export function BoardList({
  workspaceId: providedWorkspaceId,
  onBoardSelect,
  isVisible = true,
}: BoardListProps) {
  const storeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeWorkspaceId = providedWorkspaceId ?? storeWorkspaceId;
  const activeBoardId = useAppStore((state) =>
    activeWorkspaceId
      ? (state.activeBoardPerWorkspace[activeWorkspaceId] ?? null)
      : state.activeBoardId,
  );
  const boardListRefresh = useAppStore((state) => state.boardListRefresh);
  const getActiveBoardForWorkspace = useAppStore((state) => state.getActiveBoardForWorkspace);
  const setActiveBoard = useAppStore((state) => state.setActiveBoard);
  const setActiveBoardForWorkspace = useAppStore((state) => state.setActiveBoardForWorkspace);
  const setBoards = useAppStore((state) => state.setBoards);
  const cancelArmedDelete = useAppStore((state) => state.cancelArmedDelete);
  const reportError = useErrorReporter("BoardList");
  const [boards, setLocalBoards] = useState<BoardListItem[]>([]);
  const onBoardSelectRef = useRef(onBoardSelect);

  onBoardSelectRef.current = onBoardSelect;
  const {
    editingId: editingBoardId,
    draftName,
    setDraftName,
    startRename,
    cancelRename,
    commitRename,
  } = useInlineRename(async (boardId, trimmedName) => {
    try {
      await renameBoard(boardId, trimmedName);
    } catch (error) {
      reportError("Failed to rename board", error, undefined, {
        channel: BOARD_RENAME_ERROR_CHANNEL,
      });
      throw error;
    }
  });

  const syncBoardState = useCallback(
    (items: BoardListItem[], workspaceId = activeWorkspaceId) => {
      setLocalBoards(items);
      setBoards(mapBoardItems(items));
      clearSharedErrorChannel(BOARD_LOAD_ERROR_CHANNEL);
      clearSharedErrorChannel(BOARD_RELOAD_ERROR_CHANNEL);

      const currentActiveBoardId = workspaceId
        ? getActiveBoardForWorkspace(workspaceId)
        : useAppStore.getState().activeBoardId;
      if (!currentActiveBoardId) {
        return;
      }

      const hasActiveBoard = items.some((item) => item.id === currentActiveBoardId);
      if (!hasActiveBoard) {
        if (workspaceId) {
          setActiveBoardForWorkspace(workspaceId, null);
        } else {
          setActiveBoard(null);
        }
        onBoardSelectRef.current?.(null);
      }
    },
    [
      activeWorkspaceId,
      getActiveBoardForWorkspace,
      setActiveBoard,
      setActiveBoardForWorkspace,
      setBoards,
    ],
  );

  const hasWorkspaceChanged = useCallback(
    (workspaceId: string | null) =>
      (providedWorkspaceId ?? useAppStore.getState().activeWorkspaceId) !== workspaceId,
    [providedWorkspaceId],
  );

  const refreshBoards = useCallback(
    async (workspaceId = activeWorkspaceId) => {
      try {
        const items = await listBoards(workspaceId ?? undefined);

        if (hasWorkspaceChanged(workspaceId)) {
          return null;
        }

        syncBoardState(items, workspaceId);
        return items;
      } catch (error) {
        const workspaceIdAtStart = workspaceId ?? null;
        reportError("Failed to reload boards", error, { workspaceId: workspaceIdAtStart }, {
          channel: BOARD_RELOAD_ERROR_CHANNEL,
          retry: {
            label: "Retry",
            run: async () => {
              await refreshBoards(workspaceIdAtStart);
            },
          },
        });
        return null;
      }
    },
    [activeWorkspaceId, hasWorkspaceChanged, reportError, syncBoardState],
  );

  useCancellableEffect(
    (token) => {
      void (async () => {
        try {
          const items = await listBoards(activeWorkspaceId ?? undefined);

          if (token.cancelled) {
            return;
          }

          syncBoardState(items, activeWorkspaceId);
        } catch (error) {
          const workspaceIdAtStart = activeWorkspaceId;
          reportError("Failed to load boards", error, { workspaceId: workspaceIdAtStart }, {
            channel: BOARD_LOAD_ERROR_CHANNEL,
            retry: {
              label: "Retry",
              run: async () => {
                await refreshBoards(workspaceIdAtStart);
              },
            },
          });

          if (!token.cancelled) {
            setLocalBoards([]);
            setBoards([]);
          }
        }
      })();
    },
    [
      activeWorkspaceId,
      refreshBoards,
      reportError,
      setActiveBoard,
      setActiveBoardForWorkspace,
      setBoards,
    ],
  );

  useEffect(() => {
    if (isVisible) {
      return;
    }

    cancelRename();
    const { armedDeleteTarget } = useAppStore.getState();
    if (
      armedDeleteTarget?.kind === "board" &&
      armedDeleteTarget.workspaceId === activeWorkspaceId
    ) {
      cancelArmedDelete();
    }
  }, [activeWorkspaceId, cancelArmedDelete, cancelRename, isVisible]);

  useEffect(() => {
    if (!activeWorkspaceId || boardListRefresh.workspaceId !== activeWorkspaceId) {
      return;
    }

    void refreshBoards(activeWorkspaceId);
  }, [activeWorkspaceId, boardListRefresh.nonce, boardListRefresh.workspaceId, refreshBoards]);

  async function handleCreateBoard() {
    cancelArmedDelete();

    const workspaceIdAtStart = activeWorkspaceId;
    const nextName = `Board ${boards.length + 1}`;

    try {
      const newBoardId = await createBoard(nextName, workspaceIdAtStart);

      clearSharedErrorChannel(BOARD_CREATE_ERROR_CHANNEL);

      if (hasWorkspaceChanged(workspaceIdAtStart)) {
        return;
      }

      if (workspaceIdAtStart) {
        setActiveBoardForWorkspace(workspaceIdAtStart, newBoardId);
      } else {
        setActiveBoard(newBoardId);
      }
      onBoardSelectRef.current?.(newBoardId);

      await refreshBoards(workspaceIdAtStart);
    } catch (error) {
      reportError("Failed to create board", error, { workspaceId: workspaceIdAtStart }, {
        channel: BOARD_CREATE_ERROR_CHANNEL,
      });
    }
  }

  async function handleDeleteBoard(boardId: string, workspaceIdAtStart = activeWorkspaceId) {
    try {
      if (hasWorkspaceChanged(workspaceIdAtStart)) {
        return;
      }

      await deleteBoard(boardId);

      clearSharedErrorChannel(BOARD_DELETE_ERROR_CHANNEL);

      if (hasWorkspaceChanged(workspaceIdAtStart)) {
        return;
      }

      const currentActiveBoardId = workspaceIdAtStart
        ? getActiveBoardForWorkspace(workspaceIdAtStart)
        : useAppStore.getState().activeBoardId;

      if (currentActiveBoardId === boardId) {
        if (workspaceIdAtStart) {
          setActiveBoardForWorkspace(workspaceIdAtStart, null);
        } else {
          setActiveBoard(null);
        }
        onBoardSelectRef.current?.(null);
      }

      if (editingBoardId === boardId) {
        cancelRename();
      }

      await refreshBoards(workspaceIdAtStart);
    } catch (error) {
      reportError("Failed to delete board", error, { workspaceId: workspaceIdAtStart }, {
        channel: BOARD_DELETE_ERROR_CHANNEL,
      });
    }
  }

  async function handleCommitRename(boardId: string) {
    const workspaceIdAtStart = activeWorkspaceId;
    try {
      await commitRename(boardId);

      clearSharedErrorChannel(BOARD_RENAME_ERROR_CHANNEL);

      if (hasWorkspaceChanged(workspaceIdAtStart)) {
        return;
      }

      await refreshBoards(workspaceIdAtStart);
    } catch {
      // The hook callback already logged the failure; keep the edit UI unchanged.
    }
  }

  return (
    <section className="board-list" aria-label="Boards">
      <div className="board-list__header">
        <div className="board-list__title">Boards</div>
        <button
          type="button"
          className="board-list__create-button"
          aria-label="Create board"
          onClick={() => {
            void handleCreateBoard();
          }}
        >
          +
        </button>
      </div>

      {boards.length === 0 ? (
        <div className="board-list__empty">
          <div className="board-list__empty-title">No boards yet.</div>
          <div>Click + to create one.</div>
        </div>
      ) : (
        <ul className="board-list__items">
          {boards.map((board) => {
            const isActive = board.id === activeBoardId;
            const isEditing = editingBoardId === board.id;
            const selectBoard = () => {
              if (activeWorkspaceId) {
                setActiveBoardForWorkspace(activeWorkspaceId, board.id);
              } else {
                setActiveBoard(board.id);
              }
              onBoardSelect?.(board.id);
            };

            return (
              <li
                key={board.id}
                className={[
                  "board-list__item",
                  isActive ? "board-list__item--active" : "",
                  isEditing ? "board-list__item--editing" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {isEditing ? (
                  <form
                    className="board-list__rename-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleCommitRename(board.id);
                    }}
                  >
                    <input
                      aria-label="Board name"
                      className="board-list__rename-input"
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleCommitRename(board.id);
                        }

                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelRename();
                        }
                      }}
                      autoFocus
                    />
                    <button type="submit" className="board-list__action-button">
                      Save
                    </button>
                    <button
                      type="button"
                      className="board-list__action-button"
                      onClick={cancelRename}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className={`board-list__item-button${isActive ? " board-list__item-button--active" : ""}`}
                    onClick={selectBoard}
                  >
                    <span className="board-list__item-name">{board.name}</span>
                  </button>
                )}

                <div className="board-list__item-meta">
                  <time dateTime={board.updated_at}>
                    {formatRelativeUpdatedTime(board.updated_at)}
                  </time>
                </div>

                <div
                  className="board-list__item-actions"
                  data-reachable="always"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {!isEditing ? (
                    <button
                      type="button"
                      className="board-list__action-button"
                      onClick={() => {
                        cancelArmedDelete();
                        startRename(board.id, board.name);
                      }}
                    >
                      Rename
                    </button>
                  ) : null}
                  <BoardDeleteButton
                    boardId={board.id}
                    boardName={board.name}
                    workspaceId={board.workspace_id}
                    onConfirm={handleDeleteBoard}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function BoardDeleteButton({
  boardId,
  boardName,
  workspaceId,
  onConfirm,
}: {
  boardId: string;
  boardName: string;
  workspaceId: string | null;
  onConfirm: (boardId: string, workspaceId: string | null) => Promise<void>;
}) {
  const target = useMemo(
    () => ({ kind: "board" as const, id: boardId, workspaceId, label: boardName }),
    [boardId, boardName, workspaceId],
  );
  const safeDelete = useSafeDelete({
    target,
    onConfirm: () => onConfirm(boardId, workspaceId),
  });
  const { onClick, onKeyDown, ...buttonProps } = safeDelete.buttonProps;
  const actionLabel = safeDelete.isPending
    ? `Deleting ${boardName}`
    : safeDelete.isArmed
      ? `Confirm delete ${boardName}`
      : `Delete ${boardName}`;

  return (
    <button
      type="button"
      className="board-list__action-button"
      aria-label={actionLabel}
      {...buttonProps}
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        onKeyDown(event);
      }}
    >
      {safeDelete.isPending ? "Deleting..." : safeDelete.isArmed ? "Delete?" : "Delete"}
    </button>
  );
}
