import type { ThemePreference } from "../../lib/theme-settings";

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export interface WorkspaceThemeModeSelectorProps {
  themePreference?: ThemePreference;
  onThemePreferenceChange?: (preference: ThemePreference) => void | Promise<void>;
}

export function WorkspaceThemeModeSelector({
  themePreference = "system",
  onThemePreferenceChange,
}: WorkspaceThemeModeSelectorProps) {
  return (
    <div className="workspace-tab-bar__theme-control">
      <label className="workspace-tab-bar__theme-label" htmlFor="workspace-theme-mode">
        Theme
      </label>
      <select
        id="workspace-theme-mode"
        className="workspace-tab-bar__theme-select"
        aria-label="Theme mode"
        value={themePreference}
        onChange={(event) => {
          void onThemePreferenceChange?.(event.target.value as ThemePreference);
        }}
      >
        {THEME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
