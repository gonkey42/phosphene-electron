export const WEB_PUBLISH_THEME_CLASS = "theme-dark";

export const WEB_PUBLISH_DARK_THEME_TOKENS = {
  "--app-background": "#08111f",
  "--app-surface": "#0f1b2d",
  "--app-surface-muted": "#12233a",
  "--app-text": "#e2e8f0",
  "--app-text-muted": "#94a3b8",
  "--app-border": "#243448",
  "--app-shadow": "0 24px 60px rgba(2, 6, 23, 0.5)",
} as const;

export function renderWebPublishDarkThemeCss(): string {
  const variables = Object.entries(WEB_PUBLISH_DARK_THEME_TOKENS)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");

  return `.${WEB_PUBLISH_THEME_CLASS} {\n${variables}\n}`;
}
