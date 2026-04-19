import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { storage } from "../platform/desktop-api";

const FILE_REF_PREFIX = "phosphene-file://";

type ExcalidrawFiles = NonNullable<ExcalidrawInitialDataState["files"]>;
type ExcalidrawFile = ExcalidrawFiles[string];

function asDataURL(value: string): ExcalidrawFile["dataURL"] {
  return value as ExcalidrawFile["dataURL"];
}

export async function extractImagesToFilesystem(
  boardId: string,
  files: ExcalidrawFiles,
): Promise<ExcalidrawFiles> {
  const extractedFiles: ExcalidrawFiles = {};

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

      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);

      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const relativePath = await storage.writeBoardImage(
        boardId,
        fileId,
        fileData.mimeType,
        bytes,
      );

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

  for (const [fileId, fileData] of Object.entries(files)) {
    if (!fileData.dataURL.startsWith(FILE_REF_PREFIX)) {
      injectedFiles[fileId] = fileData;
      continue;
    }

    const relativePath = normalizeBoardImagePath(fileData.dataURL.slice(FILE_REF_PREFIX.length));

    try {
      const bytes = await storage.readBoardImage(relativePath);

      if (!bytes) {
        console.warn(`Image file not found: ${relativePath}`);
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

function normalizeBoardImagePath(boardImagePath: string): string {
  const normalizedPath = boardImagePath.replace(/\\/g, "/");

  if (normalizedPath.startsWith("images/")) {
    return normalizedPath;
  }

  const imagesIndex = normalizedPath.lastIndexOf("/images/");

  if (imagesIndex >= 0) {
    return normalizedPath.slice(imagesIndex + 1);
  }

  return normalizedPath;
}
