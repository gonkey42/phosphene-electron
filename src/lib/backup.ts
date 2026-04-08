import { fs, paths } from "../platform/desktop-api";

const MAX_BACKUPS = 7;

export async function runDailyBackup(): Promise<void> {
  try {
    const appData = await paths.appDataDir();
    const backupsDir = await paths.join(appData, "backups");
    const dbPath = await paths.join(appData, "phosphene.db");

    if (!(await fs.exists(backupsDir))) {
      await fs.mkdir(backupsDir);
    }

    const today = new Date().toISOString().split("T")[0];
    const todayBackup = await paths.join(backupsDir, `phosphene-${today}.db`);

    if (await fs.exists(todayBackup)) {
      return;
    }

    if (!(await fs.exists(dbPath))) {
      return;
    }

    await fs.copyFile(dbPath, todayBackup);
    await cleanOldBackups(backupsDir);
  } catch (error) {
    console.error("Failed to create database backup:", error);
  }
}

export async function cleanOldBackups(backupsDir: string): Promise<void> {
  try {
    const entries = await fs.readDir(backupsDir);
    const backupFiles = entries
      .filter((entry) => entry.name?.startsWith("phosphene-") && entry.name?.endsWith(".db"))
      .sort((a, b) => (b.name || "").localeCompare(a.name || ""));

    for (let index = MAX_BACKUPS; index < backupFiles.length; index += 1) {
      const filePath = await paths.join(backupsDir, backupFiles[index].name || "");
      await fs.remove(filePath);
    }
  } catch (error) {
    console.error("Failed to clean old backups:", error);
  }
}
