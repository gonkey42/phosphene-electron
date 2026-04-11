import { DEFAULT_THEME_PREFERENCE, type ThemePreference } from "../src/lib/theme-types";
import { getDatabase } from "./ipc/database";

const THEME_PREFERENCE_KEY = "theme_preference";
const VALID_THEME_PREFERENCES: ReadonlySet<ThemePreference> = new Set([
  "system",
  "light",
  "dark",
]);
const SELECT_THEME_PREFERENCE_SQL = "SELECT value FROM settings WHERE key = ? LIMIT 1";
const UPSERT_THEME_PREFERENCE_SQL = `
  INSERT INTO settings (key, value, updated_at)
  VALUES (?, ?, datetime('now','utc'))
  ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = datetime('now','utc')
`;

function isThemePreference(value: string): value is ThemePreference {
  return VALID_THEME_PREFERENCES.has(value as ThemePreference);
}

export function loadPersistedThemePreference(userDataPath: string): ThemePreference {
  const database = getDatabase(userDataPath);
  const row = database
    .prepare(SELECT_THEME_PREFERENCE_SQL)
    .get(THEME_PREFERENCE_KEY) as { value?: string } | undefined;
  const storedValue = row?.value;

  if (!storedValue || !isThemePreference(storedValue)) {
    return DEFAULT_THEME_PREFERENCE;
  }

  return storedValue;
}

export function persistThemePreference(userDataPath: string, preference: ThemePreference): void {
  const database = getDatabase(userDataPath);

  database.prepare(UPSERT_THEME_PREFERENCE_SQL).run(THEME_PREFERENCE_KEY, preference);
}
