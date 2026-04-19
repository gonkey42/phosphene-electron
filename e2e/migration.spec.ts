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

      const schemaVersion = await launch.app.evaluate((_electron, databasePath: string) => {
        const sqliteModule = process.getBuiltinModule?.("node:sqlite") as
          | typeof import("node:sqlite")
          | undefined;

        if (!sqliteModule) {
          throw new Error("node:sqlite is unavailable in the Electron main process");
        }

        const database = new sqliteModule.DatabaseSync(databasePath, {
          readOnly: true,
        });

        try {
          const row = database.prepare("SELECT MAX(version) AS version FROM schema_version").get() as
            | { version: number | null }
            | undefined;
          return row?.version ?? null;
        } finally {
          database.close();
        }
      }, path.join(userDataDir, "phosphene.db"));

      expect(schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    } finally {
      await launch?.cleanup();
      await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
