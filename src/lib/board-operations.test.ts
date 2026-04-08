import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.fn();
const selectMock = vi.fn();
const loadMock = vi.fn();
const generateIdMock = vi.fn();

vi.mock("./database", () => ({
  getDb: loadMock,
}));

vi.mock("./uuid", () => ({
  generateId: generateIdMock,
}));

describe("board operations", () => {
  beforeEach(() => {
    vi.resetModules();
    executeMock.mockReset();
    selectMock.mockReset();
    loadMock.mockReset();
    generateIdMock.mockReset();
    loadMock.mockResolvedValue({ execute: executeMock, select: selectMock });
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

  it("creates a board in the null workspace at the next position", async () => {
    selectMock.mockResolvedValueOnce([{ position: 5 }]);
    generateIdMock.mockReturnValue("new-board-id");

    const { createBoard } = await import("./board-operations");
    await expect(createBoard("New board", null)).resolves.toBe("new-board-id");

    expect(generateIdMock).toHaveBeenCalledTimes(1);
    expect(selectMock).toHaveBeenCalledWith(
      "SELECT COALESCE(MAX(position), -1) + 1 as position FROM boards WHERE deleted_at IS NULL AND workspace_id IS NULL",
      [],
    );
    expect(executeMock).toHaveBeenCalledWith(
      "INSERT INTO boards (id, workspace_id, name, position) VALUES ($1, $2, $3, $4)",
      ["new-board-id", null, "New board", 5],
    );
  });

  it("creates a board in a workspace at the next position", async () => {
    selectMock.mockResolvedValueOnce([{ position: 2 }]);
    generateIdMock.mockReturnValue("new-board-id");

    const { createBoard } = await import("./board-operations");
    await createBoard("Workspace board", "workspace-1");

    expect(selectMock).toHaveBeenCalledWith(
      "SELECT COALESCE(MAX(position), -1) + 1 as position FROM boards WHERE deleted_at IS NULL AND workspace_id = $1",
      ["workspace-1"],
    );
    expect(executeMock).toHaveBeenCalledWith(
      "INSERT INTO boards (id, workspace_id, name, position) VALUES ($1, $2, $3, $4)",
      ["new-board-id", "workspace-1", "Workspace board", 2],
    );
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
});
