import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { BaseDirectory } from "@tauri-apps/api/path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const writeFileMock = vi.fn();
const readFileMock = vi.fn();
const existsMock = vi.fn();

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeFile: writeFileMock,
  readFile: readFileMock,
  exists: existsMock,
}));

function toBase64(value: string): string {
  return btoa(value);
}

function toBytes(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

type TestFiles = NonNullable<ExcalidrawInitialDataState["files"]>;
type TestFile = TestFiles[string];

function createFile(dataURL: string): TestFile {
  return {
    id: "file-1" as TestFile["id"],
    mimeType: "image/png" as TestFile["mimeType"],
    dataURL: dataURL as TestFile["dataURL"],
    created: 100,
    lastRetrieved: 200,
  } as TestFile;
}

describe("image extraction", () => {
  beforeEach(() => {
    vi.resetModules();
    writeFileMock.mockReset();
    readFileMock.mockReset();
    existsMock.mockReset();
  });

  it("extracts inline Excalidraw image data to the filesystem and rewrites the file reference", async () => {
    const base64Data = toBase64("png-bytes");

    const { extractImagesToFilesystem } = await import("./image-extraction");
    const extractedFiles = await extractImagesToFilesystem("board-1", {
      "file-1": createFile(`data:image/png;base64,${base64Data}`),
    });

    expect(writeFileMock).toHaveBeenCalledWith("images/board-1_file-1.png", toBytes("png-bytes"), {
      baseDir: BaseDirectory.AppData,
    });
    expect(extractedFiles).toEqual({
      "file-1": createFile("phosphene-file://images/board-1_file-1.png"),
    });
  });

  it("injects extracted filesystem images back into inline Excalidraw data URLs", async () => {
    existsMock.mockResolvedValue(true);
    readFileMock.mockResolvedValue(toBytes("png-bytes"));

    const { injectImagesFromFilesystem } = await import("./image-extraction");
    const injectedFiles = await injectImagesFromFilesystem({
      "file-1": createFile("phosphene-file://images/board-1_file-1.png"),
    });

    expect(existsMock).toHaveBeenCalledWith("images/board-1_file-1.png", {
      baseDir: BaseDirectory.AppData,
    });
    expect(readFileMock).toHaveBeenCalledWith("images/board-1_file-1.png", {
      baseDir: BaseDirectory.AppData,
    });
    expect(injectedFiles).toEqual({
      "file-1": createFile(`data:image/png;base64,${toBase64("png-bytes")}`),
    });
  });

  it("keeps the original inline data URL when extraction fails", async () => {
    const base64Data = toBase64("png-bytes");
    const originalFile = createFile(`data:image/png;base64,${base64Data}`);

    writeFileMock.mockRejectedValue(new Error("disk full"));

    const { extractImagesToFilesystem } = await import("./image-extraction");
    await expect(
      extractImagesToFilesystem("board-1", {
        "file-1": originalFile,
      }),
    ).resolves.toEqual({
      "file-1": originalFile,
    });
  });

  it("keeps the filesystem reference when image injection fails", async () => {
    const originalFile = createFile("phosphene-file://images/board-1_file-1.png");

    existsMock.mockResolvedValue(true);
    readFileMock.mockRejectedValue(new Error("permission denied"));

    const { injectImagesFromFilesystem } = await import("./image-extraction");
    await expect(
      injectImagesFromFilesystem({
        "file-1": originalFile,
      }),
    ).resolves.toEqual({
      "file-1": originalFile,
    });
  });
});
