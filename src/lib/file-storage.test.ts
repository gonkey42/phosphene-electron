import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureDirectoriesMock = vi.fn();
const existsMock = vi.fn();
const mkdirMock = vi.fn();
const appDataDirMock = vi.fn();
const joinMock = vi.fn();

vi.mock("../platform/desktop-api", () => ({
  storage: {
    ensureDirectories: ensureDirectoriesMock,
  },
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
    ensureDirectoriesMock.mockReset();
    existsMock.mockReset();
    mkdirMock.mockReset();
    appDataDirMock.mockReset();
    joinMock.mockReset();
  });

  it("delegates directory setup to the storage bridge instead of raw fs and paths", async () => {
    appDataDirMock.mockResolvedValue("/app/data");
    joinMock.mockResolvedValueOnce("/app/data/images").mockResolvedValueOnce("/app/data/captures");
    existsMock.mockResolvedValue(false);
    ensureDirectoriesMock.mockResolvedValue(undefined);

    const { ensureStorageDirectories } = await import("./file-storage");
    await ensureStorageDirectories();

    expect(ensureDirectoriesMock).toHaveBeenCalledTimes(1);
    expect(appDataDirMock).not.toHaveBeenCalled();
    expect(mkdirMock).not.toHaveBeenCalled();
  });
});
