import { copyFile, exists, mkdir, readDir, remove } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";

const MAX_BACKUPS = 7;

export async function runDailyBackup(): Promise<void> {
  try {
    const appData = await appDataDir();
    const backupsDir = await join(appData, "backups");
    const dbPath = await join(appData, "phosphene.db");

    if (!(await exists(backupsDir))) {
      await mkdir(backupsDir, { recursive: true });
    }

    const today = new Date().toISOString().split("T")[0];
    const todayBackup = await join(backupsDir, `phosphene-${today}.db`);

    if (await exists(todayBackup)) {
      return;
    }

    if (!(await exists(dbPath))) {
      return;
    }

    await copyFile(dbPath, todayBackup);
    await cleanOldBackups(backupsDir);
  } catch (error) {
    console.error("Failed to create database backup:", error);
  }
}

export async function cleanOldBackups(backupsDir: string): Promise<void> {
  try {
    const entries = await readDir(backupsDir);
    const backupFiles = entries
      .filter((entry) => entry.name?.startsWith("phosphene-") && entry.name?.endsWith(".db"))
      .sort((a, b) => (b.name || "").localeCompare(a.name || ""));

    for (let index = MAX_BACKUPS; index < backupFiles.length; index += 1) {
      const filePath = await join(backupsDir, backupFiles[index].name || "");
      await remove(filePath);
    }
  } catch (error) {
    console.error("Failed to clean old backups:", error);
  }
}
