import { beforeEach, describe, expect, it, vi } from "vitest";

const handleMock = vi.fn();
const importBoardPackMock = vi.fn();

vi.mock("electron", () => ({
  ipcMain: {
    handle: handleMock,
  },
}));

vi.mock("../board-pack/importer", () => ({
  importBoardPack: importBoardPackMock,
}));

describe("registerBoardPackIPC", () => {
  beforeEach(() => {
    vi.resetModules();
    handleMock.mockReset();
    importBoardPackMock.mockReset();
  });

  it("registers the board pack folder import handler", async () => {
    const { registerBoardPackIPC } = await import("./board-pack");

    registerBoardPackIPC("/app/data");

    const importFolderHandler = handleMock.mock.calls.find(
      ([channel]) => channel === "board-packs:import-folder",
    )?.[1];

    expect(importFolderHandler).toBeTypeOf("function");
  });

  it("imports a validated folder path using the app user data path", async () => {
    const importResult = {
      workspaceId: "workspace-1",
      importedBoards: [
        {
          sourceId: "source-board-1",
          boardId: "board-1",
          name: "Starter Board",
        },
      ],
    };
    importBoardPackMock.mockResolvedValueOnce(importResult);

    const { registerBoardPackIPC } = await import("./board-pack");

    registerBoardPackIPC("/app/data");

    const importFolderHandler = handleMock.mock.calls.find(
      ([channel]) => channel === "board-packs:import-folder",
    )?.[1];

    await expect(importFolderHandler?.({}, "/packs/starter")).resolves.toBe(importResult);
    expect(importBoardPackMock).toHaveBeenCalledWith({
      packDir: "/packs/starter",
      userDataPath: "/app/data",
    });
  });

  it("rejects missing or blank import folder payloads before importing", async () => {
    const { registerBoardPackIPC } = await import("./board-pack");

    registerBoardPackIPC("/app/data");

    const importFolderHandler = handleMock.mock.calls.find(
      ([channel]) => channel === "board-packs:import-folder",
    )?.[1];

    await expect(importFolderHandler?.({}, undefined)).rejects.toThrow(
      "[IPC board-packs:import-folder] Invalid payload: expected packDir to be a non-empty string",
    );
    await expect(importFolderHandler?.({}, "")).rejects.toThrow(
      "[IPC board-packs:import-folder] Invalid payload: expected packDir to be a non-empty string",
    );
    await expect(importFolderHandler?.({}, "   ")).rejects.toThrow(
      "[IPC board-packs:import-folder] Invalid payload: expected packDir to be a non-empty string",
    );

    expect(importBoardPackMock).not.toHaveBeenCalled();
  });
});
