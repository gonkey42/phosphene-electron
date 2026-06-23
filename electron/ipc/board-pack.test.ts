import { beforeEach, describe, expect, it, vi } from "vitest";

const handleMock = vi.fn();
const importBoardPackMock = vi.fn();

type ImportFolderHandler = (
  _event: unknown,
  packDir?: unknown,
  options?: unknown,
) => Promise<unknown>;

const IMPORT_FOLDER_CHANNEL = "board-packs:import-folder";
const INVALID_PAYLOAD_PREFIX = `[IPC ${IMPORT_FOLDER_CHANNEL}] Invalid payload:`;
const PLAIN_OBJECT_ERROR = `${INVALID_PAYLOAD_PREFIX} expected options to be a plain object`;

class BoardPackImportOptionsClass {
  targetWorkspaceName = "Vacation Plan";
}

const malformedOptionsCases: Array<{
  name: string;
  options: unknown;
  message: string;
}> = [
  {
    name: "conflicting selectors",
    options: {
      targetWorkspaceId: "workspace-1",
      targetActiveWorkspace: true,
    },
    message: `${INVALID_PAYLOAD_PREFIX} use only one target workspace selector`,
  },
  {
    name: "null target workspace id selector",
    options: { targetWorkspaceId: null },
    message: `${INVALID_PAYLOAD_PREFIX} expected targetWorkspaceId to be a non-empty string`,
  },
  {
    name: "null target workspace name selector",
    options: { targetWorkspaceName: null },
    message: `${INVALID_PAYLOAD_PREFIX} expected targetWorkspaceName to be a non-empty string`,
  },
  {
    name: "explicit undefined target workspace id selector",
    options: { targetWorkspaceId: undefined },
    message: `${INVALID_PAYLOAD_PREFIX} expected targetWorkspaceId to be a non-empty string`,
  },
  {
    name: "explicit undefined target workspace name selector",
    options: { targetWorkspaceName: undefined },
    message: `${INVALID_PAYLOAD_PREFIX} expected targetWorkspaceName to be a non-empty string`,
  },
  {
    name: "explicit undefined active workspace selector",
    options: { targetActiveWorkspace: undefined },
    message: `${INVALID_PAYLOAD_PREFIX} expected targetActiveWorkspace to be true when provided`,
  },
  {
    name: "blank target workspace name selector",
    options: { targetWorkspaceName: "   " },
    message: `${INVALID_PAYLOAD_PREFIX} expected targetWorkspaceName to be a non-empty string`,
  },
  {
    name: "unexpected option key",
    options: { unexpected: "value" },
    message: `${INVALID_PAYLOAD_PREFIX} unexpected option unexpected`,
  },
  {
    name: "false active workspace selector",
    options: { targetActiveWorkspace: false },
    message: `${INVALID_PAYLOAD_PREFIX} expected targetActiveWorkspace to be true when provided`,
  },
  {
    name: "null active workspace selector",
    options: { targetActiveWorkspace: null },
    message: `${INVALID_PAYLOAD_PREFIX} expected targetActiveWorkspace to be true when provided`,
  },
  {
    name: "top-level null options",
    options: null,
    message: PLAIN_OBJECT_ERROR,
  },
  {
    name: "empty options object",
    options: {},
    message: `${INVALID_PAYLOAD_PREFIX} expected options to include one target workspace selector`,
  },
  {
    name: "Date options",
    options: new Date(),
    message: PLAIN_OBJECT_ERROR,
  },
  {
    name: "Map options",
    options: new Map(),
    message: PLAIN_OBJECT_ERROR,
  },
  {
    name: "string options",
    options: "targetWorkspaceName",
    message: PLAIN_OBJECT_ERROR,
  },
  {
    name: "array options",
    options: [],
    message: PLAIN_OBJECT_ERROR,
  },
  {
    name: "class instance options",
    options: new BoardPackImportOptionsClass(),
    message: PLAIN_OBJECT_ERROR,
  },
];

const malformedPackDirCases: Array<{
  name: string;
  packDir: unknown;
}> = [
  { name: "missing import folder", packDir: undefined },
  { name: "empty import folder", packDir: "" },
  { name: "blank import folder", packDir: "   " },
];

vi.mock("electron", () => ({
  ipcMain: {
    handle: handleMock,
  },
}));

vi.mock("../board-pack/importer", () => ({
  importBoardPack: importBoardPackMock,
}));

async function registerAndGetImportFolderHandler(): Promise<ImportFolderHandler> {
  const { registerBoardPackIPC } = await import("./board-pack");

  registerBoardPackIPC("/app/data");

  const importFolderHandler = handleMock.mock.calls.find(
    ([channel]) => channel === IMPORT_FOLDER_CHANNEL,
  )?.[1];

  expect(importFolderHandler).toBeTypeOf("function");

  return importFolderHandler as ImportFolderHandler;
}

describe("registerBoardPackIPC", () => {
  beforeEach(() => {
    vi.resetModules();
    handleMock.mockReset();
    importBoardPackMock.mockReset();
  });

  it("registers the board pack folder import handler", async () => {
    await registerAndGetImportFolderHandler();
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
    importBoardPackMock.mockResolvedValue(importResult);

    const importFolderHandler = await registerAndGetImportFolderHandler();

    await expect(importFolderHandler({}, "/packs/starter")).resolves.toBe(importResult);
    await expect(importFolderHandler({}, "/packs/starter", undefined)).resolves.toBe(
      importResult,
    );
    expect(importBoardPackMock).toHaveBeenCalledTimes(2);
    expect(importBoardPackMock).toHaveBeenNthCalledWith(1, {
      packDir: "/packs/starter",
      userDataPath: "/app/data",
      targetWorkspace: { type: "new" },
    });
    expect(importBoardPackMock).toHaveBeenNthCalledWith(2, {
      packDir: "/packs/starter",
      userDataPath: "/app/data",
      targetWorkspace: { type: "new" },
    });
  });

  it("imports a folder into a target workspace id from options", async () => {
    const importResult = { workspaceId: "workspace-1", importedBoards: [] };
    importBoardPackMock.mockResolvedValueOnce(importResult);
    const importFolderHandler = await registerAndGetImportFolderHandler();

    await expect(
      importFolderHandler({}, "/packs/starter", { targetWorkspaceId: "workspace-1" }),
    ).resolves.toBe(importResult);
    expect(importBoardPackMock).toHaveBeenCalledWith({
      packDir: "/packs/starter",
      userDataPath: "/app/data",
      targetWorkspace: { type: "id", id: "workspace-1" },
    });
  });

  it("imports a folder into a target workspace name from options", async () => {
    const importResult = { workspaceId: "workspace-1", importedBoards: [] };
    importBoardPackMock.mockResolvedValueOnce(importResult);
    const importFolderHandler = await registerAndGetImportFolderHandler();

    await expect(
      importFolderHandler({}, "/packs/starter", { targetWorkspaceName: "Vacation Plan" }),
    ).resolves.toBe(importResult);
    expect(importBoardPackMock).toHaveBeenCalledWith({
      packDir: "/packs/starter",
      userDataPath: "/app/data",
      targetWorkspace: { type: "name", name: "Vacation Plan" },
    });
  });

  it("imports a folder into the active workspace from options", async () => {
    const importResult = { workspaceId: "workspace-1", importedBoards: [] };
    importBoardPackMock.mockResolvedValueOnce(importResult);
    const importFolderHandler = await registerAndGetImportFolderHandler();

    await expect(
      importFolderHandler({}, "/packs/starter", { targetActiveWorkspace: true }),
    ).resolves.toBe(importResult);
    expect(importBoardPackMock).toHaveBeenCalledWith({
      packDir: "/packs/starter",
      userDataPath: "/app/data",
      targetWorkspace: { type: "active" },
    });
  });

  it.each(malformedOptionsCases)(
    "rejects malformed board pack import options: $name",
    async ({ options, message }) => {
      const importFolderHandler = await registerAndGetImportFolderHandler();

      await expect(importFolderHandler({}, "/packs/starter", options)).rejects.toThrow(
        message,
      );
      expect(importBoardPackMock).not.toHaveBeenCalled();
    },
  );

  it.each(malformedPackDirCases)(
    "rejects malformed import folder payloads: $name",
    async ({ packDir }) => {
      const importFolderHandler = await registerAndGetImportFolderHandler();

      await expect(importFolderHandler({}, packDir)).rejects.toThrow(
        `${INVALID_PAYLOAD_PREFIX} expected packDir to be a non-empty string`,
      );
      expect(importBoardPackMock).not.toHaveBeenCalled();
    },
  );
});
