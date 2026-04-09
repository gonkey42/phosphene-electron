import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { fs, paths } from "../platform/desktop-api";

const FILE_REF_PREFIX = "phosphene-file://";
const IMAGES_DIR = "images";

type ExcalidrawFiles = NonNullable<ExcalidrawInitialDataState["files"]>;
type ExcalidrawFile = ExcalidrawFiles[string];

function asDataURL(value: string): ExcalidrawFile["dataURL"] {
  return value as ExcalidrawFile["dataURL"];
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function isMissingPathError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === "ENOENT" || code === "ENOTDIR";
}

function isPermissionError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === "EACCES" || code === "EPERM";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function extractImagesToFilesystem(
  boardId: string,
  files: ExcalidrawFiles,
): Promise<ExcalidrawFiles> {
  const extractedFiles: ExcalidrawFiles = {};
  const appData = await paths.appDataDir();

  for (const [fileId, fileData] of Object.entries(files)) {
    if (!fileData.dataURL.startsWith("data:")) {
      extractedFiles[fileId] = fileData;
      continue;
    }

    try {
      const [, base64Data] = fileData.dataURL.split(",", 2);

      if (!base64Data) {
        extractedFiles[fileId] = fileData;
        continue;
      }

      const relativePath = getImagePath(boardId, fileId, fileData.mimeType);
      const absolutePath = await paths.join(appData, relativePath);
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);

      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      try {
        await fs.writeFile(absolutePath, bytes);
      } catch (error) {
        if (isPermissionError(error)) {
          console.error("Image extraction target is inaccessible:", {
            fileId,
            path: absolutePath,
            code: getErrorCode(error),
            message: getErrorMessage(error),
          });
        } else {
          console.error(`Failed to extract image ${fileId}:`, error);
        }

        extractedFiles[fileId] = fileData;
        continue;
      }

      extractedFiles[fileId] = {
        ...fileData,
        dataURL: asDataURL(`${FILE_REF_PREFIX}${relativePath}`),
      };
    } catch (error) {
      console.error(`Failed to extract image ${fileId}:`, error);
      extractedFiles[fileId] = fileData;
    }
  }

  return extractedFiles;
}

export async function injectImagesFromFilesystem(files: ExcalidrawFiles): Promise<ExcalidrawFiles> {
  const injectedFiles: ExcalidrawFiles = {};
  const appData = await paths.appDataDir();

  for (const [fileId, fileData] of Object.entries(files)) {
    if (!fileData.dataURL.startsWith(FILE_REF_PREFIX)) {
      injectedFiles[fileId] = fileData;
      continue;
    }

    try {
      const relativePath = fileData.dataURL.slice(FILE_REF_PREFIX.length);
      const absolutePath = await paths.join(appData, relativePath);

      let imageExists = false;

      try {
        imageExists = await fs.exists(absolutePath);
      } catch (error) {
        if (isPermissionError(error)) {
          console.error("Image file is inaccessible:", {
            fileId,
            path: absolutePath,
            code: getErrorCode(error),
            message: getErrorMessage(error),
          });
        } else {
          console.error(`Failed to inspect image ${fileId}:`, error);
        }

        injectedFiles[fileId] = fileData;
        continue;
      }

      if (!imageExists) {
        console.warn(`Image file not found: ${relativePath}`);
        injectedFiles[fileId] = fileData;
        continue;
      }

      let bytes: Uint8Array;

      try {
        bytes = await fs.readFile(absolutePath);
      } catch (error) {
        if (isMissingPathError(error)) {
          console.warn(`Image file not found: ${relativePath}`);
        } else if (isPermissionError(error)) {
          console.error("Image file is inaccessible:", {
            fileId,
            path: absolutePath,
            code: getErrorCode(error),
            message: getErrorMessage(error),
          });
        } else {
          console.error(`Failed to inject image ${fileId}:`, error);
        }

        injectedFiles[fileId] = fileData;
        continue;
      }

      let binary = "";

      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }

      injectedFiles[fileId] = {
        ...fileData,
        dataURL: asDataURL(`data:${fileData.mimeType};base64,${btoa(binary)}`),
      };
    } catch (error) {
      console.error(`Failed to inject image ${fileId}:`, error);
      injectedFiles[fileId] = fileData;
    }
  }

  return injectedFiles;
}

function getImagePath(boardId: string, fileId: string, mimeType: string): string {
  return `${IMAGES_DIR}/${boardId}_${fileId}.${getExtensionFromMime(mimeType)}`;
}

function getExtensionFromMime(mimeType: string): string {
  const extensionMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/svg+xml": "svg",
    "image/gif": "gif",
    "image/webp": "webp",
  };

  return extensionMap[mimeType] ?? "png";
}
