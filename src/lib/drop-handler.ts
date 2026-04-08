import { readFile } from "@tauri-apps/plugin-fs";

/**
 * Read a dropped File as a base64 data URL.
 */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Check if a file is a supported image type.
 */
export function isSupportedImageFile(file: File): boolean {
  return ["image/png", "image/jpeg", "image/gif", "image/svg+xml", "image/webp"].includes(
    file.type,
  );
}

/**
 * Check if a dropped filesystem path points to a supported image type.
 */
export function isSupportedImagePath(path: string): boolean {
  return getMimeTypeFromPath(path) !== null;
}

/**
 * Read a dropped filesystem image path into a browser File object.
 */
export async function readImagePathAsFile(path: string): Promise<File> {
  const mimeType = getMimeTypeFromPath(path);

  if (!mimeType) {
    throw new Error(`Unsupported dropped image path: ${path}`);
  }

  const bytes = await readFile(path);
  return new File([bytes], getFileName(path), { type: mimeType });
}

function getFileName(path: string): string {
  return path.split(/[/\\]/).pop() ?? "image";
}

function getMimeTypeFromPath(path: string): string | null {
  const extension = path.split(".").pop()?.toLowerCase();
  const mimeTypeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
  };

  return extension ? (mimeTypeMap[extension] ?? null) : null;
}
