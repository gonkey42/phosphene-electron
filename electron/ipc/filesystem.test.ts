import { beforeEach, describe, expect, it, vi } from "vitest";

const handleMock = vi.fn();
const accessMock = vi.fn();
const mkdirMock = vi.fn();
const readFileMock = vi.fn();
const writeFileMock = vi.fn();
const copyFileMock = vi.fn();
const readdirMock = vi.fn();
const unlinkMock = vi.fn();

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
  },
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
});
