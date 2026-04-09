import { ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

type SerializedFilesystemError = {
  code?: string;
  message: string;
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
}
