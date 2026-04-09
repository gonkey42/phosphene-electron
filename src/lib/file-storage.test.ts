import { beforeEach, describe, expect, it, vi } from "vitest";

const existsMock = vi.fn();
const mkdirMock = vi.fn();
const appDataDirMock = vi.fn();
const joinMock = vi.fn();
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("../platform/desktop-api", () => ({
  fs: {
    exists: existsMock,
    mkdir: mkdirMock,
  },
  paths: {
    appDataDir: appDataDirMock,
    join: joinMock,
  },
}));

describe("file storage helpers", () => {
  beforeEach(() => {
    existsMock.mockReset();
    mkdirMock.mockReset();
    appDataDirMock.mockReset();
    joinMock.mockReset();
    errorSpy.mockClear();
  });

  it("creates images and captures directories when they are missing", async () => {
    appDataDirMock.mockResolvedValue("/app/data");
    joinMock.mockResolvedValueOnce("/app/data/images").mockResolvedValueOnce("/app/data/captures");
    existsMock.mockResolvedValue(false);

    const { ensureStorageDirectories } = await import("./file-storage");
    await ensureStorageDirectories();

    expect(mkdirMock).toHaveBeenCalledWith("/app/data/images");
    expect(mkdirMock).toHaveBeenCalledWith("/app/data/captures");
  });

  it("rethrows inaccessible directory checks instead of treating them as missing", async () => {
    const permissionError = Object.assign(new Error("permission denied"), { code: "EACCES" });

    appDataDirMock.mockResolvedValue("/app/data");
    joinMock.mockResolvedValueOnce("/app/data/images").mockResolvedValueOnce("/app/data/captures");
    existsMock.mockRejectedValue(permissionError);

    const { ensureStorageDirectories } = await import("./file-storage");

    await expect(ensureStorageDirectories()).rejects.toBe(permissionError);
    expect(mkdirMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith("Storage path is inaccessible:", {
      path: "/app/data/images",
      code: "EACCES",
      message: "permission denied",
    });
  });

  it("returns the expected application storage locations", async () => {
    appDataDirMock.mockResolvedValue("/app/data");
    joinMock.mockResolvedValueOnce("/app/data/images").mockResolvedValueOnce("/app/data/captures");

    const { getImagesDir, getCapturesDir } = await import("./file-storage");

    await expect(getImagesDir()).resolves.toBe("/app/data/images");
    await expect(getCapturesDir()).resolves.toBe("/app/data/captures");
  });
});
