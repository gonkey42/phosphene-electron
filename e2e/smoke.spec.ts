import { test, expect } from "@playwright/test";
import { waitForLoadedBrowserUrl } from "./helpers/browser-state";
import { launchApp } from "./helpers/launch";

test.describe("Phosphene smoke", () => {
  test("launches and shows the default Home workspace", async () => {
    const { window, cleanup } = await launchApp();
    try {
      // The seeded default workspace is named "Home" and rendered as a tab
      // button (aria-label="Home") inside the Workspaces header region.
      // We scope to that region because BrowserPanel also has a "Home" button
      // (its text content is "Home"), which would otherwise collide.
      const tabBar = window.getByRole("banner", { name: "Workspaces" });
      await expect(
        tabBar.getByRole("button", { name: "Home", exact: true }),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await cleanup();
    }
  });

  test("creates a new workspace", async () => {
    const { window, cleanup } = await launchApp();
    try {
      // WorkspaceTabBar exposes a "+" button with aria-label="Create workspace"
      // which auto-names the new workspace "Workspace N" (no prompt).
      const tabBar = window.getByRole("banner", { name: "Workspaces" });
      await expect(
        tabBar.getByRole("button", { name: "Home", exact: true }),
      ).toBeVisible({ timeout: 15_000 });

      await tabBar.getByRole("button", { name: "Create workspace" }).click();

      await expect(
        tabBar.getByRole("button", { name: "Workspace 2", exact: true }),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test("browser panel navigates to a URL", async () => {
    const { window, cleanup } = await launchApp();
    try {
      // BrowserPanel is always mounted for the active workspace. The actual
      // BrowserView is a native view, so the source of truth is the browser
      // state bridged back through `browser.onStateChanged`.
      const tabBar = window.getByRole("banner", { name: "Workspaces" });
      await expect(
        tabBar.getByRole("button", { name: "Home", exact: true }),
      ).toBeVisible({ timeout: 15_000 });

      const addressBar = window.getByRole("textbox", { name: "Browser address" });
      await expect(addressBar).toBeVisible();

      await addressBar.click();
      await addressBar.fill("https://example.com");
      await window.keyboard.press("Enter");

      const browserState = await waitForLoadedBrowserUrl(window, /example\.com/);
      expect(browserState.url).toMatch(/example\.com/);
    } finally {
      await cleanup();
    }
  });
});
