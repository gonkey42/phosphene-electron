import { exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { injectImagesFromFilesystem } from "../image-extraction";
import {
  WEB_PUBLISH_DARK_BOARD_BACKGROUND,
  WEB_PUBLISH_SNAPSHOT_THEME,
} from "./publish-theme";

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
      theme: WEB_PUBLISH_SNAPSHOT_THEME,
      viewBackgroundColor:
        input.appState?.viewBackgroundColor ?? WEB_PUBLISH_DARK_BOARD_BACKGROUND,
    },
    files: hydratedFiles,
    mimeType: "image/png",
    exportPadding: 32,
  });

  return new Uint8Array(await blob.arrayBuffer());
}
