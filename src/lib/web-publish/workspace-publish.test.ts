import { beforeEach, describe, expect, it, vi } from "vitest";

const { commitWorkspaceMock, exportWorkspaceBoardSnapshotMock, prepareWorkspaceMock } = vi.hoisted(
  () => ({
    commitWorkspaceMock: vi.fn(),
    exportWorkspaceBoardSnapshotMock: vi.fn(),
    prepareWorkspaceMock: vi.fn(),
  }),
);

vi.mock("../../platform/desktop-api", () => ({
  webPublish: {
    prepareWorkspace: prepareWorkspaceMock,
    commitWorkspace: commitWorkspaceMock,
  },
}));

vi.mock("./export-board-snapshot", () => ({
  exportWorkspaceBoardSnapshot: exportWorkspaceBoardSnapshotMock,
}));

import { publishWorkspaceToWeb } from "./workspace-publish";

function createPreparedBoard(
  id: string,
  canvasData: string | null = JSON.stringify({ elements: [], appState: {}, files: {} }),
) {
  return {
    id,
    name: id,
    position: 0,
    updatedAt: "2026-06-24T00:00:00.000Z",
    canvasData,
  };
}

describe("publishWorkspaceToWeb", () => {
  beforeEach(() => {
    prepareWorkspaceMock.mockReset();
    commitWorkspaceMock.mockReset();
    exportWorkspaceBoardSnapshotMock.mockReset();
    commitWorkspaceMock.mockResolvedValue({ deploymentUrl: null });
  });

  it("prepares, exports every board, and commits the publish payload", async () => {
    const firstPng = new Uint8Array([1, 2, 3]);
    const secondPng = new Uint8Array([4, 5, 6]);

    prepareWorkspaceMock.mockResolvedValue({
      workspace: {
        id: "workspace_1",
        name: "Workspace",
        updatedAt: "2026-06-24T00:00:00.000Z",
      },
      boards: [
        createPreparedBoard(
          "board_1",
          JSON.stringify({
            elements: [{ id: "element_1" }],
            appState: { viewBackgroundColor: "#ffffff" },
            files: { file_1: { id: "file_1" } },
          }),
        ),
        createPreparedBoard(
          "board_2",
          JSON.stringify({
            elements: [{ id: "element_2" }],
            appState: { viewBackgroundColor: "#f8fafc" },
            files: {},
          }),
        ),
      ],
      sourceFingerprint: "fingerprint-abc",
    });
    exportWorkspaceBoardSnapshotMock.mockResolvedValueOnce(firstPng).mockResolvedValueOnce(secondPng);

    await publishWorkspaceToWeb("workspace_1");

    expect(prepareWorkspaceMock).toHaveBeenCalledWith("workspace_1");
    expect(exportWorkspaceBoardSnapshotMock).toHaveBeenCalledTimes(2);
    expect(commitWorkspaceMock).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      sourceFingerprint: "fingerprint-abc",
      boardImages: {
        board_1: firstPng,
        board_2: secondPng,
      },
    });
  });

  it("fails without committing when one board has invalid canvas JSON", async () => {
    prepareWorkspaceMock.mockResolvedValue({
      workspace: {
        id: "workspace_1",
        name: "Workspace",
        updatedAt: "2026-06-24T00:00:00.000Z",
      },
      boards: [createPreparedBoard("board_1", "{")],
      sourceFingerprint: "fingerprint-abc",
    });

    await expect(publishWorkspaceToWeb("workspace_1")).rejects.toThrow(
      "Board board_1 has invalid canvas data and cannot be published",
    );
    expect(commitWorkspaceMock).not.toHaveBeenCalled();
  });

  it("passes the prepare source fingerprint through to commit", async () => {
    prepareWorkspaceMock.mockResolvedValue({
      workspace: {
        id: "workspace_1",
        name: "Workspace",
        updatedAt: "2026-06-24T00:00:00.000Z",
      },
      boards: [createPreparedBoard("board_1")],
      sourceFingerprint: "fingerprint-123",
    });
    exportWorkspaceBoardSnapshotMock.mockResolvedValue(new Uint8Array([7, 8, 9]));

    await publishWorkspaceToWeb("workspace_1");

    expect(commitWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceFingerprint: "fingerprint-123",
      }),
    );
  });
});
