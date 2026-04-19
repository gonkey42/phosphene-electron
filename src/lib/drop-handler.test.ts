import { beforeEach, describe, expect, it, vi } from "vitest";

const readFileMock = vi.fn();
const readDroppedImageMock = vi.fn();

vi.mock("../platform/desktop-api", () => ({
  storage: {
    readDroppedImage: readDroppedImageMock,
  },
  fs: {
    readFile: readFileMock,
  },
}));

describe("drop handler utilities", () => {
  beforeEach(() => {
    vi.resetModules();
    readFileMock.mockReset();
    readDroppedImageMock.mockReset();
  });

  it("reads a dropped filesystem image path through the storage bridge", async () => {
    const droppedImage = {
      name: "image.PNG",
      mimeType: "image/png",
      data: Uint8Array.from([112, 110, 103]),
    };

    readFileMock.mockResolvedValue(Uint8Array.from([112, 110, 103]));
    readDroppedImageMock.mockResolvedValue(droppedImage);

    const { readImagePathAsFile } = await import("./drop-handler");
    const file = await readImagePathAsFile("/Users/hal9000/Desktop/image.PNG");

    expect(readDroppedImageMock).toHaveBeenCalledWith("/Users/hal9000/Desktop/image.PNG");
    expect(readFileMock).not.toHaveBeenCalled();
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("image.PNG");
    expect(file.type).toBe("image/png");
    await expect(file.text()).resolves.toBe("png");
  });

  it("reads a dropped file as a data url", async () => {
    const readAsDataURL = vi.fn();

    class MockFileReader {
      public result: string | ArrayBuffer | null = null;
      public onload: (() => void) | null = null;
      public onerror: ((error: ProgressEvent<FileReader>) => void) | null = null;

      readAsDataURL(file: File) {
        readAsDataURL(file);
        this.result = "data:image/png;base64,cG5nLWJ5dGVz";
        this.onload?.();
      }
    }

    vi.stubGlobal("FileReader", MockFileReader);

    const { readFileAsDataURL } = await import("./drop-handler");
    const file = new File(["png-bytes"], "image.png", { type: "image/png" });

    await expect(readFileAsDataURL(file)).resolves.toBe("data:image/png;base64,cG5nLWJ5dGVz");
    expect(readAsDataURL).toHaveBeenCalledWith(file);
  });

  it("recognizes the supported image mime types", async () => {
    const { isSupportedImageFile } = await import("./drop-handler");

    expect(isSupportedImageFile(new File(["png"], "image.png", { type: "image/png" }))).toBe(true);
    expect(isSupportedImageFile(new File(["jpg"], "image.jpg", { type: "image/jpeg" }))).toBe(true);
    expect(isSupportedImageFile(new File(["gif"], "image.gif", { type: "image/gif" }))).toBe(true);
    expect(isSupportedImageFile(new File(["svg"], "image.svg", { type: "image/svg+xml" }))).toBe(
      true,
    );
    expect(isSupportedImageFile(new File(["webp"], "image.webp", { type: "image/webp" }))).toBe(
      true,
    );
    expect(isSupportedImageFile(new File(["txt"], "notes.txt", { type: "text/plain" }))).toBe(
      false,
    );
  });

  it("recognizes supported dropped image paths by extension", async () => {
    const { isSupportedImagePath } = await import("./drop-handler");

    expect(isSupportedImagePath("/Users/hal9000/Desktop/image.png")).toBe(true);
    expect(isSupportedImagePath("/Users/hal9000/Desktop/image.JPEG")).toBe(true);
    expect(isSupportedImagePath("/Users/hal9000/Desktop/image.webp")).toBe(true);
    expect(isSupportedImagePath("/Users/hal9000/Desktop/notes.txt")).toBe(false);
  });
});
