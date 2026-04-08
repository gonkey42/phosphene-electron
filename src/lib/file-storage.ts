import { paths, fs } from "../platform/desktop-api";

export async function ensureStorageDirectories(): Promise<void> {
  const appData = await paths.appDataDir();
  const imagesDir = await paths.join(appData, "images");
  const capturesDir = await paths.join(appData, "captures");

  if (!(await fs.exists(imagesDir))) {
    await fs.mkdir(imagesDir);
  }

  if (!(await fs.exists(capturesDir))) {
    await fs.mkdir(capturesDir);
  }
}

export async function getImagesDir(): Promise<string> {
  const appData = await paths.appDataDir();
  return paths.join(appData, "images");
}

export async function getCapturesDir(): Promise<string> {
  const appData = await paths.appDataDir();
  return paths.join(appData, "captures");
}
