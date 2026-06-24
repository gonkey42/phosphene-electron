import { exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { injectImagesFromFilesystem } from "../image-extraction";

export type WorkspaceBoardSnapshotInput = {
  elements: ExcalidrawInitialDataState["elements"];
  appState: ExcalidrawInitialDataState["appState"];
  files: ExcalidrawInitialDataState["files"];
};

export async function exportWorkspaceBoardSnapshot(
  input: WorkspaceBoardSnapshotInput,
): Promise<Uint8Array> {
  const hydratedFiles = input.files ? await injectImagesFromFilesystem(input.files) : {};
  const blob = await exportToBlob({
    elements: input.elements ?? [],
    appState: {
      ...(input.appState ?? {}),
      exportBackground: true,
      viewBackgroundColor: input.appState?.viewBackgroundColor ?? "#ffffff",
    },
    files: hydratedFiles,
    mimeType: "image/png",
    exportPadding: 32,
  });

  return new Uint8Array(await blob.arrayBuffer());
}
