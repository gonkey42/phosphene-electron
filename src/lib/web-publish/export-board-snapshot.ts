import { exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { injectImagesFromFilesystem } from "../image-extraction";
import { WEB_PUBLISH_SNAPSHOT_THEME } from "./publish-theme";

export type WorkspaceBoardSnapshotInput = {
  elements: ExcalidrawInitialDataState["elements"];
  appState: ExcalidrawInitialDataState["appState"];
  files: ExcalidrawInitialDataState["files"];
};

const EXCALIDRAW_DEFAULT_LIGHT_BACKGROUND = "#ffffff";
const LIGHT_BACKGROUND_LUMINANCE_THRESHOLD = 0.5;

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

export async function exportWorkspaceBoardSnapshot(
  input: WorkspaceBoardSnapshotInput,
): Promise<Uint8Array> {
  const viewBackgroundColor =
    input.appState?.viewBackgroundColor ?? EXCALIDRAW_DEFAULT_LIGHT_BACKGROUND;
  const exportWithDarkMode = shouldExportWithDarkMode(input.appState?.viewBackgroundColor);
  const hydratedFiles = input.files ? await injectImagesFromFilesystem(input.files) : {};
  const blob = await exportToBlob({
    elements: input.elements ?? [],
    appState: {
      ...(input.appState ?? {}),
      exportBackground: true,
      exportWithDarkMode,
      theme: WEB_PUBLISH_SNAPSHOT_THEME,
      viewBackgroundColor,
    },
    files: hydratedFiles,
    mimeType: "image/png",
    exportPadding: 32,
  });

  return new Uint8Array(await blob.arrayBuffer());
}

function shouldExportWithDarkMode(viewBackgroundColor: string | undefined): boolean {
  return (
    WEB_PUBLISH_SNAPSHOT_THEME === "dark" && isLightOrMissingBackground(viewBackgroundColor)
  );
}

function isLightOrMissingBackground(viewBackgroundColor: string | undefined): boolean {
  if (!viewBackgroundColor) {
    return true;
  }

  const color = parseRgbColor(viewBackgroundColor);
  if (!color) {
    return false;
  }

  return getRelativeLuminance(color) >= LIGHT_BACKGROUND_LUMINANCE_THRESHOLD;
}

function parseRgbColor(color: string): RgbColor | null {
  const normalizedColor = color.trim().toLowerCase();
  if (normalizedColor === "white") {
    return { r: 255, g: 255, b: 255 };
  }
  if (normalizedColor === "black") {
    return { r: 0, g: 0, b: 0 };
  }

  const hexMatch = normalizedColor.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (!hexMatch) {
    return null;
  }

  const hex = hexMatch[1];
  if (hex.length === 3) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }

  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function getRelativeLuminance({ r, g, b }: RgbColor): number {
  const [red, green, blue] = [r, g, b].map((component) => {
    const channel = component / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
