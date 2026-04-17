import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const helperDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(helperDir, "..", "..");
const mainEntry = path.join(repoRoot, "dist-electron", "main.js");

export async function launchApp(): Promise<{
  app: ElectronApplication;
  window: Page;
  userDataDir: string;
  cleanup: () => Promise<void>;
}> {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "phosphene-e2e-"));

  const app = await electron.launch({
    args: [mainEntry, `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      NODE_ENV: "test",
      ELECTRON_ENABLE_LOGGING: "1",
    },
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  return {
    app,
    window,
    userDataDir,
    cleanup: async () => {
      await app.close().catch(() => undefined);
      await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}
