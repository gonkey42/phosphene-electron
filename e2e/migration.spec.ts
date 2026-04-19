import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { launchApp } from "./helpers/launch";

const specDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(specDir, "fixtures", "v0.2.1-user-data");
const fixtureDatabasePath = path.join(fixtureDir, "phosphene.db");
const LATEST_SCHEMA_VERSION = 2;

test.describe("Phosphene startup migration", () => {
  test("boots a pre-v0.2.2 user-data fixture, migrates it, and keeps its content visible", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "phosphene-e2e-migration-"));
    let launch:
      | Awaited<ReturnType<typeof launchApp>>
      | null = null;

    try {
      await fs.copyFile(fixtureDatabasePath, path.join(userDataDir, "phosphene.db"));

      launch = await launchApp({ userDataDir });

      const tabBar = launch.window.getByRole("banner", { name: "Workspaces" });
      await expect(
        tabBar.getByRole("button", { name: "Legacy Workspace", exact: true }),
      ).toBeVisible({ timeout: 15_000 });

      const sidebar = launch.window.getByRole("complementary", { name: "Workspace boards" });
      await expect(
        sidebar.getByRole("button", { name: "Legacy Board", exact: true }),
      ).toBeVisible();

      const schemaRows = await launch.window.evaluate(async () => {
        return window.desktop.db.select<Array<{ version: number }>>(
          "SELECT MAX(version) AS version FROM schema_version",
          [],
        );
      });
      expect(schemaRows).toEqual([{ version: LATEST_SCHEMA_VERSION }]);
    } finally {
      await launch?.cleanup();
      await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
