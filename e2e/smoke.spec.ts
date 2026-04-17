import { test, expect } from "@playwright/test";
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
      // BrowserView is a native view and its URL is surfaced to the renderer
      // via `browser.onStateChanged`, which updates the address input's value.
      // We assert against the controlled input value rather than the native
      // view's content — that is the observable signal in the renderer DOM.
      const tabBar = window.getByRole("banner", { name: "Workspaces" });
      await expect(
        tabBar.getByRole("button", { name: "Home", exact: true }),
      ).toBeVisible({ timeout: 15_000 });

      const addressBar = window.getByRole("textbox", { name: "Browser address" });
      await expect(addressBar).toBeVisible();

      await addressBar.click();
      await addressBar.fill("https://example.com");
      await window.keyboard.press("Enter");

      // After the submit, the renderer will navigate the BrowserView and the
      // main process will broadcast the new URL back via onStateChanged,
      // which resets addressValue to the normalized/final URL.
      await expect(addressBar).toHaveValue(/example\.com/, { timeout: 20_000 });
    } finally {
      await cleanup();
    }
  });
});
