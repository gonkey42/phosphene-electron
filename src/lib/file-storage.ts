import { paths, fs } from "../platform/desktop-api";

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

async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    if (await fs.exists(dirPath)) {
      return;
    }
  } catch (error) {
    if (isPermissionError(error)) {
      console.error("Storage path is inaccessible:", {
        path: dirPath,
        code: getErrorCode(error),
        message: getErrorMessage(error),
      });
    } else {
      console.error("Failed to inspect storage path:", {
        path: dirPath,
        code: getErrorCode(error),
        message: getErrorMessage(error),
      });
    }

    throw error;
  }

  try {
    await fs.mkdir(dirPath);
  } catch (error) {
    console.error("Failed to create storage directory:", {
      path: dirPath,
      code: getErrorCode(error),
      message: getErrorMessage(error),
    });
    throw error;
  }
}

export async function ensureStorageDirectories(): Promise<void> {
  const appData = await paths.appDataDir();
  const imagesDir = await paths.join(appData, "images");
  const capturesDir = await paths.join(appData, "captures");

  await ensureDirectoryExists(imagesDir);
  await ensureDirectoryExists(capturesDir);
}

export async function getImagesDir(): Promise<string> {
  const appData = await paths.appDataDir();
  return paths.join(appData, "images");
}

export async function getCapturesDir(): Promise<string> {
  const appData = await paths.appDataDir();
  return paths.join(appData, "captures");
}
