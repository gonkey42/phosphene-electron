import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { launchApp } from "./helpers/launch";

test.describe("Phosphene theme persistence", () => {
  test("applies and persists a bridge-selected theme across restart", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "phosphene-e2e-theme-"));
    let firstLaunch:
      | Awaited<ReturnType<typeof launchApp>>
      | null = null;
    let secondLaunch:
      | Awaited<ReturnType<typeof launchApp>>
      | null = null;

    try {
      firstLaunch = await launchApp({ userDataDir });

      await expect(firstLaunch.window.locator(".app-shell")).toBeVisible({ timeout: 15_000 });

      await firstLaunch.window.evaluate(async () => {
        await window.desktop.theme.setPreference("light");
      });
      await expect(firstLaunch.window.locator(".app-shell.theme-light")).toBeVisible();

      await firstLaunch.window.evaluate(async () => {
        await window.desktop.theme.setPreference("dark");
      });
      await expect(firstLaunch.window.locator(".app-shell.theme-dark")).toBeVisible();

      await firstLaunch.closeApp();
      firstLaunch = null;

      secondLaunch = await launchApp({ userDataDir });
      await expect(secondLaunch.window.locator(".app-shell.theme-dark")).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await secondLaunch?.cleanup();
      await firstLaunch?.cleanup();
      await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
