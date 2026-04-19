import { beforeEach, describe, expect, it, vi } from "vitest";

const listBoardsMock = vi.fn();
const getBoardMock = vi.fn();
const createBoardMock = vi.fn();
const renameBoardMock = vi.fn();
const deleteBoardMock = vi.fn();
const saveCanvasDataMock = vi.fn();
const saveThumbnailMock = vi.fn();

vi.mock("../platform/desktop-api", () => ({
  boards: {
    list: listBoardsMock,
    get: getBoardMock,
    createBoard: createBoardMock,
    rename: renameBoardMock,
    delete: deleteBoardMock,
    saveCanvasData: saveCanvasDataMock,
    saveThumbnail: saveThumbnailMock,
  },
}));

describe("board operations", () => {
  beforeEach(() => {
    vi.resetModules();
    listBoardsMock.mockReset();
    getBoardMock.mockReset();
    createBoardMock.mockReset();
    renameBoardMock.mockReset();
    deleteBoardMock.mockReset();
    saveCanvasDataMock.mockReset();
    saveThumbnailMock.mockReset();
  });

  it("lists non-deleted boards ordered by position without loading canvas data", async () => {
    listBoardsMock.mockResolvedValue([
      {
        id: "board-1",
        workspaceId: null,
        name: "Sketches",
        description: "Main board",
        position: 2,
        updatedAt: "2026-03-29T10:00:00Z",
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
    expect(listBoardsMock).toHaveBeenCalledWith(null);
  });

  it("filters listBoards by workspace when provided", async () => {
    listBoardsMock.mockResolvedValue([]);

    const { listBoards } = await import("./board-operations");
    await listBoards("workspace-1");

    expect(listBoardsMock).toHaveBeenCalledWith("workspace-1");
  });

  it("gets a board with full canvas data and returns null for deleted boards", async () => {
    getBoardMock.mockResolvedValueOnce({
      id: "board-1",
      workspaceId: "workspace-1",
      name: "Sketches",
      description: null,
      canvasData: "{}",
      thumbnail: null,
      position: 3,
      createdAt: "2026-03-29T09:00:00Z",
      updatedAt: "2026-03-29T10:00:00Z",
      deletedAt: null,
    });
    getBoardMock.mockResolvedValueOnce(null);

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
    expect(getBoardMock).toHaveBeenCalledWith("board-1");
  });

  it("creates a board through the desktop bridge", async () => {
    createBoardMock.mockResolvedValueOnce("new-board-id");

    const { createBoard } = await import("./board-operations");
    await expect(createBoard("New board", null)).resolves.toBe("new-board-id");

    expect(createBoardMock).toHaveBeenCalledWith("New board", null);
  });

  it("proxies board mutations through the desktop bridge", async () => {
    const { renameBoard, deleteBoard, saveBoardCanvasData, saveBoardThumbnail } =
      await import("./board-operations");

    await renameBoard("board-1", "Updated board");
    await deleteBoard("board-1");
    await saveBoardCanvasData("board-1", '{"type":"excalidraw"}');
    await saveBoardThumbnail("board-1", "thumbnail-data");

    expect(renameBoardMock).toHaveBeenCalledWith("board-1", "Updated board");
    expect(deleteBoardMock).toHaveBeenCalledWith("board-1");
    expect(saveCanvasDataMock).toHaveBeenCalledWith("board-1", '{"type":"excalidraw"}');
    expect(saveThumbnailMock).toHaveBeenCalledWith("board-1", "thumbnail-data");
  });
});
