import { beforeEach, describe, expect, it, vi } from "vitest";

const storageRunDailyBackupMock = vi.fn();
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("../platform/desktop-api", () => ({
  storage: {
    runDailyBackup: storageRunDailyBackupMock,
  },
}));

describe("runDailyBackup", () => {
  beforeEach(() => {
    vi.resetModules();
    storageRunDailyBackupMock.mockReset();
    errorSpy.mockClear();
  });

  it("delegates backup orchestration to the storage bridge", async () => {
    storageRunDailyBackupMock.mockResolvedValue({
      status: "created",
      destinationPath: "/app/data/backups/phosphene-2026-03-30.db",
    });

    const { runDailyBackup } = await import("./backup");
    await expect(runDailyBackup()).resolves.toBeUndefined();

    expect(storageRunDailyBackupMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("rethrows when the storage bridge rejects", async () => {
    storageRunDailyBackupMock.mockRejectedValue(new Error("disk full"));

    const { runDailyBackup } = await import("./backup");

    await expect(runDailyBackup()).rejects.toThrow("disk full");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("rethrows a failed storage result so callers can handle it", async () => {
    storageRunDailyBackupMock.mockResolvedValue({
      status: "failed",
      reason: "backup-failed",
      destinationPath: "/app/data/backups/phosphene-2026-03-30.db",
      message: "permission denied",
    });

    const { runDailyBackup } = await import("./backup");

    await expect(runDailyBackup()).rejects.toMatchObject({
      status: "failed",
      reason: "backup-failed",
      destinationPath: "/app/data/backups/phosphene-2026-03-30.db",
      message: "permission denied",
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
