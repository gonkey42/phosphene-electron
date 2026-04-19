const IMAGE_MIME_TYPE_TO_EXTENSION = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/webp": "webp",
} as const;

export type SupportedImageMimeType = keyof typeof IMAGE_MIME_TYPE_TO_EXTENSION;

export function isSupportedImageMimeType(mimeType: string): mimeType is SupportedImageMimeType {
  return mimeType in IMAGE_MIME_TYPE_TO_EXTENSION;
}

export function getImageFileExtension(mimeType: string): string | null {
  return isSupportedImageMimeType(mimeType) ? IMAGE_MIME_TYPE_TO_EXTENSION[mimeType] : null;
}
