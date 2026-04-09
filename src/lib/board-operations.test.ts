import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.fn();
const selectMock = vi.fn();
const loadMock = vi.fn();
const createBoardMock = vi.fn();
const mainDbPragmaMock = vi.fn();
const mainDbExecMock = vi.fn();
const mainDbPrepareMock = vi.fn();
const mainDbTransactionMock = vi.fn();

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("better-sqlite3", () => {
  const DatabaseMock = function () {
    return {
      pragma: mainDbPragmaMock,
      exec: mainDbExecMock,
      prepare: mainDbPrepareMock,
      transaction: mainDbTransactionMock,
      backup: vi.fn(),
      close: vi.fn(),
    };
  };

  return { default: DatabaseMock };
});

vi.mock("./database", () => ({
  getDb: loadMock,
}));

vi.mock("../platform/desktop-api", () => ({
  boards: {
    createBoard: createBoardMock,
  },
}));

describe("board operations", () => {
  beforeEach(() => {
    vi.resetModules();
    executeMock.mockReset();
    selectMock.mockReset();
    loadMock.mockReset();
    createBoardMock.mockReset();
    mainDbPragmaMock.mockReset();
    mainDbExecMock.mockReset();
    mainDbPrepareMock.mockReset();
    mainDbTransactionMock.mockReset();
    loadMock.mockResolvedValue({ execute: executeMock, select: selectMock });
    executeMock.mockResolvedValue({ rowsAffected: 1 });
  });

  it("lists non-deleted boards ordered by position without loading canvas data", async () => {
    selectMock.mockResolvedValue([
      {
        id: "board-1",
        name: "Sketches",
        description: "Main board",
        position: 2,
        updated_at: "2026-03-29T10:00:00Z",
        workspace_id: null,
      },
    ]);

    const { listBoards } = await import("./board-operations");
    const boards = await listBoards();

    expect(boards).toEqual([
      {
        id: "board-1",
        name: "Sketches",
        description: "Main board",
        position: 2,
        updated_at: "2026-03-29T10:00:00Z",
        workspace_id: null,
      },
    ]);
    expect(selectMock).toHaveBeenCalledWith(
      "SELECT id, name, description, position, updated_at, workspace_id FROM boards WHERE deleted_at IS NULL ORDER BY position",
      [],
    );
  });

  it("filters listBoards by workspace when provided", async () => {
    selectMock.mockResolvedValue([]);

    const { listBoards } = await import("./board-operations");
    await listBoards("workspace-1");

    expect(selectMock).toHaveBeenCalledWith(
      "SELECT id, name, description, position, updated_at, workspace_id FROM boards WHERE deleted_at IS NULL AND workspace_id = $1 ORDER BY position",
      ["workspace-1"],
    );
  });

  it("gets a board with full canvas data and returns null for deleted boards", async () => {
    selectMock.mockResolvedValueOnce([
      {
        id: "board-1",
        workspace_id: "workspace-1",
        name: "Sketches",
        description: null,
        canvas_data: "{}",
        thumbnail: null,
        position: 3,
        created_at: "2026-03-29T09:00:00Z",
        updated_at: "2026-03-29T10:00:00Z",
        deleted_at: null,
      },
    ]);
    selectMock.mockResolvedValueOnce([]);

    const { getBoard } = await import("./board-operations");

    await expect(getBoard("board-1")).resolves.toEqual({
      id: "board-1",
      workspace_id: "workspace-1",
      name: "Sketches",
      description: null,
      canvas_data: "{}",
      thumbnail: null,
      position: 3,
      created_at: "2026-03-29T09:00:00Z",
      updated_at: "2026-03-29T10:00:00Z",
      deleted_at: null,
    });
    await expect(getBoard("missing-board")).resolves.toBeNull();
    expect(selectMock).toHaveBeenNthCalledWith(
      1,
      "SELECT id, workspace_id, name, description, canvas_data, thumbnail, position, created_at, updated_at, deleted_at FROM boards WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
      ["board-1"],
    );
  });

  it("creates a board through the desktop bridge", async () => {
    createBoardMock.mockResolvedValueOnce("new-board-id");

    const { createBoard } = await import("./board-operations");
    await expect(createBoard("New board", null)).resolves.toBe("new-board-id");

    expect(createBoardMock).toHaveBeenCalledWith("New board", null);
    expect(selectMock).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("renames, soft deletes, and updates board assets with SQL timestamps intact", async () => {
    const { renameBoard, deleteBoard, saveBoardCanvasData, saveBoardThumbnail } =
      await import("./board-operations");

    await renameBoard("board-1", "Updated board");
    await deleteBoard("board-1");
    await saveBoardCanvasData("board-1", '{"type":"excalidraw"}');
    await saveBoardThumbnail("board-1", "thumbnail-data");

    expect(executeMock).toHaveBeenNthCalledWith(
      1,
      "UPDATE boards SET name = $2 WHERE id = $1 AND deleted_at IS NULL",
      ["board-1", "Updated board"],
    );
    expect(executeMock).toHaveBeenNthCalledWith(
      2,
      "UPDATE boards SET deleted_at = datetime('now','utc') WHERE id = $1 AND deleted_at IS NULL",
      ["board-1"],
    );
    expect(executeMock).toHaveBeenNthCalledWith(
      3,
      "UPDATE boards SET canvas_data = $2 WHERE id = $1 AND deleted_at IS NULL",
      ["board-1", '{"type":"excalidraw"}'],
    );
    expect(executeMock).toHaveBeenNthCalledWith(
      4,
      "UPDATE boards SET thumbnail = $2 WHERE id = $1 AND deleted_at IS NULL",
      ["board-1", "thumbnail-data"],
    );
  });

  it("throws when renaming a board affects zero rows", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 0 });

    const { renameBoard } = await import("./board-operations");

    await expect(renameBoard("missing-board", "Renamed")).rejects.toThrow(
      "Board rename affected 0 rows",
    );
  });

  it("throws when deleting a board affects zero rows", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 0 });

    const { deleteBoard } = await import("./board-operations");

    await expect(deleteBoard("missing-board")).rejects.toThrow("Board delete affected 0 rows");
  });

  it("throws when saving board canvas data affects zero rows", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 0 });

    const { saveBoardCanvasData } = await import("./board-operations");

    await expect(saveBoardCanvasData("missing-board", '{"type":"excalidraw"}')).rejects.toThrow(
      "Board save affected 0 rows",
    );
  });

  it("throws when saving a board thumbnail affects zero rows", async () => {
    executeMock.mockResolvedValueOnce({ rowsAffected: 0 });

    const { saveBoardThumbnail } = await import("./board-operations");

    await expect(saveBoardThumbnail("missing-board", "thumbnail-data")).rejects.toThrow(
      "Board thumbnail save affected 0 rows",
    );
  });

  it("creates a board atomically through the main-process helper", async () => {
    const state = {
      boards: [
        { id: "board-1", workspace_id: null, position: 0 },
        { id: "board-2", workspace_id: null, position: 1 },
      ] as Array<{ id: string; workspace_id: string | null; position: number }>,
    };
    let inTransaction = false;
    let insertedBoardId: string | null = null;

    mainDbTransactionMock.mockImplementation((callback: (...args: any[]) => unknown) => {
      return (...args: any[]) => {
        inTransaction = true;
        try {
          return callback(...args);
        } finally {
          inTransaction = false;
        }
      };
    });
    mainDbPrepareMock.mockImplementation((sql: string) => {
      if (
        sql ===
        "SELECT COALESCE(MAX(position), -1) + 1 as position FROM boards WHERE deleted_at IS NULL AND workspace_id IS NULL"
      ) {
        return {
          get() {
            expect(inTransaction).toBe(true);
            return { position: Math.max(...state.boards.map((board) => board.position)) + 1 };
          },
        };
      }

      if (sql === "INSERT INTO boards (id, workspace_id, name, position) VALUES (?, ?, ?, ?)") {
        return {
          run(id: string, workspaceId: string | null, name: string, position: number) {
            expect(inTransaction).toBe(true);
            expect(name).toBe("New board");
            expect(workspaceId).toBeNull();
            insertedBoardId = id;
            state.boards.push({ id, workspace_id: workspaceId, position });
            return { changes: 1 };
          },
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const { createBoard } = await import("../../electron/ipc/database");
    const boardId = createBoard(
      {
        prepare: mainDbPrepareMock,
        transaction: mainDbTransactionMock,
      } as never,
      "New board",
      null,
    );

    expect(boardId).toBe(insertedBoardId);
    expect(state.boards).toEqual([
      { id: "board-1", workspace_id: null, position: 0 },
      { id: "board-2", workspace_id: null, position: 1 },
      { id: boardId, workspace_id: null, position: 2 },
    ]);
  });
});
