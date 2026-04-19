import { beforeEach, describe, expect, it, vi } from "vitest";

describe("web image drop utilities", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("extracts an image url from dragged html", async () => {
    const { extractWebImageUrl } = await import("./web-image-drop");
    const dataTransfer: Pick<DataTransfer, "files" | "types" | "getData"> = {
      files: [],
      types: ["text/html"],
      getData: (type: string) =>
        type === "text/html"
          ? '<img src="https://example.com/assets/photo.png">'
          : "",
    } as DataTransfer;

    expect(extractWebImageUrl(dataTransfer)).toBe("https://example.com/assets/photo.png");
  });

  it("prefers uri list before plain text", async () => {
    const { extractWebImageUrl } = await import("./web-image-drop");
    const dataTransfer: Pick<DataTransfer, "files" | "types" | "getData"> = {
      files: [],
      types: ["text/uri-list", "text/plain"],
      getData: (type: string) =>
        type === "text/uri-list"
          ? "https://example.com/first.png\nhttps://example.com/second.png"
          : "https://example.com/plain.png",
    } as DataTransfer;

    expect(extractWebImageUrl(dataTransfer)).toBe("https://example.com/first.png");
  });

  it("returns null when the drop already contains files", async () => {
    const { extractWebImageUrl } = await import("./web-image-drop");
    const dataTransfer: Pick<DataTransfer, "files" | "types" | "getData"> = {
      files: [{ name: "image.png" }] as unknown as FileList,
      types: ["text/uri-list", "text/plain"],
      getData: vi.fn(),
    };

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

  it("creates a synthetic drop transfer for a file", async () => {
    const { createSyntheticDropTransfer } = await import("./web-image-drop");
    const file = new File(["png-bytes"], "photo.png", { type: "image/png" });

    const transfer = createSyntheticDropTransfer(file);

    expect(transfer.files.length).toBe(1);
    expect(transfer.files.item(0)).toBe(file);
    expect(transfer.items.length).toBe(1);
    expect(transfer.items.item(0)?.getAsFile()).toBe(file);
    expect(Array.from(transfer.types)).toEqual(["Files"]);
  });
});
