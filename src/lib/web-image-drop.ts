import { storage } from "../platform/desktop-api";
import { getImageFileExtension, isSupportedImageMimeType } from "./image-mime";

export function extractWebImageUrl(
  dataTransfer: Pick<DataTransfer, "files" | "types" | "getData">,
): string | null {
  if (dataTransfer.files.length > 0) {
    return null;
  }

  const types = new Set(Array.from(dataTransfer.types));
  const htmlCandidate = types.has("text/html")
    ? firstHttpUrlFromHtml(dataTransfer.getData("text/html"))
    : null;

  if (htmlCandidate) {
    return htmlCandidate;
  }

  if (types.has("text/uri-list")) {
    const uriList = dataTransfer.getData("text/uri-list");
    const candidate = firstLikelyRemoteImageUrl(uriList);
    if (candidate) {
      return candidate;
    }
  }

  if (types.has("text/plain")) {
    const plainText = dataTransfer.getData("text/plain");
    const candidate = firstLikelyRemoteImageUrl(plainText);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

export async function readImageUrlAsFile(
  url: string,
  fetchImpl: typeof fetch = fetch,
  readRemoteImage: (url: string) => Promise<{ name: string; mimeType: string; data: Uint8Array }> =
    storage.readRemoteImage,
): Promise<File> {
  const parsedUrl = new URL(url);

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`Unsupported remote image url: ${url}`);
  }

  let response: Response;

  try {
    response = await fetchImpl(url);
  } catch {
    const remoteImage = await readRemoteImage(url);

    if (!isSupportedImageMimeType(remoteImage.mimeType)) {
      throw new Error(`Unsupported remote image type: ${remoteImage.mimeType || "unknown"}`);
    }

    return new File([remoteImage.data], remoteImage.name, { type: remoteImage.mimeType });
  }

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "";

  if (!isSupportedImageMimeType(contentType)) {
    throw new Error(`Unsupported remote image type: ${contentType || "unknown"}`);
  }

  const blob = await response.blob();
  const name = getFileNameFromUrl(parsedUrl, contentType);

  return new File([blob], name, { type: contentType });
}

export function createSyntheticDropTransfer(file: File): DataTransfer {
  const nativeTransfer = createNativeDataTransfer();

  if (nativeTransfer) {
    nativeTransfer.items.add(file);
    return nativeTransfer;
  }

  const items = createDataTransferItemList(file);

  return {
    dropEffect: "none",
    effectAllowed: "all",
    files: createFileList([file]),
    items,
    types: ["Files"],
    getData: () => "",
    setData: () => undefined,
    clearData: () => undefined,
    setDragImage: () => undefined,
  } as DataTransfer;
}

function createNativeDataTransfer(): DataTransfer | null {
  if (typeof DataTransfer !== "function") {
    return null;
  }

  try {
    return new DataTransfer();
  } catch {
    return null;
  }
}

function createFileList(files: File[]): FileList {
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
    [Symbol.iterator]: function* () {
      yield* files;
    },
  } as FileList;

  files.forEach((file, index) => {
    Object.defineProperty(fileList, index, {
      configurable: true,
      enumerable: true,
      value: file,
      writable: false,
    });
  });

  return fileList;
}

function createDataTransferItemList(file: File): DataTransferItemList {
  const item = {
    kind: "file",
    type: file.type,
    getAsFile: () => file,
    getAsString: (_callback: (data: string) => void) => undefined,
    webkitGetAsEntry: () => null,
  } as DataTransferItem;

  return {
    0: item,
    length: 1,
    add: () => null,
    clear: () => undefined,
    remove: () => undefined,
    item: (index: number) => (index === 0 ? item : null),
    [Symbol.iterator]: function* () {
      yield item;
    },
  } as DataTransferItemList;
}

function getFileNameFromUrl(parsedUrl: URL, mimeType: string): string {
  const basename = parsedUrl.pathname.split("/").pop();
  const decodedBasename = basename ? decodeURIComponent(basename) : "";

  if (decodedBasename && decodedBasename !== "/") {
    return decodedBasename;
  }

  const extension = getImageFileExtension(mimeType);
  return extension ? `image.${extension}` : "image";
}

function firstLikelyRemoteImageUrl(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const candidate = line.trim();

    if (!candidate || candidate.startsWith("#")) {
      continue;
    }

    if (isLikelyRemoteImageUrl(candidate)) {
      return candidate;
    }
  }

  return null;
}

function firstHttpUrlFromHtml(html: string): string | null {
  const matches = html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi);

  for (const match of matches) {
    const candidate = match[1];
    if (isHttpUrl(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

function isLikelyRemoteImageUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return false;
    }

    return /\.(png|jpe?g|gif|svg|webp)$/i.test(parsedUrl.pathname);
  } catch {
    return false;
  }
}
