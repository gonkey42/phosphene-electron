import { getDb } from "./database";
import { DEFAULT_THEME_PREFERENCE } from "./theme-types";
import type { ResolvedTheme, ThemePreference } from "./theme-types";

export { DEFAULT_THEME_PREFERENCE };
export type { ResolvedTheme, ThemePreference };

const THEME_PREFERENCE_KEY = "theme_preference";
const THEME_PREFERENCES: ReadonlySet<ThemePreference> = new Set([
  "system",
  "light",
  "dark",
]);

function isThemePreference(value: string): value is ThemePreference {
  return THEME_PREFERENCES.has(value as ThemePreference);
}

export async function loadThemePreference(): Promise<ThemePreference> {
  const db = await getDb();
  const rows = await db.select<Array<{ value: string }>>(
    "SELECT value FROM settings WHERE key = $1 LIMIT 1",
    [THEME_PREFERENCE_KEY],
  );

  const storedValue = rows[0]?.value;
  if (!storedValue || !isThemePreference(storedValue)) {
    return DEFAULT_THEME_PREFERENCE;
  }

  return storedValue;
}

export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  const db = await getDb();
  await db.execute(
    `
    INSERT INTO settings (key, value, updated_at)
    VALUES ($1, $2, datetime('now','utc'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now','utc')
    `,
    [THEME_PREFERENCE_KEY, preference],
  );
}
