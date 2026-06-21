import { describe, expect, it } from "vitest";
import { parseBoardPackManifest, parseBoardPackBoardFile } from "./board-pack-format";

describe("board pack format", () => {
  it("accepts a minimal v1 manifest", () => {
    const manifest = parseBoardPackManifest({
      schemaVersion: 1,
      workspace: { name: "Example Imported Workspace", icon: "*" },
      assets: [],
      boards: [{ id: "board-01", name: "Board 01", path: "boards/board-01.json" }],
    });

    expect(manifest.workspace.name).toBe("Example Imported Workspace");
    expect(manifest.boards).toHaveLength(1);
  });

  it("defaults omitted manifest assets to an empty array", () => {
    const manifest = parseBoardPackManifest({
      schemaVersion: 1,
      workspace: { name: "Example Imported Workspace" },
      boards: [],
    });

    expect(manifest.assets).toEqual([]);
  });

  it("rejects unsupported manifest schema versions", () => {
    expect(() =>
      parseBoardPackManifest({
        schemaVersion: 2,
        workspace: { name: "Example Imported Workspace" },
        assets: [],
        boards: [],
      }),
    ).toThrow("Unsupported board pack schemaVersion 2");
  });

  it("rejects duplicate asset ids", () => {
    expect(() =>
      parseBoardPackManifest({
        schemaVersion: 1,
        workspace: { name: "Example Imported Workspace" },
        assets: [
          { id: "image-1", path: "assets/a.png", mimeType: "image/png" },
          { id: "image-1", path: "assets/b.png", mimeType: "image/png" },
        ],
        boards: [],
      }),
    ).toThrow("Duplicate board pack asset id image-1");
  });

  it("rejects duplicate board ids", () => {
    expect(() =>
      parseBoardPackManifest({
        schemaVersion: 1,
        workspace: { name: "Example Imported Workspace" },
        assets: [],
        boards: [
          { id: "board-01", name: "Board 01", path: "boards/board-01.json" },
          { id: "board-01", name: "Board 02", path: "boards/board-02.json" },
        ],
      }),
    ).toThrow("Duplicate board pack board id board-01");
  });

  it("rejects null manifest assets", () => {
    expect(() =>
      parseBoardPackManifest({
        schemaVersion: 1,
        workspace: { name: "Example Imported Workspace" },
        assets: null,
        boards: [],
      }),
    ).toThrow("Board pack assets must be an array");
  });

  it("accepts a minimal board file", () => {
    const board = parseBoardPackBoardFile({
      schemaVersion: 1,
      canvasData: {
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {},
      },
    });

    expect(board.canvasData.elements).toEqual([]);
  });

  it("defaults omitted board appState and files to empty objects", () => {
    const board = parseBoardPackBoardFile({
      schemaVersion: 1,
      canvasData: {
        elements: [],
      },
    });

    expect(board.canvasData.appState).toEqual({});
    expect(board.canvasData.files).toEqual({});
  });

  it("rejects missing board elements", () => {
    expect(() =>
      parseBoardPackBoardFile({
        schemaVersion: 1,
        canvasData: {
          appState: { viewBackgroundColor: "#ffffff" },
          files: {},
        },
      }),
    ).toThrow("Board pack board elements must be an array");
  });

  it("rejects null board elements", () => {
    expect(() =>
      parseBoardPackBoardFile({
        schemaVersion: 1,
        canvasData: {
          elements: null,
          appState: { viewBackgroundColor: "#ffffff" },
          files: {},
        },
      }),
    ).toThrow("Board pack board elements must be an array");
  });
});
