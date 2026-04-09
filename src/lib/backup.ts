import { db, fs, paths } from "../platform/desktop-api";

const MAX_BACKUPS = 7;

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function isPermissionError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === "EACCES" || code === "EPERM";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runDailyBackup(): Promise<void> {
  try {
    const appData = await paths.appDataDir();
    const backupsDir = await paths.join(appData, "backups");

    try {
      if (!(await fs.exists(backupsDir))) {
        await fs.mkdir(backupsDir);
      }
    } catch (error) {
      if (isPermissionError(error)) {
        console.error("Backup directory is inaccessible:", {
          path: backupsDir,
          code: getErrorCode(error),
          message: getErrorMessage(error),
        });
        return;
      }

      throw error;
    }

    const today = new Date().toISOString().split("T")[0];
    const todayBackup = await paths.join(backupsDir, `phosphene-${today}.db`);
    const backupResult = await db.backup(todayBackup);

    if (backupResult.status === "skipped") {
      return;
    }

    if (backupResult.status === "failed") {
      console.error("Failed to create database backup:", backupResult);
      return;
    }

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
