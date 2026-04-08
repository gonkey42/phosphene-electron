import { beforeEach, describe, expect, it, vi } from "vitest";

const existsMock = vi.fn();
const mkdirMock = vi.fn();
const appDataDirMock = vi.fn();
const joinMock = vi.fn();

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

  it("returns the expected application storage locations", async () => {
    appDataDirMock.mockResolvedValue("/app/data");
    joinMock.mockResolvedValueOnce("/app/data/images").mockResolvedValueOnce("/app/data/captures");

    const { getImagesDir, getCapturesDir } = await import("./file-storage");

    await expect(getImagesDir()).resolves.toBe("/app/data/images");
    await expect(getCapturesDir()).resolves.toBe("/app/data/captures");
  });
});
