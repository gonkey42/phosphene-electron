import { storage } from "../platform/desktop-api";

export async function runDailyBackup(): Promise<void> {
  const backupResult = await storage.runDailyBackup();

  if (backupResult.status === "failed") {
    throw backupResult;
  }
}
