import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { launchApp } from "./helpers/launch";

const specDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(specDir, "..");
const fixturePackDir = path.join(specDir, "fixtures", "board-pack-basic");
const importerPath = path.join(repoRoot, "dist-electron", "board-pack", "importer.js");

type ImportBoardPack = (options: {
  packDir: string;
  userDataPath: string;
}) => Promise<unknown>;

async function importBoardPackInMainProcess(
  app: Awaited<ReturnType<typeof launchApp>>["app"],
  packDir: string,
  userDataDir: string,
): Promise<void> {
  await app.evaluate(
    async (_electron, options: { importerPath: string; packDir: string; userDataDir: string }) => {
      const moduleBuiltin = process.getBuiltinModule?.("node:module") as
        | typeof import("node:module")
        | undefined;

      if (!moduleBuiltin) {
        throw new Error("node:module is unavailable in the Electron main process");
      }

      const require = moduleBuiltin.createRequire(options.importerPath);
      const importer = require(options.importerPath) as {
        importBoardPack: ImportBoardPack;
      };

      await importer.importBoardPack({
        packDir: options.packDir,
        userDataPath: options.userDataDir,
      });
    },
    { importerPath, packDir, userDataDir },
  );
}

async function getPersistedActiveWorkspaceName(
  app: Awaited<ReturnType<typeof launchApp>>["app"],
  userDataDir: string,
): Promise<string | null> {
  return app.evaluate((_electron, databasePath: string) => {
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
      const row = database
        .prepare(
          `SELECT workspaces.name AS name
           FROM settings
           JOIN workspaces ON workspaces.id = settings.value
           WHERE settings.key = 'active_workspace_id'
           LIMIT 1`,
        )
        .get() as { name: string } | undefined;
      return row?.name ?? null;
    } finally {
      database.close();
    }
  }, path.join(userDataDir, "phosphene.db"));
}

test.describe("board pack import", () => {
  test("shows an imported workspace and board after restart", async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "phosphene-board-pack-e2e-"));
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
      await expect
        .poll(() => getPersistedActiveWorkspaceName(firstLaunch.app, userDataDir), {
          timeout: 15_000,
        })
        .toBe("Home");

      await importBoardPackInMainProcess(firstLaunch.app, fixturePackDir, userDataDir);
      await firstLaunch.closeApp();
      firstLaunch = null;

      secondLaunch = await launchApp({ userDataDir });

      const tabBar = secondLaunch.window.getByRole("banner", { name: "Workspaces" });
      await expect(
        tabBar.getByRole("button", { name: "Imported Example Workspace", exact: true }),
      ).toBeVisible({ timeout: 15_000 });

      const sidebar = secondLaunch.window.getByRole("complementary", { name: "Workspace boards" });
      await expect(
        sidebar.getByRole("button", { name: "Imported Board 01", exact: true }),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await secondLaunch?.cleanup();
      await firstLaunch?.cleanup();
      await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
