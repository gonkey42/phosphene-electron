import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_THEME_PREFERENCE } from "../lib/theme-settings";
import { useAppStore } from "../stores/app-store";

const {
  loadThemePreferenceMock,
  saveThemePreferenceMock,
  reportErrorMock,
  themeSetPreferenceMock,
  themeOnPreferenceSelectedMock,
} = vi.hoisted(() => ({
  loadThemePreferenceMock: vi.fn(),
  saveThemePreferenceMock: vi.fn(),
  reportErrorMock: vi.fn(),
  themeSetPreferenceMock: vi.fn(),
  themeOnPreferenceSelectedMock: vi.fn(),
}));

vi.mock("../lib/theme-settings", async () => {
  const actual = await vi.importActual<typeof import("../lib/theme-settings")>(
    "../lib/theme-settings",
  );

  return {
    ...actual,
    loadThemePreference: loadThemePreferenceMock,
    saveThemePreference: saveThemePreferenceMock,
  };
});

vi.mock("./use-error-reporter", () => ({
  useErrorReporter: () => reportErrorMock,
}));

vi.mock("../platform/desktop-api", () => ({
  theme: {
    setPreference: themeSetPreferenceMock,
    onPreferenceSelected: themeOnPreferenceSelectedMock,
  },
}));

import { useThemeController } from "./use-theme-controller";

type MatchMediaListener = EventListenerOrEventListenerObject;

function isMatchMediaChangeListener(listener: MatchMediaListener): listener is EventListener {
  return typeof listener === "function";
}

function createMatchMediaController(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<EventListener>();

  const mediaQueryList: MediaQueryList = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: MatchMediaListener) => {
      if (isMatchMediaChangeListener(listener)) {
        listeners.add(listener);
      }
    }),
    removeEventListener: vi.fn((_type: string, listener: MatchMediaListener) => {
      if (isMatchMediaChangeListener(listener)) {
        listeners.delete(listener);
      }
    }),
    addListener: vi.fn((listener: ((this: MediaQueryList, ev: MediaQueryListEvent) => any) | null) => {
      if (listener) {
        listeners.add(listener as EventListener);
      }
    }),
    removeListener: vi.fn(
      (listener: ((this: MediaQueryList, ev: MediaQueryListEvent) => any) | null) => {
        if (listener) {
          listeners.delete(listener as EventListener);
        }
      },
    ),
    dispatchEvent: vi.fn(),
  };

  const matchMedia = vi.fn((query: string): MediaQueryList => {
    expect(query).toBe("(prefers-color-scheme: dark)");
    return mediaQueryList;
  });

  return {
    matchMedia,
    mediaQueryList,
    emitChange(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches: nextMatches, media: mediaQueryList.media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener.call(mediaQueryList, event));
    },
  };
}

describe("useThemeController", () => {
  beforeEach(() => {
    loadThemePreferenceMock.mockReset();
    saveThemePreferenceMock.mockReset();
    reportErrorMock.mockReset();
    themeSetPreferenceMock.mockReset();
    themeOnPreferenceSelectedMock.mockReset();
    useAppStore.setState({
      themePreference: DEFAULT_THEME_PREFERENCE,
      resolvedTheme: "light",
    });
  });

  it("does not sync the placeholder default preference to the native menu before hydration settles", async () => {
    const matchMediaController = createMatchMediaController(true);
    let resolveThemePreferenceLoad: ((value: "dark") => void) | undefined;
    window.matchMedia = matchMediaController.matchMedia;
    loadThemePreferenceMock.mockReturnValue(
      new Promise((resolve: (value: "dark") => void) => {
        resolveThemePreferenceLoad = resolve;
      }),
    );

    renderHook(() => useThemeController());

    await act(async () => {
      await Promise.resolve();
    });

    expect(themeSetPreferenceMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveThemePreferenceLoad?.("dark");
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(themeSetPreferenceMock).toHaveBeenCalledWith("dark");
    });
  });

  it("syncs a newer user-selected preference before hydration resolves without replaying the placeholder default", async () => {
    const matchMediaController = createMatchMediaController(true);
    let resolveThemePreferenceLoad: ((value: "system") => void) | undefined;
    window.matchMedia = matchMediaController.matchMedia;
    loadThemePreferenceMock.mockReturnValue(
      new Promise((resolve: (value: "system") => void) => {
        resolveThemePreferenceLoad = resolve;
      }),
    );
    saveThemePreferenceMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useThemeController());

    await act(async () => {
      await Promise.resolve();
    });

    themeSetPreferenceMock.mockClear();

    await act(async () => {
      await result.current.updateThemePreference("light");
    });

    expect(themeSetPreferenceMock).toHaveBeenCalledWith("light");
    expect(themeSetPreferenceMock.mock.calls.map(([preference]) => preference)).not.toContain(
      "system",
    );

    await act(async () => {
      resolveThemePreferenceLoad?.("system");
      await Promise.resolve();
    });

    expect(themeSetPreferenceMock).toHaveBeenLastCalledWith("light");
    expect(themeSetPreferenceMock.mock.calls.map(([preference]) => preference)).not.toContain(
      "system",
    );
  });

  it("resolves a system preference against the current OS color scheme", async () => {
    const matchMediaController = createMatchMediaController(true);
    window.matchMedia = matchMediaController.matchMedia;
    loadThemePreferenceMock.mockResolvedValue("system");

    const { result } = renderHook(() => useThemeController());

    await waitFor(() => {
      expect(result.current.themePreference).toBe("system");
      expect(result.current.resolvedTheme).toBe("dark");
    });
  });

  it("updates the resolved theme when the system color scheme changes while preference stays system", async () => {
    const matchMediaController = createMatchMediaController(false);
    window.matchMedia = matchMediaController.matchMedia;
    loadThemePreferenceMock.mockResolvedValue("system");

    const { result } = renderHook(() => useThemeController());

    await waitFor(() => {
      expect(result.current.resolvedTheme).toBe("light");
    });

    act(() => {
      matchMediaController.emitChange(true);
    });

    await waitFor(() => {
      expect(useAppStore.getState().themePreference).toBe("system");
      expect(result.current.themePreference).toBe("system");
      expect(useAppStore.getState().resolvedTheme).toBe("dark");
      expect(result.current.resolvedTheme).toBe("dark");
    });
  });

  it("persists direct preference changes and resolves them immediately", async () => {
    const matchMediaController = createMatchMediaController(true);
    window.matchMedia = matchMediaController.matchMedia;
    loadThemePreferenceMock.mockResolvedValue("system");
    saveThemePreferenceMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useThemeController());

    await waitFor(() => {
      expect(result.current.resolvedTheme).toBe("dark");
    });

    await act(async () => {
      await result.current.updateThemePreference("light");
    });

    expect(saveThemePreferenceMock).toHaveBeenCalledWith("light");
    expect(result.current.themePreference).toBe("light");
    expect(result.current.resolvedTheme).toBe("light");
  });

  it("falls back to the default preference and reports load failures", async () => {
    const matchMediaController = createMatchMediaController(false);
    const loadError = new Error("theme load failed");
    window.matchMedia = matchMediaController.matchMedia;
    loadThemePreferenceMock.mockRejectedValue(loadError);

    const { result } = renderHook(() => useThemeController());

    await waitFor(() => {
      expect(result.current.themePreference).toBe(DEFAULT_THEME_PREFERENCE);
      expect(result.current.resolvedTheme).toBe("light");
    });

    expect(reportErrorMock).toHaveBeenCalledWith("Failed to load theme preference", loadError);
  });

  it("reports save failures without discarding the updated preference", async () => {
    const matchMediaController = createMatchMediaController(true);
    const saveError = new Error("theme save failed");
    window.matchMedia = matchMediaController.matchMedia;
    loadThemePreferenceMock.mockResolvedValue("system");
    saveThemePreferenceMock.mockRejectedValue(saveError);

    const { result } = renderHook(() => useThemeController());

    await waitFor(() => {
      expect(result.current.resolvedTheme).toBe("dark");
    });

    await act(async () => {
      await result.current.updateThemePreference("light");
    });

    expect(result.current.themePreference).toBe("light");
    expect(result.current.resolvedTheme).toBe("light");
    expect(reportErrorMock).toHaveBeenCalledWith("Failed to save theme preference", saveError);
  });

  it("does not let late hydration overwrite a newer user-selected preference", async () => {
    const matchMediaController = createMatchMediaController(true);
    let resolveThemePreferenceLoad: ((value: "system") => void) | undefined;
    window.matchMedia = matchMediaController.matchMedia;
    loadThemePreferenceMock.mockReturnValue(
      new Promise((resolve: (value: "system") => void) => {
        resolveThemePreferenceLoad = resolve;
      }),
    );
    saveThemePreferenceMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useThemeController());

    await act(async () => {
      await result.current.updateThemePreference("light");
    });

    expect(result.current.themePreference).toBe("light");
    expect(result.current.resolvedTheme).toBe("light");

    await act(async () => {
      resolveThemePreferenceLoad?.("system");
      await Promise.resolve();
    });

    expect(result.current.themePreference).toBe("light");
    expect(result.current.resolvedTheme).toBe("light");
    expect(useAppStore.getState().themePreference).toBe("light");
    expect(useAppStore.getState().resolvedTheme).toBe("light");
  });

  it("syncs preference changes to the native theme bridge and listens for menu selections", async () => {
    const matchMediaController = createMatchMediaController(true);
    let selectedCallback: ((preference: "system" | "light" | "dark") => void) | undefined;
    window.matchMedia = matchMediaController.matchMedia;
    loadThemePreferenceMock.mockResolvedValue("system");
    saveThemePreferenceMock.mockResolvedValue(undefined);
    themeOnPreferenceSelectedMock.mockImplementation((callback) => {
      selectedCallback = callback;
      return () => {
        selectedCallback = undefined;
      };
    });

    const { result } = renderHook(() => useThemeController());

    await waitFor(() => {
      expect(result.current.themePreference).toBe("system");
      expect(themeSetPreferenceMock).toHaveBeenCalledWith("system");
      expect(themeOnPreferenceSelectedMock).toHaveBeenCalledWith(expect.any(Function));
    });

    await act(async () => {
      selectedCallback?.("dark");
      await Promise.resolve();
    });

    expect(result.current.themePreference).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(saveThemePreferenceMock).toHaveBeenCalledWith("dark");
    expect(themeSetPreferenceMock).toHaveBeenLastCalledWith("dark");
  });
});
