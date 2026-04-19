import { beforeEach, describe, expect, it, vi } from "vitest";

const handleMock = vi.fn();
const accessMock = vi.fn();
const mkdirMock = vi.fn();
const readFileMock = vi.fn();
const writeFileMock = vi.fn();
const copyFileMock = vi.fn();
const readdirMock = vi.fn();
const unlinkMock = vi.fn();
const statMock = vi.fn();
const backupDatabaseMock = vi.fn();
const getDatabaseMock = vi.fn();

vi.mock("electron", () => ({
  ipcMain: {
    handle: handleMock,
  },
}));

vi.mock("node:fs/promises", () => ({
  default: {
    access: accessMock,
    mkdir: mkdirMock,
    readFile: readFileMock,
    writeFile: writeFileMock,
    copyFile: copyFileMock,
    readdir: readdirMock,
    unlink: unlinkMock,
    stat: statMock,
  },
}));

vi.mock("./database", () => ({
  backupDatabase: backupDatabaseMock,
  getDatabase: getDatabaseMock,
}));

describe("registerFilesystemIPC", () => {
  beforeEach(() => {
    vi.resetModules();
    handleMock.mockReset();
    accessMock.mockReset();
    mkdirMock.mockReset();
    readFileMock.mockReset();
    writeFileMock.mockReset();
    copyFileMock.mockReset();
    readdirMock.mockReset();
    unlinkMock.mockReset();
    statMock.mockReset();
    backupDatabaseMock.mockReset();
    getDatabaseMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("registers the paths handlers with validated joins for preload callers", async () => {
    const { registerFilesystemIPC } = await import("./filesystem");

    registerFilesystemIPC("/app/data");

    const appDataDirHandler = handleMock.mock.calls.find(([channel]) => channel === "paths:appDataDir")?.[1];
    const joinHandler = handleMock.mock.calls.find(([channel]) => channel === "paths:join")?.[1];

    expect(appDataDirHandler).toBeTypeOf("function");
    expect(joinHandler).toBeTypeOf("function");

    expect(appDataDirHandler({})).toBe("/app/data");
    expect(joinHandler({}, "images", "board-1", "thumb.png")).toMatch(
      /images.*board-1.*thumb\.png$/,
    );
    expect(() => joinHandler({}, "images", 99)).toThrow(
      "[IPC paths:join] Invalid payload: expected path segment 2 to be a string",
    );
  });

  it("returns false when fs:exists sees ENOENT or ENOTDIR", async () => {
    const { registerFilesystemIPC } = await import("./filesystem");

    registerFilesystemIPC("/app/data");

    const existsHandler = handleMock.mock.calls.find(([channel]) => channel === "fs:exists")?.[1];

    expect(existsHandler).toBeTypeOf("function");

    accessMock.mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" }));
    await expect(existsHandler({}, "/missing/file")).resolves.toEqual({
      ok: true,
      value: false,
    });

    accessMock.mockRejectedValueOnce(Object.assign(new Error("not a directory"), { code: "ENOTDIR" }));
    await expect(existsHandler({}, "/bad/path/file")).resolves.toEqual({
      ok: true,
      value: false,
    });
  });

  it("serializes permission and unexpected fs:exists errors instead of swallowing them", async () => {
    const { registerFilesystemIPC } = await import("./filesystem");

    registerFilesystemIPC("/app/data");

    const existsHandler = handleMock.mock.calls.find(([channel]) => channel === "fs:exists")?.[1];
    const permissionError = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const unexpectedError = Object.assign(new Error("i/o failure"), { code: "EIO" });

    accessMock.mockRejectedValueOnce(permissionError);
    await expect(existsHandler({}, "/private/file")).resolves.toEqual({
      ok: false,
      error: {
        code: "EACCES",
        message: "permission denied",
      },
    });

    accessMock.mockRejectedValueOnce(unexpectedError);
    await expect(existsHandler({}, "/broken/file")).resolves.toEqual({
      ok: false,
      error: {
        code: "EIO",
        message: "i/o failure",
      },
    });
  });

  it("rejects malformed file path payloads immediately with normalized contract errors", async () => {
    const { registerFilesystemIPC } = await import("./filesystem");

    registerFilesystemIPC("/app/data");

    const existsHandler = handleMock.mock.calls.find(([channel]) => channel === "fs:exists")?.[1];
    const mkdirHandler = handleMock.mock.calls.find(([channel]) => channel === "fs:mkdir")?.[1];
    const readFileHandler = handleMock.mock.calls.find(([channel]) => channel === "fs:readFile")?.[1];
    const readDirHandler = handleMock.mock.calls.find(([channel]) => channel === "fs:readDir")?.[1];
    const copyFileHandler = handleMock.mock.calls.find(([channel]) => channel === "fs:copyFile")?.[1];
    const removeHandler = handleMock.mock.calls.find(([channel]) => channel === "fs:remove")?.[1];

    await expect(existsHandler({}, 123)).rejects.toThrow(
      "[IPC fs:exists] Invalid payload: expected path to be a string",
    );
    await expect(mkdirHandler({}, 123)).rejects.toThrow(
      "[IPC fs:mkdir] Invalid payload: expected path to be a string",
    );
    await expect(readFileHandler({}, { path: "/tmp/file" })).rejects.toThrow(
      "[IPC fs:readFile] Invalid payload: expected path to be a string",
    );
    await expect(readDirHandler({}, null)).rejects.toThrow(
      "[IPC fs:readDir] Invalid payload: expected path to be a string",
    );
    await expect(copyFileHandler({}, "/tmp/a", false)).rejects.toThrow(
      "[IPC fs:copyFile] Invalid payload: expected destination path to be a string",
    );
    await expect(removeHandler({}, null)).rejects.toThrow(
      "[IPC fs:remove] Invalid payload: expected path to be a string",
    );

    expect(accessMock).not.toHaveBeenCalled();
    expect(mkdirMock).not.toHaveBeenCalled();
    expect(readFileMock).not.toHaveBeenCalled();
    expect(readdirMock).not.toHaveBeenCalled();
    expect(copyFileMock).not.toHaveBeenCalled();
    expect(unlinkMock).not.toHaveBeenCalled();
  });

  it("rejects malformed writeFile payloads immediately before calling fs.writeFile", async () => {
    const { registerFilesystemIPC } = await import("./filesystem");

    registerFilesystemIPC("/app/data");

    const writeFileHandler = handleMock.mock.calls.find(([channel]) => channel === "fs:writeFile")?.[1];

    await expect(writeFileHandler({}, 99, new Uint8Array())).rejects.toThrow(
      "[IPC fs:writeFile] Invalid payload: expected path to be a string",
    );
    await expect(writeFileHandler({}, "/tmp/file.bin", "not-bytes")).rejects.toThrow(
      "[IPC fs:writeFile] Invalid payload: expected data to be a Uint8Array",
    );

    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("reads dropped images with renderer-friendly metadata", async () => {
    const { registerFilesystemIPC } = await import("./filesystem");

    registerFilesystemIPC("/app/data");

    const droppedImageHandler = handleMock.mock.calls.find(
      ([channel]) => channel === "storage:read-dropped-image",
    )?.[1];

    readFileMock.mockResolvedValueOnce(Uint8Array.from([112, 110, 103]));

    await expect(droppedImageHandler({}, "/tmp/canvas/board.PNG")).resolves.toEqual({
      ok: true,
      value: {
        name: "board.PNG",
        mimeType: "image/png",
        data: Uint8Array.from([112, 110, 103]),
      },
    });
    expect(readFileMock).toHaveBeenCalledWith("/tmp/canvas/board.PNG");
  });

  it("reads remote images through the main process when given an http url", async () => {
    const { registerFilesystemIPC } = await import("./filesystem");

    registerFilesystemIPC("/app/data");

    const readRemoteImageHandler = handleMock.mock.calls.find(
      ([channel]) => channel === "storage:read-remote-image",
    )?.[1];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(Uint8Array.from([112, 110, 103]), {
        headers: { "content-type": "image/png" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(readRemoteImageHandler({}, "https://example.com/photo.png")).resolves.toEqual({
      ok: true,
      value: {
        name: "photo.png",
        mimeType: "image/png",
        data: Uint8Array.from([112, 110, 103]),
      },
    });
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/photo.png");
  });

  it("writes and reads board images beneath the images area using relative paths", async () => {
    const { registerFilesystemIPC } = await import("./filesystem");

    registerFilesystemIPC("/app/data");

    const writeBoardImageHandler = handleMock.mock.calls.find(
      ([channel]) => channel === "storage:write-board-image",
    )?.[1];
    const readBoardImageHandler = handleMock.mock.calls.find(
      ([channel]) => channel === "storage:read-board-image",
    )?.[1];

    writeFileMock.mockResolvedValueOnce(undefined);
    readFileMock.mockResolvedValueOnce(Uint8Array.from([9, 8, 7]));

    await expect(
      writeBoardImageHandler({}, "board-1", "file-1", "image/png", Uint8Array.from([1, 2, 3])),
    ).resolves.toEqual({
      ok: true,
      value: "images/board-1_file-1.png",
    });
    expect(writeFileMock).toHaveBeenCalledWith(
      "/app/data/images/board-1_file-1.png",
      Uint8Array.from([1, 2, 3]),
    );

    await expect(readBoardImageHandler({}, "images/board-1_file-1.png")).resolves.toEqual({
      ok: true,
      value: Uint8Array.from([9, 8, 7]),
    });
    expect(readFileMock).toHaveBeenCalledWith("/app/data/images/board-1_file-1.png");

    readFileMock.mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" }));
    await expect(readBoardImageHandler({}, "images/missing.png")).resolves.toEqual({
      ok: true,
      value: null,
    });
  });

  it("rejects board image traversal outside the images area before touching the filesystem", async () => {
    const { registerFilesystemIPC } = await import("./filesystem");

    registerFilesystemIPC("/app/data");

    const writeBoardImageHandler = handleMock.mock.calls.find(
      ([channel]) => channel === "storage:write-board-image",
    )?.[1];
    const readBoardImageHandler = handleMock.mock.calls.find(
      ([channel]) => channel === "storage:read-board-image",
    )?.[1];

    await expect(
      writeBoardImageHandler(
        {},
        "../escape",
        "file-1",
        "image/png",
        Uint8Array.from([1, 2, 3]),
      ),
    ).rejects.toThrow(
      "[IPC storage:write-board-image] Invalid payload: expected board image path to stay within app data",
    );
    await expect(readBoardImageHandler({}, "images/../escape.png")).rejects.toThrow(
      "[IPC storage:read-board-image] Invalid payload: expected board image path to stay within app data",
    );

    expect(readFileMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("creates backups, skips cleanup on skipped backup, and surfaces failure results", async () => {
    const { registerFilesystemIPC } = await import("./filesystem");

    registerFilesystemIPC("/app/data");

    const backupHandler = handleMock.mock.calls.find(
      ([channel]) => channel === "storage:run-daily-backup",
    )?.[1];

    getDatabaseMock.mockReturnValue({ database: true });
    backupDatabaseMock.mockResolvedValueOnce({
      status: "created",
      destinationPath: "/app/data/backups/phosphene-2026-04-19.db",
    });
    readdirMock.mockResolvedValueOnce([
      { name: "phosphene-2026-04-19.db", isFile: () => true },
      { name: "phosphene-2026-04-18.db", isFile: () => true },
      { name: "phosphene-2026-04-17.db", isFile: () => true },
      { name: "phosphene-2026-04-16.db", isFile: () => true },
      { name: "phosphene-2026-04-15.db", isFile: () => true },
      { name: "phosphene-2026-04-14.db", isFile: () => true },
      { name: "phosphene-2026-04-13.db", isFile: () => true },
      { name: "phosphene-2026-04-12.db", isFile: () => true },
    ]);

    await expect(backupHandler({}, undefined)).resolves.toEqual({
      ok: true,
      value: {
        status: "created",
        destinationPath: "/app/data/backups/phosphene-2026-04-19.db",
      },
    });
    expect(backupDatabaseMock).toHaveBeenCalledWith(
      { database: true },
      "/app/data/backups/phosphene-2026-04-19.db",
    );
    expect(readdirMock).toHaveBeenCalledWith("/app/data/backups", { withFileTypes: true });
    expect(unlinkMock).toHaveBeenCalledWith("/app/data/backups/phosphene-2026-04-12.db");

    backupDatabaseMock.mockResolvedValueOnce({
      status: "skipped",
      reason: "already-exists",
      destinationPath: "/app/data/backups/phosphene-2026-04-19.db",
    });
    readdirMock.mockClear();
    unlinkMock.mockClear();

    await expect(backupHandler({}, undefined)).resolves.toEqual({
      ok: true,
      value: {
        status: "skipped",
        reason: "already-exists",
        destinationPath: "/app/data/backups/phosphene-2026-04-19.db",
      },
    });
    expect(readdirMock).not.toHaveBeenCalled();
    expect(unlinkMock).not.toHaveBeenCalled();

    backupDatabaseMock.mockResolvedValueOnce({
      status: "failed",
      reason: "backup-failed",
      destinationPath: "/app/data/backups/phosphene-2026-04-19.db",
      message: "boom",
    });

    await expect(backupHandler({}, undefined)).resolves.toEqual({
      ok: true,
      value: {
        status: "failed",
        reason: "backup-failed",
        destinationPath: "/app/data/backups/phosphene-2026-04-19.db",
        message: "boom",
      },
    });
    expect(readdirMock).not.toHaveBeenCalled();
    expect(unlinkMock).not.toHaveBeenCalled();
  });
});
