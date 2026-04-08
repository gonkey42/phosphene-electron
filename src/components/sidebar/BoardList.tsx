import { useCallback, useEffect, useRef, useState } from "react";

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
import { useAppStore } from "../../stores/app-store";

import "./BoardList.css";

interface BoardListProps {
  workspaceId?: string;
  onBoardSelect?: (boardId: string | null) => void;
}

export function BoardList({ workspaceId: providedWorkspaceId, onBoardSelect }: BoardListProps) {
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
    const workspaceIdAtStart = activeWorkspaceId;

    try {
      await renameBoard(boardId, trimmedName);

      if (hasWorkspaceChanged(workspaceIdAtStart)) {
        return;
      }

      await refreshBoards(workspaceIdAtStart);
    } catch (error) {
      reportError("Failed to rename board", error);
      throw error;
    }
  });

  const syncBoardState = useCallback(
    (items: BoardListItem[], workspaceId = activeWorkspaceId) => {
      setLocalBoards(items);
      setBoards(mapBoardItems(items));

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
        reportError("Failed to reload boards", error);
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
          reportError("Failed to load boards", error);

          if (!token.cancelled) {
            setLocalBoards([]);
            setBoards([]);
          }
        }
      })();
    },
    [activeWorkspaceId, reportError, setActiveBoard, setActiveBoardForWorkspace, setBoards],
  );

  useEffect(() => {
    if (!activeWorkspaceId || boardListRefresh.workspaceId !== activeWorkspaceId) {
      return;
    }

    void refreshBoards(activeWorkspaceId);
  }, [activeWorkspaceId, boardListRefresh.nonce, boardListRefresh.workspaceId, refreshBoards]);

  async function handleCreateBoard() {
    try {
      const workspaceIdAtStart = activeWorkspaceId;
      const nextName = `Board ${boards.length + 1}`;
      const newBoardId = await createBoard(nextName, workspaceIdAtStart);

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
      reportError("Failed to create board", error);
    }
  }

  async function handleDeleteBoard(boardId: string) {
    try {
      const workspaceIdAtStart = activeWorkspaceId;
      await deleteBoard(boardId);

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
      reportError("Failed to delete board", error);
    }
  }

  async function handleCommitRename(boardId: string) {
    try {
      await commitRename(boardId);
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

            return (
              <li
                key={board.id}
                className={`board-list__item${isActive ? " board-list__item--active" : ""}`}
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
                    onClick={() => {
                      if (activeWorkspaceId) {
                        setActiveBoardForWorkspace(activeWorkspaceId, board.id);
                      } else {
                        setActiveBoard(board.id);
                      }
                      onBoardSelect?.(board.id);
                    }}
                  >
                    <span className="board-list__item-name">{board.name}</span>
                  </button>
                )}

                <div className="board-list__item-meta">
                  <time dateTime={board.updated_at}>
                    {formatRelativeUpdatedTime(board.updated_at)}
                  </time>
                </div>

                <div className="board-list__item-actions">
                  <button
                    type="button"
                    className="board-list__action-button"
                    onClick={() => startRename(board.id, board.name)}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="board-list__action-button"
                    onClick={() => {
                      void handleDeleteBoard(board.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
