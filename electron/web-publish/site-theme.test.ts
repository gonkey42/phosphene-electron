import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  WEB_PUBLISH_DARK_THEME_TOKENS,
  WEB_PUBLISH_THEME_CLASS,
  renderWebPublishDarkThemeCss,
} from "./site-theme";

const DARK_THEME_BLOCK_PATTERN = /\.theme-dark\s*\{(?<body>[\s\S]*?)\}/;
const CUSTOM_PROPERTY_PATTERN = /(?<name>--app-[\w-]+):\s*(?<value>[^;]+);/g;

async function readAppDarkTokens(): Promise<Record<string, string>> {
  const appCss = await fs.readFile(path.resolve("src/App.css"), "utf8");
  const block = appCss.match(DARK_THEME_BLOCK_PATTERN)?.groups?.body;
  expect(block).toBeTruthy();

  return Object.fromEntries(
    [...block!.matchAll(CUSTOM_PROPERTY_PATTERN)].map((match) => [
      match.groups!.name,
      match.groups!.value.trim(),
    ]),
  );
}

describe("web publish dark theme tokens", () => {
  it("matches the renderer app dark theme variables", async () => {
    await expect(readAppDarkTokens()).resolves.toEqual(WEB_PUBLISH_DARK_THEME_TOKENS);
  });

  it("renders a dark theme class with all app variables", () => {
    const css = renderWebPublishDarkThemeCss();

    expect(WEB_PUBLISH_THEME_CLASS).toBe("theme-dark");
    expect(css).toContain(".theme-dark");
    expect(css).toContain("--app-background: #08111f;");
    expect(css).toContain("--app-shadow: 0 24px 60px rgba(2, 6, 23, 0.5);");
  });
});
