import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function createDataTransfer(types: string[], getData: (type: string) => string, files?: FileList) {
  return {
    files: files ?? createFileList([]),
    types,
    getData,
  } satisfies Pick<DataTransfer, "files" | "types" | "getData">;
}

describe("web image drop utilities", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts an image url from dragged html", async () => {
    const { extractWebImageUrl } = await import("./web-image-drop");
    const dataTransfer = createDataTransfer(["text/html"], (type) =>
      type === "text/html" ? '<img src="https://example.com/assets/photo.png">' : "",
    );

    expect(extractWebImageUrl(dataTransfer)).toBe("https://example.com/assets/photo.png");
  });

  it("prefers uri list before plain text", async () => {
    const { extractWebImageUrl } = await import("./web-image-drop");
    const dataTransfer = createDataTransfer(["text/uri-list", "text/plain"], (type) =>
      type === "text/uri-list"
        ? "https://example.com/first.png\nhttps://example.com/second.png"
        : "https://example.com/plain.png",
    );

    expect(extractWebImageUrl(dataTransfer)).toBe("https://example.com/first.png");
  });

  it("prefers html over plain text when both are present", async () => {
    const { extractWebImageUrl } = await import("./web-image-drop");
    const dataTransfer = createDataTransfer(["text/html", "text/plain"], (type) => {
      if (type === "text/html") {
        return '<img src="https://example.com/from-html.png">';
      }

      return "https://example.com/from-plain.png";
    });

    expect(extractWebImageUrl(dataTransfer)).toBe("https://example.com/from-html.png");
  });

  it("prefers an html image src over a non-image uri-list entry", async () => {
    const { extractWebImageUrl } = await import("./web-image-drop");
    const dataTransfer = createDataTransfer(["text/uri-list", "text/html"], (type) => {
      if (type === "text/uri-list") {
        return "https://example.com/article";
      }

      return '<img src="https://example.com/from-html.png">';
    });

    expect(extractWebImageUrl(dataTransfer)).toBe("https://example.com/from-html.png");
  });

  it("prefers an image src over an earlier non-image src in html", async () => {
    const { extractWebImageUrl } = await import("./web-image-drop");
    const dataTransfer = createDataTransfer(["text/html"], (type) =>
      type === "text/html"
        ? '<script src="https://example.com/not-an-image.js"></script><img src="https://example.com/photo.png">'
        : "",
    );

    expect(extractWebImageUrl(dataTransfer)).toBe("https://example.com/photo.png");
  });

  it("returns null for a plain link drop without an image signal", async () => {
    const { extractWebImageUrl } = await import("./web-image-drop");
    const dataTransfer = createDataTransfer(["text/plain"], (type) =>
      type === "text/plain" ? "https://example.com/article" : "",
    );

    expect(extractWebImageUrl(dataTransfer)).toBeNull();
  });

  it("returns null when the drop already contains files", async () => {
    const { extractWebImageUrl } = await import("./web-image-drop");
    const dataTransfer = createDataTransfer(["text/uri-list", "text/plain"], vi.fn(), createFileList([
      new File(["png"], "image.png", { type: "image/png" }),
    ]));

    expect(extractWebImageUrl(dataTransfer)).toBeNull();
  });

  it("downloads a supported remote image as a file", async () => {
    const { readImageUrlAsFile } = await import("./web-image-drop");
    const response = new Response("png-bytes", {
      headers: { "content-type": "image/png" },
    });
    const fetchMock = vi.fn().mockResolvedValue(response);

    const file = await readImageUrlAsFile("https://example.com/photo.png", fetchMock);

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/photo.png");
    expect(file).toBeInstanceOf(File);
    expect(file?.name).toBe("photo.png");
    expect(file?.type).toBe("image/png");
    await expect(file?.text()).resolves.toBe("png-bytes");
  });

  it("rejects remote assets with unsupported mime types", async () => {
    const { readImageUrlAsFile } = await import("./web-image-drop");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("text", {
        headers: { "content-type": "text/plain" },
      }),
    );

    await expect(readImageUrlAsFile("https://example.com/readme.txt", fetchMock)).rejects.toThrow(
      "Unsupported remote image type: text/plain",
    );
  });

  it("rejects unsuccessful fetch responses before mime validation", async () => {
    const { readImageUrlAsFile } = await import("./web-image-drop");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("missing", {
        status: 404,
        headers: { "content-type": "image/png" },
      }),
    );

    await expect(readImageUrlAsFile("https://example.com/missing.png", fetchMock)).rejects.toThrow(
      "Request failed with status 404",
    );
  });

  it("creates a synthetic drop transfer for a file", async () => {
    const { createSyntheticDropTransfer } = await import("./web-image-drop");
    const file = new File(["png-bytes"], "photo.png", { type: "image/png" });

    const transfer = createSyntheticDropTransfer(file);

    expect(transfer.files.length).toBe(1);
    expect(transfer.files[0]).toBe(file);
    expect(transfer.items.length).toBe(1);
    expect(transfer.items[0]?.getAsFile()).toBe(file);
    expect(Array.from(transfer.types)).toEqual(["Files"]);
  });

  it("creates a fallback synthetic drop transfer with indexed access", async () => {
    vi.stubGlobal("DataTransfer", undefined);

    const { createSyntheticDropTransfer } = await import("./web-image-drop");
    const file = new File(["png-bytes"], "photo.png", { type: "image/png" });

    const transfer = createSyntheticDropTransfer(file);

    expect(transfer.items[0]?.getAsFile()).toBe(file);
    expect(transfer.files[0]).toBe(file);
  });

  it("falls back to a mime-appropriate default filename when the url has no basename", async () => {
    const { readImageUrlAsFile } = await import("./web-image-drop");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("png-bytes", {
        headers: { "content-type": "image/png" },
      }),
    );

    const file = await readImageUrlAsFile("https://example.com/", fetchMock);

    expect(file.name).toBe("image.png");
  });
});
