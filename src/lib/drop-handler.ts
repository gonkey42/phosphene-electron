import { storage } from "../platform/desktop-api";
import { isSupportedImageMimeType } from "./image-mime";

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function isSupportedImageFile(file: File): boolean {
  return isSupportedImageMimeType(file.type);
}

export function isSupportedImagePath(path: string): boolean {
  return getMimeTypeFromPath(path) !== null;
}

export async function readImagePathAsFile(path: string): Promise<File> {
  const droppedImage = await storage.readDroppedImage(path);
  return new File([droppedImage.data], droppedImage.name, { type: droppedImage.mimeType });
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
