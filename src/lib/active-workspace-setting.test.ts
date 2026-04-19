import { beforeEach, describe, expect, it, vi } from "vitest";

const getActiveWorkspaceIdMock = vi.fn();
const setActiveWorkspaceIdMock = vi.fn();

vi.mock("../platform/desktop-api", () => ({
  settings: {
    getActiveWorkspaceId: getActiveWorkspaceIdMock,
    setActiveWorkspaceId: setActiveWorkspaceIdMock,
  },
}));

describe("active workspace setting", () => {
  beforeEach(() => {
    vi.resetModules();
    getActiveWorkspaceIdMock.mockReset();
    setActiveWorkspaceIdMock.mockReset();
  });

  it("returns null when there is no persisted active workspace", async () => {
    getActiveWorkspaceIdMock.mockResolvedValueOnce(null);

    const { loadActiveWorkspaceId } = await import("./active-workspace-setting");

    await expect(loadActiveWorkspaceId()).resolves.toBeNull();
    expect(getActiveWorkspaceIdMock).toHaveBeenCalledTimes(1);
  });

  it("returns the persisted active workspace id", async () => {
    getActiveWorkspaceIdMock.mockResolvedValueOnce("workspace-2");

    const { loadActiveWorkspaceId } = await import("./active-workspace-setting");

    await expect(loadActiveWorkspaceId()).resolves.toBe("workspace-2");
  });

  it("persists the active workspace id with the settings bridge", async () => {
    const { saveActiveWorkspaceId } = await import("./active-workspace-setting");

    await saveActiveWorkspaceId("workspace-2");

    expect(setActiveWorkspaceIdMock).toHaveBeenCalledTimes(1);
    expect(setActiveWorkspaceIdMock).toHaveBeenCalledWith("workspace-2");
  });
});
