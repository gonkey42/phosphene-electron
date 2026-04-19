import { ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { backupDatabase, getDatabase } from "./database";

type SerializedFilesystemError = {
  code?: string;
  message: string;
};

type StorageDroppedImage = {
  name: string;
  mimeType: string;
  data: Uint8Array;
};

type FilesystemResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: SerializedFilesystemError;
    };

function createIPCContractError(channel: string, message: string): Error {
  return new Error(`[IPC ${channel}] Invalid payload: ${message}`);
}

function assertStringPath(channel: string, value: unknown, label = "path"): string {
  if (typeof value !== "string") {
    throw createIPCContractError(channel, `expected ${label} to be a string`);
  }

  return value;
}

function assertBinaryPayload(channel: string, value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw createIPCContractError(channel, "expected data to be a Uint8Array");
  }

  return value;
}

function getImageExtensionFromMime(mimeType: string): string {
  const extensionMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/svg+xml": "svg",
    "image/gif": "gif",
    "image/webp": "webp",
  };

  return extensionMap[mimeType] ?? "png";
}

function isSupportedImageMimeType(mimeType: string): boolean {
  return ["image/png", "image/jpeg", "image/svg+xml", "image/gif", "image/webp"].includes(
    mimeType,
  );
}

function getMimeTypeFromPath(filePath: string): string | null {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  const mimeTypeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
  };

  return extension ? mimeTypeMap[extension] ?? null : null;
}

function getFileName(filePath: string): string {
  return path.basename(filePath);
}

function getRemoteImageName(url: string, mimeType: string): string {
  const parsedUrl = new URL(url);
  const basename = path.posix.basename(parsedUrl.pathname);
  const decodedBasename = basename ? decodeURIComponent(basename) : "";

  if (decodedBasename && decodedBasename !== "/") {
    return decodedBasename;
  }

  return `image.${getImageExtensionFromMime(mimeType)}`;
}

function isMissingPathError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === "ENOENT" || code === "ENOTDIR";
}

function resolveBoardImagePath(
  channel: string,
  appDataPath: string,
  value: unknown,
  label = "path",
): string {
  const validatedPath = assertStringPath(channel, value, label);

  if (path.isAbsolute(validatedPath)) {
    throw createIPCContractError(channel, `expected ${label} to be a relative path`);
  }

  const resolvedPath = path.resolve(appDataPath, validatedPath);
  const imagesRoot = path.resolve(appDataPath, "images");
  const relativeToImages = path.relative(imagesRoot, resolvedPath);

  if (relativeToImages === "" || (!relativeToImages.startsWith("..") && !path.isAbsolute(relativeToImages))) {
    return resolvedPath;
  }

  throw createIPCContractError(channel, `expected ${label} to stay within app data images`);
}

function getBoardImageRelativePath(boardId: string, fileId: string, mimeType: string): string {
  return path.posix.join("images", `${boardId}_${fileId}.${getImageExtensionFromMime(mimeType)}`);
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function serializeFilesystemError(error: unknown): SerializedFilesystemError {
  return {
    code: getErrorCode(error),
    message: getErrorMessage(error),
  };
}

async function captureFilesystemResult<T>(operation: () => Promise<T>): Promise<FilesystemResult<T>> {
  try {
    return {
      ok: true,
      value: await operation(),
    };
  } catch (error) {
    return {
      ok: false,
      error: serializeFilesystemError(error),
    };
  }
}

async function cleanOldBackups(backupsDir: string): Promise<void> {
  const MAX_BACKUPS = 7;

  try {
    const entries = await fs.readdir(backupsDir, { withFileTypes: true });
    const backupFiles = entries
      .filter((entry) => entry.isFile() && entry.name.startsWith("phosphene-") && entry.name.endsWith(".db"))
      .sort((a, b) => b.name.localeCompare(a.name));

    for (let index = MAX_BACKUPS; index < backupFiles.length; index += 1) {
      await fs.unlink(path.join(backupsDir, backupFiles[index].name));
    }
  } catch (error) {
    console.error("Failed to clean old backups:", error);
  }
}

export function registerFilesystemIPC(userDataPath: string): void {
  ipcMain.handle("paths:appDataDir", () => {
    return userDataPath;
  });

  ipcMain.handle("paths:join", (_event, ...parts: unknown[]) => {
    const validatedParts = parts.map((part, index) =>
      assertStringPath("paths:join", part, `path segment ${index + 1}`),
    );
    return path.join(...validatedParts);
  });

  ipcMain.handle("fs:exists", async (_event, filePath: unknown): Promise<FilesystemResult<boolean>> => {
    const validatedPath = assertStringPath("fs:exists", filePath);

    try {
      await fs.access(validatedPath);
      return {
        ok: true,
        value: true,
      };
    } catch (error) {
      const code = getErrorCode(error);

      if (code === "ENOENT" || code === "ENOTDIR") {
        return {
          ok: true,
          value: false,
        };
      }

      return {
        ok: false,
        error: serializeFilesystemError(error),
      };
    }
  });

  ipcMain.handle("fs:mkdir", async (_event, dirPath: unknown): Promise<FilesystemResult<void>> => {
    const validatedPath = assertStringPath("fs:mkdir", dirPath);

    return captureFilesystemResult(async () => {
      await fs.mkdir(validatedPath, { recursive: true });
    });
  });

  ipcMain.handle("fs:readFile", async (_event, filePath: unknown): Promise<FilesystemResult<Uint8Array>> => {
    const validatedPath = assertStringPath("fs:readFile", filePath);

    return captureFilesystemResult(async () => {
      const buffer = await fs.readFile(validatedPath);
      return new Uint8Array(buffer);
    });
  });

  ipcMain.handle(
    "fs:writeFile",
    async (_event, filePath: unknown, data: unknown): Promise<FilesystemResult<void>> => {
      const validatedPath = assertStringPath("fs:writeFile", filePath);
      const validatedData = assertBinaryPayload("fs:writeFile", data);

      return captureFilesystemResult(async () => {
        await fs.writeFile(validatedPath, validatedData);
      });
    },
  );

  ipcMain.handle("fs:copyFile", async (_event, src: unknown, dest: unknown): Promise<FilesystemResult<void>> => {
    const validatedSource = assertStringPath("fs:copyFile", src, "source path");
    const validatedDestination = assertStringPath("fs:copyFile", dest, "destination path");

    return captureFilesystemResult(async () => {
      await fs.copyFile(validatedSource, validatedDestination);
    });
  });

  ipcMain.handle(
    "fs:readDir",
    async (_event, dirPath: unknown): Promise<FilesystemResult<Array<{ name: string }>>> => {
      const validatedPath = assertStringPath("fs:readDir", dirPath);

      return captureFilesystemResult(async () => {
        const entries = await fs.readdir(validatedPath, { withFileTypes: true });
        return entries.map((entry) => ({ name: entry.name }));
      });
    },
  );

  ipcMain.handle("fs:remove", async (_event, filePath: unknown): Promise<FilesystemResult<void>> => {
    const validatedPath = assertStringPath("fs:remove", filePath);

    return captureFilesystemResult(async () => {
      await fs.unlink(validatedPath);
    });
  });

  ipcMain.handle("storage:ensure-directories", async (): Promise<FilesystemResult<void>> => {
    return captureFilesystemResult(async () => {
      await fs.mkdir(path.join(userDataPath, "images"), { recursive: true });
      await fs.mkdir(path.join(userDataPath, "captures"), { recursive: true });
    });
  });

  ipcMain.handle("storage:run-daily-backup", async (): Promise<FilesystemResult<Awaited<ReturnType<typeof backupDatabase>>>> => {
    return captureFilesystemResult(async () => {
      const backupsDir = path.join(userDataPath, "backups");
      await fs.mkdir(backupsDir, { recursive: true });

      const database = getDatabase(userDataPath);
      const today = new Date().toISOString().split("T")[0];
      const destinationPath = path.join(backupsDir, `phosphene-${today}.db`);
      const backupResult = await backupDatabase(database, destinationPath);

      if (backupResult.status === "created") {
        await cleanOldBackups(backupsDir);
      }

      return backupResult;
    });
  });

  ipcMain.handle(
    "storage:read-dropped-image",
    async (_event, filePath: unknown): Promise<FilesystemResult<StorageDroppedImage>> => {
    const validatedPath = assertStringPath("storage:read-dropped-image", filePath);

    return captureFilesystemResult(async () => {
      const mimeType = getMimeTypeFromPath(validatedPath);

      if (!mimeType) {
        throw createIPCContractError(
          "storage:read-dropped-image",
          `unsupported dropped image path: ${validatedPath}`,
        );
      }

      const buffer = await fs.readFile(validatedPath);
      return {
        name: getFileName(validatedPath),
        mimeType,
        data: new Uint8Array(buffer),
      };
    });
  },
  );

  ipcMain.handle(
    "storage:read-remote-image",
    async (_event, url: unknown): Promise<FilesystemResult<StorageDroppedImage>> => {
      const validatedUrl = assertStringPath("storage:read-remote-image", url, "url");

      return captureFilesystemResult(async () => {
        const parsedUrl = new URL(validatedUrl);

        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          throw createIPCContractError(
            "storage:read-remote-image",
            `unsupported remote image url: ${validatedUrl}`,
          );
        }

        const response = await fetch(validatedUrl);

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "";

        if (!isSupportedImageMimeType(mimeType)) {
          throw new Error(`Unsupported remote image type: ${mimeType || "unknown"}`);
        }

        const buffer = new Uint8Array(await response.arrayBuffer());

        return {
          name: getRemoteImageName(validatedUrl, mimeType),
          mimeType,
          data: buffer,
        };
      });
    },
  );

  ipcMain.handle(
    "storage:write-board-image",
    async (
      _event,
      boardId: unknown,
      fileId: unknown,
      mimeType: unknown,
      data: unknown,
    ): Promise<FilesystemResult<string>> => {
      const validatedBoardId = assertStringPath("storage:write-board-image", boardId, "boardId");
      const validatedFileId = assertStringPath("storage:write-board-image", fileId, "fileId");
      const validatedMimeType = assertStringPath("storage:write-board-image", mimeType, "mimeType");
      const relativePath = getBoardImageRelativePath(
        validatedBoardId,
        validatedFileId,
        validatedMimeType,
      );
      const validatedPath = resolveBoardImagePath(
        "storage:write-board-image",
        userDataPath,
        relativePath,
        "board image path",
      );
      const validatedData = assertBinaryPayload("storage:write-board-image", data);

      return captureFilesystemResult(async () => {
        await fs.mkdir(path.dirname(validatedPath), { recursive: true });
        await fs.writeFile(validatedPath, validatedData);
        return relativePath;
      });
    },
  );

  ipcMain.handle(
    "storage:read-board-image",
    async (_event, boardImagePath: unknown): Promise<FilesystemResult<Uint8Array | null>> => {
      const validatedPath = resolveBoardImagePath(
        "storage:read-board-image",
        userDataPath,
        boardImagePath,
        "board image path",
      );

      return captureFilesystemResult(async () => {
        try {
          const buffer = await fs.readFile(validatedPath);
          return new Uint8Array(buffer);
        } catch (error) {
          if (isMissingPathError(error)) {
            return null;
          }

          throw error;
        }
      });
    },
  );
}
