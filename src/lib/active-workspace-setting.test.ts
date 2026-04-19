import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.fn();
const selectMock = vi.fn();
const getDbMock = vi.fn();

vi.mock("./database", () => ({
  getDb: getDbMock,
}));

describe("active workspace setting", () => {
  beforeEach(() => {
    vi.resetModules();
    executeMock.mockReset();
    selectMock.mockReset();
    getDbMock.mockReset();
    getDbMock.mockResolvedValue({ execute: executeMock, select: selectMock });
    executeMock.mockResolvedValue({ rowsAffected: 1 });
  });

  it("returns null when there is no persisted active workspace", async () => {
    selectMock.mockResolvedValueOnce([]);

    const { loadActiveWorkspaceId } = await import("./active-workspace-setting");

    await expect(loadActiveWorkspaceId()).resolves.toBeNull();
    expect(selectMock).toHaveBeenCalledWith(
      "SELECT value FROM settings WHERE key = $1 LIMIT 1",
      ["active_workspace_id"],
    );
  });

  it("returns the persisted active workspace id", async () => {
    selectMock.mockResolvedValueOnce([{ value: "workspace-2" }]);

    const { loadActiveWorkspaceId } = await import("./active-workspace-setting");

    await expect(loadActiveWorkspaceId()).resolves.toBe("workspace-2");
  });

  it("persists the active workspace id with a settings upsert", async () => {
    const { saveActiveWorkspaceId } = await import("./active-workspace-setting");

    await saveActiveWorkspaceId("workspace-2");

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO settings"),
      ["active_workspace_id", "workspace-2"],
    );
  });
});
