import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const writeBoardImageMock = vi.fn();
const readBoardImageMock = vi.fn();
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("../platform/desktop-api", () => ({
  storage: {
    writeBoardImage: writeBoardImageMock,
    readBoardImage: readBoardImageMock,
  },
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
    writeBoardImageMock.mockReset();
    readBoardImageMock.mockReset();
    warnSpy.mockClear();
    errorSpy.mockClear();
  });

  it("writes inline image data through the storage bridge and rewrites the file reference", async () => {
    const base64Data = toBase64("png-bytes");
    writeBoardImageMock.mockResolvedValue("images/board-1_file-1.png");

    const { extractImagesToFilesystem } = await import("./image-extraction");
    const extractedFiles = await extractImagesToFilesystem("board-1", {
      "file-1": createFile(`data:image/png;base64,${base64Data}`),
    });

    expect(writeBoardImageMock).toHaveBeenCalledWith(
      "board-1",
      "file-1",
      "image/png",
      toBytes("png-bytes"),
    );
    expect(extractedFiles).toEqual({
      "file-1": createFile("phosphene-file://images/board-1_file-1.png"),
    });
  });

  it("reads board image assets back through the storage bridge", async () => {
    const bytes = toBytes("png-bytes");
    readBoardImageMock.mockResolvedValue(bytes);

    const { injectImagesFromFilesystem } = await import("./image-extraction");
    const injectedFiles = await injectImagesFromFilesystem({
      "file-1": createFile("phosphene-file://images/board-1_file-1.png"),
    });

    expect(readBoardImageMock).toHaveBeenCalledWith("images/board-1_file-1.png");
    expect(injectedFiles).toEqual({
      "file-1": createFile(`data:image/png;base64,${toBase64("png-bytes")}`),
    });
  });

  it("normalizes legacy absolute extracted image refs before rehydrating them", async () => {
    const bytes = toBytes("png-bytes");
    readBoardImageMock.mockResolvedValue(bytes);

    const { injectImagesFromFilesystem } = await import("./image-extraction");
    const injectedFiles = await injectImagesFromFilesystem({
      "file-1": createFile("phosphene-file:///app/data/images/board-1_file-1.png"),
    });

    expect(readBoardImageMock).toHaveBeenCalledWith("images/board-1_file-1.png");
    expect(injectedFiles).toEqual({
      "file-1": createFile(`data:image/png;base64,${toBase64("png-bytes")}`),
    });
  });
});
