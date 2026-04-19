import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { launchApp } from "./helpers/launch";

test.describe("Phosphene persistence", () => {
  test("preserves a created workspace and board across restart", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "phosphene-e2e-persist-"));
    let firstLaunch:
      | Awaited<ReturnType<typeof launchApp>>
      | null = null;
    let secondLaunch:
      | Awaited<ReturnType<typeof launchApp>>
      | null = null;

    try {
      firstLaunch = await launchApp({ userDataDir });

      const firstTabBar = firstLaunch.window.getByRole("banner", { name: "Workspaces" });
      await expect(
        firstTabBar.getByRole("button", { name: "Home", exact: true }),
      ).toBeVisible({ timeout: 15_000 });

      await firstTabBar.getByRole("button", { name: "Create workspace" }).click();
      const workspaceTwoButton = firstTabBar.getByRole("button", {
        name: "Workspace 2",
        exact: true,
      });
      await expect(workspaceTwoButton).toBeVisible();
      await expect(workspaceTwoButton).toHaveAttribute("aria-current", "page");

      const firstSidebar = firstLaunch.window.getByRole("complementary", { name: "Workspace boards" });
      await expect(firstSidebar.getByText("No boards yet.")).toBeVisible();
      await firstSidebar.getByRole("button", { name: "Create board" }).click();
      await expect(firstSidebar.getByRole("button", { name: "Board 1", exact: true })).toBeVisible();

      await firstLaunch.closeApp();
      firstLaunch = null;

      secondLaunch = await launchApp({ userDataDir });

      const secondTabBar = secondLaunch.window.getByRole("banner", { name: "Workspaces" });
      await expect(
        secondTabBar.getByRole("button", { name: "Workspace 2", exact: true }),
      ).toBeVisible({ timeout: 15_000 });

      const secondSidebar = secondLaunch.window.getByRole("complementary", { name: "Workspace boards" });
      await expect(secondSidebar.getByRole("button", { name: "Board 1", exact: true })).toBeVisible();
    } finally {
      await secondLaunch?.cleanup();
      await firstLaunch?.cleanup();
      await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
