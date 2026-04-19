const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/svg+xml",
  "image/webp",
]);

export function extractRemoteImageUrl(dataTransfer: DataTransfer): string | null {
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

export async function downloadRemoteImageAsFile(url: string): Promise<File> {
  const parsedUrl = new URL(url);

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`Unsupported remote image url: ${url}`);
  }

  const response = await fetch(url);
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "";

  if (!SUPPORTED_IMAGE_MIME_TYPES.has(contentType)) {
    throw new Error(`Unsupported remote image type: ${contentType || "unknown"}`);
  }

  const blob = await response.blob();
  const name = decodeURIComponent(parsedUrl.pathname.split("/").pop() || "image");

  return new File([blob], name, { type: contentType });
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
