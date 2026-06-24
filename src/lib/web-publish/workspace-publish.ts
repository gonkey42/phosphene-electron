import { webPublish } from "../../platform/desktop-api";
import { exportWorkspaceBoardSnapshot } from "./export-board-snapshot";

type StoredCanvasData = {
  elements?: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

function parseCanvasData(boardId: string, canvasData: string | null): StoredCanvasData {
  if (!canvasData) {
    return { elements: [], appState: {}, files: {} };
  }

  try {
    const parsed = JSON.parse(canvasData) as StoredCanvasData;

    return {
      elements: Array.isArray(parsed.elements) ? parsed.elements : [],
      appState: parsed.appState && typeof parsed.appState === "object" ? parsed.appState : {},
      files: parsed.files && typeof parsed.files === "object" ? parsed.files : {},
    };
  } catch {
    throw new Error(`Board ${boardId} has invalid canvas data and cannot be published`);
  }
}

export async function publishWorkspaceToWeb(workspaceId: string): Promise<void> {
  const prepared = await webPublish.prepareWorkspace(workspaceId);
  const boardImages: Record<string, Uint8Array> = {};

  for (const board of prepared.boards) {
    const canvasData = parseCanvasData(board.id, board.canvasData);
    const pngData = await exportWorkspaceBoardSnapshot({
      elements: canvasData.elements as never,
      appState: canvasData.appState as never,
      files: canvasData.files as never,
    });

    boardImages[board.id] = pngData;
  }

  await webPublish.commitWorkspace({
    workspaceId,
    sourceFingerprint: prepared.sourceFingerprint,
    boardImages,
  });
}

export async function unpublishWorkspaceFromWeb(workspaceId: string): Promise<void> {
  await webPublish.unpublishWorkspace(workspaceId);
}
