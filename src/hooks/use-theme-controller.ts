import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_THEME_PREFERENCE,
  loadThemePreference,
  saveThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "../lib/theme-settings";
import { theme as desktopTheme } from "../platform/desktop-api";
import { useAppStore } from "../stores/app-store";

import { useErrorReporter } from "./use-error-reporter";

const DARK_MODE_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function getSystemResolvedTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }

  return window.matchMedia(DARK_MODE_MEDIA_QUERY).matches ? "dark" : "light";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") {
    return getSystemResolvedTheme();
  }

  return preference;
}

export function useThemeController() {
  const themePreference = useAppStore((state) => state.themePreference);
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const setThemePreference = useAppStore((state) => state.setThemePreference);
  const setResolvedTheme = useAppStore((state) => state.setResolvedTheme);
  const reportError = useErrorReporter("ThemeController");
  const userUpdateVersionRef = useRef(0);
  const skippedNativeSyncPreferenceRef = useRef<ThemePreference | null>(null);
  const [isThemePreferenceReadyForSync, setIsThemePreferenceReadyForSync] = useState(false);

  const applyThemePreference = useCallback(
    (
      nextPreference: ThemePreference,
      options: {
        skipNextNativeSync: boolean;
      } = { skipNextNativeSync: false },
    ) => {
      userUpdateVersionRef.current += 1;
      skippedNativeSyncPreferenceRef.current = options.skipNextNativeSync
        ? nextPreference
        : null;
      setIsThemePreferenceReadyForSync(true);
      setThemePreference(nextPreference);
      setResolvedTheme(resolveTheme(nextPreference));
    },
    [setResolvedTheme, setThemePreference],
  );

  const updateThemePreference = useCallback(
    async (nextPreference: ThemePreference) => {
      applyThemePreference(nextPreference);

      try {
        await saveThemePreference(nextPreference);
      } catch (error) {
        reportError("Failed to save theme preference", error);
      }
    },
    [applyThemePreference, reportError],
  );

  useEffect(() => {
    let cancelled = false;
    const hydrationVersion = userUpdateVersionRef.current;

    void (async () => {
      try {
        const persistedPreference = await loadThemePreference();

        if (cancelled || userUpdateVersionRef.current !== hydrationVersion) {
          return;
        }

        setThemePreference(persistedPreference);
        setIsThemePreferenceReadyForSync(true);
      } catch (error) {
        if (cancelled || userUpdateVersionRef.current !== hydrationVersion) {
          return;
        }

        reportError("Failed to load theme preference", error);
        setThemePreference(DEFAULT_THEME_PREFERENCE);
        setIsThemePreferenceReadyForSync(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reportError, setThemePreference]);

  useEffect(() => {
    setResolvedTheme(resolveTheme(themePreference));
  }, [setResolvedTheme, themePreference]);

  useEffect(() => {
    if (!isThemePreferenceReadyForSync) {
      return;
    }

    if (skippedNativeSyncPreferenceRef.current === themePreference) {
      return;
    }

    try {
      void Promise.resolve(desktopTheme.setPreference(themePreference)).catch((error) => {
        reportError("Failed to sync theme preference to the native menu", error);
      });
    } catch {
      return;
    }
  }, [isThemePreferenceReadyForSync, reportError, themePreference]);

  useEffect(() => {
    try {
      return desktopTheme.onPreferenceSelected((preference) => {
        applyThemePreference(preference, { skipNextNativeSync: true });
      });
    } catch {
      return;
    }
  }, [applyThemePreference]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQueryList = window.matchMedia(DARK_MODE_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      if (useAppStore.getState().themePreference !== "system") {
        return;
      }

      setResolvedTheme(event.matches ? "dark" : "light");
    };

    mediaQueryList.addEventListener("change", handleChange);

    return () => {
      mediaQueryList.removeEventListener("change", handleChange);
    };
  }, [setResolvedTheme]);

  return {
    themePreference,
    resolvedTheme,
    updateThemePreference,
  };
}
