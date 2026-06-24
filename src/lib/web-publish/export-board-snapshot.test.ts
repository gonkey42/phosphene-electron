import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { exportWorkspaceBoardSnapshot } from "./export-board-snapshot";

const exportToBlob = vi.fn();
const injectImagesFromFilesystem = vi.fn(async (files: TestFiles) => ({
  ...files,
  hydrated: createFile("data:image/png;base64,AAAA", "hydrated"),
}));

type TestFiles = NonNullable<ExcalidrawInitialDataState["files"]>;
type TestFile = TestFiles[string];

function createFile(dataURL: string, id = "image1"): TestFile {
  return {
    id: id as TestFile["id"],
    dataURL: dataURL as TestFile["dataURL"],
    mimeType: "image/png" as TestFile["mimeType"],
    created: 1,
  } as TestFile;
}

vi.mock("@excalidraw/excalidraw", () => ({
  exportToBlob: (...args: unknown[]) => exportToBlob(...args),
}));

vi.mock("../image-extraction", () => ({
  injectImagesFromFilesystem: (...args: [TestFiles]) => injectImagesFromFilesystem(...args),
}));

describe("exportWorkspaceBoardSnapshot", () => {
  beforeEach(() => {
    exportToBlob.mockReset();
    injectImagesFromFilesystem.mockClear();
  });

  it("hydrates stored image references and returns PNG bytes", async () => {
    exportToBlob.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
    const files = {
      image1: createFile("phosphene-file://images/image1.png"),
    };

    const bytes = await exportWorkspaceBoardSnapshot({
      elements: [],
      appState: { viewBackgroundColor: "#ffffff" },
      files,
    });

    expect([...bytes]).toEqual([1, 2, 3]);
    expect(injectImagesFromFilesystem).toHaveBeenCalledWith(files);
    expect(exportToBlob).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: "image/png",
        appState: expect.objectContaining({
          exportBackground: true,
          theme: "dark",
          viewBackgroundColor: "#ffffff",
        }),
        files: expect.objectContaining({
          image1: files.image1,
          hydrated: expect.objectContaining({
            id: "hydrated",
            dataURL: "data:image/png;base64,AAAA",
          }),
        }),
      }),
    );
  });

  it("uses the app dark background when a board has no explicit background", async () => {
    exportToBlob.mockResolvedValue(new Blob([new Uint8Array([4, 5, 6])], { type: "image/png" }));

    await exportWorkspaceBoardSnapshot({
      elements: [],
      appState: {},
      files: {},
    });

    expect(exportToBlob).toHaveBeenCalledWith(
      expect.objectContaining({
        appState: expect.objectContaining({
          exportBackground: true,
          theme: "dark",
          viewBackgroundColor: "#08111f",
        }),
      }),
    );
  });

  it("preserves an explicit board background color", async () => {
    exportToBlob.mockResolvedValue(new Blob([new Uint8Array([7, 8, 9])], { type: "image/png" }));

    await exportWorkspaceBoardSnapshot({
      elements: [],
      appState: { viewBackgroundColor: "#123456" },
      files: {},
    });

    expect(exportToBlob).toHaveBeenCalledWith(
      expect.objectContaining({
        appState: expect.objectContaining({
          theme: "dark",
          viewBackgroundColor: "#123456",
        }),
      }),
    );
  });
});
