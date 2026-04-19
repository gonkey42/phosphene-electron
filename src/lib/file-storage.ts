import { storage } from "../platform/desktop-api";

export async function ensureStorageDirectories(): Promise<void> {
  await storage.ensureDirectories();
}
