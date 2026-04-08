import { beforeEach, describe, expect, it, vi } from "vitest";

const existsMock = vi.fn();
const mkdirMock = vi.fn();
const readDirMock = vi.fn();
const copyFileMock = vi.fn();
const removeMock = vi.fn();
const appDataDirMock = vi.fn();
const joinMock = vi.fn();

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: existsMock,
  mkdir: mkdirMock,
  readDir: readDirMock,
  copyFile: copyFileMock,
  remove: removeMock,
}));

vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: appDataDirMock,
  join: joinMock,
}));

describe("runDailyBackup", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-30T12:00:00.000Z"));
    existsMock.mockReset();
    mkdirMock.mockReset();
    readDirMock.mockReset();
    copyFileMock.mockReset();
    removeMock.mockReset();
    appDataDirMock.mockReset();
    joinMock.mockReset();

    appDataDirMock.mockResolvedValue("/app/data");
    joinMock.mockImplementation(async (...parts: string[]) => parts.join("/"));
    readDirMock.mockResolvedValue([]);
  });

  it("creates a dated backup when today's backup does not exist yet", async () => {
    existsMock.mockImplementation(async (path: string) => {
      if (path === "/app/data/backups") {
        return false;
      }

      if (path === "/app/data/backups/phosphene-2026-03-30.db") {
        return false;
      }

      if (path === "/app/data/phosphene.db") {
        return true;
      }

      return false;
    });

    const { runDailyBackup } = await import("./backup");
    await runDailyBackup();

    expect(mkdirMock).toHaveBeenCalledWith("/app/data/backups", {
      recursive: true,
    });
    expect(copyFileMock).toHaveBeenCalledWith(
      "/app/data/phosphene.db",
      "/app/data/backups/phosphene-2026-03-30.db",
    );
  });

  it("skips copying when today's backup already exists", async () => {
    existsMock.mockImplementation(async (path: string) => {
      if (path === "/app/data/backups") {
        return true;
      }

      if (path === "/app/data/backups/phosphene-2026-03-30.db") {
        return true;
      }

      if (path === "/app/data/phosphene.db") {
        return true;
      }

      return false;
    });

    const { runDailyBackup } = await import("./backup");
    await runDailyBackup();

    expect(mkdirMock).not.toHaveBeenCalled();
    expect(copyFileMock).not.toHaveBeenCalled();
  });

  it("removes the oldest backup once more than seven dated backups exist", async () => {
    existsMock.mockImplementation(async (path: string) => {
      if (path === "/app/data/backups") {
        return true;
      }

      if (path === "/app/data/backups/phosphene-2026-03-30.db") {
        return false;
      }

      if (path === "/app/data/phosphene.db") {
        return true;
      }

      return false;
    });
    readDirMock.mockResolvedValue([
      { name: "phosphene-2026-03-30.db" },
      { name: "phosphene-2026-03-29.db" },
      { name: "phosphene-2026-03-28.db" },
      { name: "phosphene-2026-03-27.db" },
      { name: "phosphene-2026-03-26.db" },
      { name: "phosphene-2026-03-25.db" },
      { name: "phosphene-2026-03-24.db" },
      { name: "phosphene-2026-03-23.db" },
    ]);

    const { runDailyBackup } = await import("./backup");
    await runDailyBackup();

    expect(removeMock).toHaveBeenCalledWith("/app/data/backups/phosphene-2026-03-23.db");
  });
});
