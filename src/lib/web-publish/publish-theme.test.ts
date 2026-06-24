import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  WEB_PUBLISH_DARK_BOARD_BACKGROUND,
  WEB_PUBLISH_SNAPSHOT_THEME,
} from "./publish-theme";

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

describe("web publish snapshot theme", () => {
  it("uses the app dark theme background as the default board background", async () => {
    const tokens = await readAppDarkTokens();

    expect(WEB_PUBLISH_SNAPSHOT_THEME).toBe("dark");
    expect(WEB_PUBLISH_DARK_BOARD_BACKGROUND).toBe(tokens["--app-background"]);
  });
});
