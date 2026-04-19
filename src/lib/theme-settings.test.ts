import { beforeEach, describe, expect, it, vi } from "vitest";

const getPreferenceMock = vi.fn();
const setPreferenceMock = vi.fn();

vi.mock("../platform/desktop-api", () => ({
  theme: {
    getPreference: getPreferenceMock,
    setPreference: setPreferenceMock,
  },
}));

describe("theme settings persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    getPreferenceMock.mockReset();
    setPreferenceMock.mockReset();
  });

  it("falls back to the default preference when no persisted row exists", async () => {
    getPreferenceMock.mockResolvedValueOnce(null);

    const { DEFAULT_THEME_PREFERENCE, loadThemePreference } = await import("./theme-settings");

    await expect(loadThemePreference()).resolves.toBe(DEFAULT_THEME_PREFERENCE);
    expect(getPreferenceMock).toHaveBeenCalledTimes(1);
  });

  it("returns stored light, dark, and system preferences", async () => {
    getPreferenceMock.mockResolvedValueOnce("light");
    getPreferenceMock.mockResolvedValueOnce("dark");
    getPreferenceMock.mockResolvedValueOnce("system");

    const { loadThemePreference } = await import("./theme-settings");

    await expect(loadThemePreference()).resolves.toBe("light");
    await expect(loadThemePreference()).resolves.toBe("dark");
    await expect(loadThemePreference()).resolves.toBe("system");
  });

  it("falls back to the default preference when the stored value is invalid", async () => {
    getPreferenceMock.mockResolvedValueOnce("sepia" as never);

    const { DEFAULT_THEME_PREFERENCE, loadThemePreference } = await import("./theme-settings");

    await expect(loadThemePreference()).resolves.toBe(DEFAULT_THEME_PREFERENCE);
  });

  it("persists a light preference with the theme bridge", async () => {
    const { saveThemePreference } = await import("./theme-settings");

    await saveThemePreference("light");

    expect(setPreferenceMock).toHaveBeenCalledTimes(1);
    expect(setPreferenceMock).toHaveBeenCalledWith("light");
  });
});
