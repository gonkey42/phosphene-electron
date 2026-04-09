import { beforeEach, describe, expect, it, vi } from "vitest";

const existsMock = vi.fn();
const mkdirMock = vi.fn();
const readDirMock = vi.fn();
const removeMock = vi.fn();
const appDataDirMock = vi.fn();
const joinMock = vi.fn();
const backupMock = vi.fn();
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("../platform/desktop-api", () => ({
  db: {
    backup: backupMock,
  },
  fs: {
    exists: existsMock,
    mkdir: mkdirMock,
    readDir: readDirMock,
    remove: removeMock,
  },
  paths: {
    appDataDir: appDataDirMock,
    join: joinMock,
  },
}));

describe("runDailyBackup", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-30T12:00:00.000Z"));
    existsMock.mockReset();
    mkdirMock.mockReset();
    readDirMock.mockReset();
    removeMock.mockReset();
    appDataDirMock.mockReset();
    joinMock.mockReset();
    backupMock.mockReset();
    errorSpy.mockClear();

    appDataDirMock.mockResolvedValue("/app/data");
    joinMock.mockImplementation(async (...parts: string[]) => parts.join("/"));
    readDirMock.mockResolvedValue([]);
    backupMock.mockResolvedValue({
      status: "created",
      destinationPath: "/app/data/backups/phosphene-2026-03-30.db",
    });
  });

  it("creates a dated backup through the database IPC when today's backup does not exist yet", async () => {
    existsMock.mockImplementation(async (path: string) => {
      if (path === "/app/data/backups") return false;
      return false;
    });

    const { runDailyBackup } = await import("./backup");
    await runDailyBackup();

    expect(mkdirMock).toHaveBeenCalledWith("/app/data/backups");
    expect(backupMock).toHaveBeenCalledWith(
      "/app/data/backups/phosphene-2026-03-30.db",
    );
  });

  it("skips cleanup when the database IPC reports today's backup already exists", async () => {
    existsMock.mockImplementation(async (path: string) => {
      if (path === "/app/data/backups") return true;
      return false;
    });
    backupMock.mockResolvedValue({
      status: "skipped",
      reason: "already-exists",
      destinationPath: "/app/data/backups/phosphene-2026-03-30.db",
    });

    const { runDailyBackup } = await import("./backup");
    await runDailyBackup();

    expect(mkdirMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("removes the oldest backup once more than seven dated backups exist", async () => {
    existsMock.mockImplementation(async (path: string) => {
      if (path === "/app/data/backups") return true;
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

  it("logs the precise backup failure cause returned from the main process", async () => {
    existsMock.mockResolvedValue(true);
    backupMock.mockResolvedValue({
      status: "failed",
      reason: "permission-denied",
      destinationPath: "/app/data/backups/phosphene-2026-03-30.db",
      message: "permission denied",
    });

    const { runDailyBackup } = await import("./backup");
    await runDailyBackup();

    expect(errorSpy).toHaveBeenCalledWith("Failed to create database backup:", {
      status: "failed",
      reason: "permission-denied",
      destinationPath: "/app/data/backups/phosphene-2026-03-30.db",
      message: "permission denied",
    });
    expect(removeMock).not.toHaveBeenCalled();
  });
});
