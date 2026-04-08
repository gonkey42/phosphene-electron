import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir } from "@tauri-apps/plugin-fs";

export async function ensureStorageDirectories(): Promise<void> {
  const appData = await appDataDir();
  const imagesDir = await join(appData, "images");
  const capturesDir = await join(appData, "captures");

  if (!(await exists(imagesDir))) {
    await mkdir(imagesDir, { recursive: true });
  }

  if (!(await exists(capturesDir))) {
    await mkdir(capturesDir, { recursive: true });
  }
}

export async function getImagesDir(): Promise<string> {
  const appData = await appDataDir();
  return join(appData, "images");
}

export async function getCapturesDir(): Promise<string> {
  const appData = await appDataDir();
  return join(appData, "captures");
}
