import { isSupportedImageFile } from "./drop-handler";

export function extractWebImageUrl(
  dataTransfer: Pick<DataTransfer, "files" | "types" | "getData">,
): string | null {
  if (dataTransfer.files.length > 0) {
    return null;
  }

  const types = new Set(Array.from(dataTransfer.types));

  if (types.has("text/uri-list")) {
    const uriList = dataTransfer.getData("text/uri-list");
    const candidate = firstHttpUrl(uriList);
    if (candidate) {
      return candidate;
    }
  }

  if (types.has("text/plain")) {
    const plainText = dataTransfer.getData("text/plain");
    const candidate = firstHttpUrl(plainText);
    if (candidate) {
      return candidate;
    }
  }

  if (types.has("text/html")) {
    const html = dataTransfer.getData("text/html");
    const candidate = firstHttpUrlFromHtml(html);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

export async function readImageUrlAsFile(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<File> {
  const parsedUrl = new URL(url);

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`Unsupported remote image url: ${url}`);
  }

  const response = await fetchImpl(url);
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "";

  if (!isSupportedImageFile(new File([], "remote-image", { type: contentType }))) {
    throw new Error(`Unsupported remote image type: ${contentType || "unknown"}`);
  }

  const blob = await response.blob();
  const name = decodeURIComponent(parsedUrl.pathname.split("/").pop() || "image");

  return new File([blob], name, { type: contentType });
}

export function createSyntheticDropTransfer(file: File): DataTransfer {
  const fileList = createFileList([file]);

  return {
    dropEffect: "none",
    effectAllowed: "all",
    files: fileList,
    items: createDataTransferItemList(file),
    types: ["Files"],
    getData: () => "",
    setData: () => undefined,
    clearData: () => undefined,
    setDragImage: () => undefined,
  } as DataTransfer;
}

function createFileList(files: File[]): FileList {
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
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
  return {
    length: 1,
    add: () => null,
    clear: () => undefined,
    remove: () => undefined,
    item: (index: number) =>
      index === 0
        ? ({
            kind: "file",
            type: file.type,
            getAsFile: () => file,
            getAsString: (_callback: (data: string) => void) => undefined,
            webkitGetAsEntry: () => null,
          } as DataTransferItem)
        : null,
    [Symbol.iterator]: function* () {
      yield this.item(0) as DataTransferItem;
    },
  } as DataTransferItemList;
}

function firstHttpUrl(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const candidate = line.trim();

    if (!candidate || candidate.startsWith("#")) {
      continue;
    }

    if (isHttpUrl(candidate)) {
      return candidate;
    }
  }

  return null;
}

function firstHttpUrlFromHtml(html: string): string | null {
  const matches = html.matchAll(/src\s*=\s*["']([^"']+)["']/gi);

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
