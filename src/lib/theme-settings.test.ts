import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.fn();
const selectMock = vi.fn();
const loadMock = vi.fn();

vi.mock("./database", () => ({
  getDb: loadMock,
}));

describe("theme settings persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    executeMock.mockReset();
    selectMock.mockReset();
    loadMock.mockReset();
    loadMock.mockResolvedValue({ execute: executeMock, select: selectMock });
    executeMock.mockResolvedValue({ rowsAffected: 1 });
  });

  it("falls back to the default preference when no persisted row exists", async () => {
    selectMock.mockResolvedValueOnce([]);

    const { DEFAULT_THEME_PREFERENCE, loadThemePreference } = await import("./theme-settings");

    await expect(loadThemePreference()).resolves.toBe(DEFAULT_THEME_PREFERENCE);
    expect(selectMock).toHaveBeenCalledWith(
      "SELECT value FROM settings WHERE key = $1 LIMIT 1",
      ["theme_preference"],
    );
  });

  it("returns stored light, dark, and system preferences", async () => {
    selectMock.mockResolvedValueOnce([{ value: "light" }]);
    selectMock.mockResolvedValueOnce([{ value: "dark" }]);
    selectMock.mockResolvedValueOnce([{ value: "system" }]);

    const { loadThemePreference } = await import("./theme-settings");

    await expect(loadThemePreference()).resolves.toBe("light");
    await expect(loadThemePreference()).resolves.toBe("dark");
    await expect(loadThemePreference()).resolves.toBe("system");
  });

  it("falls back to the default preference when the stored value is invalid", async () => {
    selectMock.mockResolvedValueOnce([{ value: "sepia" }]);

    const { DEFAULT_THEME_PREFERENCE, loadThemePreference } = await import("./theme-settings");

    await expect(loadThemePreference()).resolves.toBe(DEFAULT_THEME_PREFERENCE);
  });

  it("persists a light preference with a single settings upsert", async () => {
    const { saveThemePreference } = await import("./theme-settings");

    await saveThemePreference("light");

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO settings"),
      ["theme_preference", "light"],
    );
  });
});
