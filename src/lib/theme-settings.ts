import { DEFAULT_THEME_PREFERENCE } from "./theme-types";
import type { ResolvedTheme, ThemePreference } from "./theme-types";
import { theme } from "../platform/desktop-api";

export { DEFAULT_THEME_PREFERENCE };
export type { ResolvedTheme, ThemePreference };

const THEME_PREFERENCES: ReadonlySet<ThemePreference> = new Set([
  "system",
  "light",
  "dark",
]);

function isThemePreference(value: string): value is ThemePreference {
  return THEME_PREFERENCES.has(value as ThemePreference);
}

export async function loadThemePreference(): Promise<ThemePreference> {
  const storedValue = await theme.getPreference();
  if (!storedValue || !isThemePreference(storedValue)) {
    return DEFAULT_THEME_PREFERENCE;
  }

  return storedValue;
}

export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  await theme.setPreference(preference);
}
