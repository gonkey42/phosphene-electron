import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeDatabase,
  createWorkspace,
  getDatabase,
  setActiveWorkspaceIdDirect,
} from "../ipc/database";
import { importBoardPack } from "./importer";

const SAMPLE_IMAGE_BYTES = new Uint8Array([137, 80, 78, 71]);

const tempDirs: string[] = [];

type DatabaseCounts = {
  activeWorkspaces: number;
  boards: number;
};

async function createTempDir(prefix: string): Promise<string> {
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dirPath);
  return dirPath;
}

async function createNestedUserDataPath(): Promise<{ rootDir: string; userDataPath: string }> {
  const rootDir = await createTempDir("phosphene-import-sandbox-");
  const userDataPath = path.join(rootDir, "user-data");
  await fs.mkdir(userDataPath, { recursive: true });
  return { rootDir, userDataPath };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value), "utf8");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function isSymlinkUnsupportedError(error: unknown): boolean {
  return ["EACCES", "ENOSYS", "ENOTSUP", "EPERM"].includes(getErrorCode(error) ?? "");
}

async function replaceWithSymlink(targetPath: string, linkPath: string): Promise<boolean> {
  await fs.rm(linkPath, { force: true });

  try {
    await fs.symlink(targetPath, linkPath);
    return true;
  } catch (error) {
    if (isSymlinkUnsupportedError(error)) {
      return false;
    }
    throw error;
  }
}

function getDatabaseCounts(userDataPath: string): DatabaseCounts {
  const database = getDatabase(userDataPath);
  return {
    activeWorkspaces: (
      database
        .prepare("SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL")
        .get() as { count: number }
    ).count,
    boards: (
      database.prepare("SELECT count(*) as count FROM boards WHERE deleted_at IS NULL").get() as {
        count: number;
      }
    ).count,
  };
}

function createBoardFile(fileId: string | null) {
  return {
    schemaVersion: 1,
    canvasData: {
      elements: [{ id: `element-${fileId ?? "empty"}`, type: fileId ? "image" : "rectangle" }],
      appState: { viewBackgroundColor: "#ffffff" },
      files:
        fileId === null
          ? {}
          : {
              [fileId]: {
                id: fileId,
                mimeType: "image/png",
                dataURL: "phosphene-pack-asset://sample-image",
                created: 1,
                lastRetrieved: 1,
              },
            },
    },
  };
}

function createBoardFileWithTwoImages() {
  return {
    schemaVersion: 1,
    canvasData: {
      elements: [{ id: "element-two-images", type: "image" }],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {
        "file-01": {
          id: "file-01",
          mimeType: "image/png",
          dataURL: "phosphene-pack-asset://sample-image",
          created: 1,
          lastRetrieved: 1,
        },
        "file-02": {
          id: "file-02",
          mimeType: "image/png",
          dataURL: "phosphene-pack-asset://second-image",
          created: 2,
          lastRetrieved: 2,
        },
      },
    },
  };
}

function createBoardFileWithThreeImages() {
  return {
    schemaVersion: 1,
    canvasData: {
      elements: [{ id: "element-three-images", type: "image" }],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {
        "file-01": {
          id: "file-01",
          mimeType: "image/png",
          dataURL: "phosphene-pack-asset://sample-image",
          created: 1,
          lastRetrieved: 1,
        },
        "file-02": {
          id: "file-02",
          mimeType: "image/png",
          dataURL: "phosphene-pack-asset://second-image",
          created: 2,
          lastRetrieved: 2,
        },
        "file-03": {
          id: "file-03",
          mimeType: "image/png",
          dataURL: "phosphene-pack-asset://third-image",
          created: 3,
          lastRetrieved: 3,
        },
      },
    },
  };
}

async function createGenericPack(options: { assetPath?: string; firstBoardPath?: string } = {}) {
  const rootDir = await createTempDir("phosphene-board-pack-");
  const packDir = path.join(rootDir, "pack");
  const firstBoardPath = options.firstBoardPath ?? "boards/board-01.json";
  const assetPath = options.assetPath ?? "assets/sample-image.png";

  await fs.mkdir(packDir, { recursive: true });
  await fs.mkdir(path.join(packDir, "assets"), { recursive: true });
  await fs.writeFile(path.join(packDir, "assets", "sample-image.png"), SAMPLE_IMAGE_BYTES);
  await writeJson(path.join(packDir, "boards", "board-01.json"), createBoardFile("file-01"));
  await writeJson(path.join(packDir, "boards", "board-02.json"), createBoardFile(null));
  await writeJson(path.join(packDir, "manifest.json"), {
    schemaVersion: 1,
    workspace: { name: "Example Imported Workspace", icon: "*" },
    assets: [{ id: "sample-image", path: assetPath, mimeType: "image/png" }],
    boards: [
      { id: "board-01", name: "Board 01", path: firstBoardPath },
      { id: "board-02", name: "Board 02", path: "boards/board-02.json" },
    ],
  });

  return { packDir, rootDir };
}

describe("importBoardPack", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    closeDatabase();
    await Promise.all(
      tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
    );
  });

  it("imports a generic pack into a new workspace and rewrites pack asset URLs", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir } = await createGenericPack();

    const result = await importBoardPack({ packDir, userDataPath });
    const database = getDatabase(userDataPath);
    const workspace = database
      .prepare("SELECT id, name, icon FROM workspaces WHERE id = ? AND deleted_at IS NULL")
      .get(result.workspaceId) as { id: string; name: string; icon: string | null } | undefined;
    const boards = database
      .prepare(
        "SELECT id, workspace_id, name, canvas_data FROM boards WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY position",
      )
      .all(result.workspaceId) as Array<{
      id: string;
      workspace_id: string;
      name: string;
      canvas_data: string | null;
    }>;
    const activeWorkspace = database
      .prepare("SELECT value FROM settings WHERE key = ? LIMIT 1")
      .get("active_workspace_id") as { value: string } | undefined;

    expect(workspace).toEqual({
      id: result.workspaceId,
      name: "Example Imported Workspace",
      icon: "*",
    });
    expect(result.importedBoards.map(({ sourceId, name }) => ({ sourceId, name }))).toEqual([
      { sourceId: "board-01", name: "Board 01" },
      { sourceId: "board-02", name: "Board 02" },
    ]);
    expect(boards.map((board) => board.name)).toEqual(["Board 01", "Board 02"]);
    expect(boards.map((board) => board.id)).toEqual(
      result.importedBoards.map((board) => board.boardId),
    );
    expect(boards.every((board) => board.workspace_id === result.workspaceId)).toBe(true);
    expect(activeWorkspace?.value).toBe(result.workspaceId);

    const boardWithImage = boards[0];
    const boardWithoutImage = boards[1];
    expect(boardWithImage.canvas_data).toEqual(expect.any(String));
    expect(boardWithoutImage.canvas_data).toEqual(expect.any(String));

    const canvasData = JSON.parse(boardWithImage.canvas_data ?? "{}");
    const expectedRelativePath = path.posix.join("images", `${boardWithImage.id}_file-01.png`);
    expect(canvasData.files["file-01"].dataURL).toBe(`phosphene-file://${expectedRelativePath}`);
    expect(JSON.parse(boardWithoutImage.canvas_data ?? "{}").files).toEqual({});

    const expectedImagePath = path.join(userDataPath, expectedRelativePath);
    await expect(fs.access(expectedImagePath)).resolves.toBeUndefined();
  });

  it("imports boards into a supplied target workspace without creating a new one", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir } = await createGenericPack();
    const database = getDatabase(userDataPath);
    const targetWorkspaceId = createWorkspace(database, "Existing Workspace", null);
    const workspaceCountBefore = (
      database
        .prepare("SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL")
        .get() as { count: number }
    ).count;

    const result = await importBoardPack({
      packDir,
      userDataPath,
      targetWorkspace: { type: "id", id: targetWorkspaceId },
    });
    const workspaceCountAfter = (
      database
        .prepare("SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL")
        .get() as { count: number }
    ).count;
    const importedBoardCount = (
      database
        .prepare(
          "SELECT count(*) as count FROM boards WHERE workspace_id = ? AND deleted_at IS NULL",
        )
        .get(targetWorkspaceId) as { count: number }
    ).count;

    expect(result.workspaceId).toBe(targetWorkspaceId);
    expect(workspaceCountAfter).toBe(workspaceCountBefore);
    expect(importedBoardCount).toBe(2);
  });

  it("appends boards when importing repeatedly into the same target workspace", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir } = await createGenericPack();
    const database = getDatabase(userDataPath);
    const targetWorkspace = database
      .prepare("SELECT id FROM workspaces WHERE name = ? AND deleted_at IS NULL LIMIT 1")
      .get("Home") as { id: string };

    const firstResult = await importBoardPack({
      packDir,
      userDataPath,
      targetWorkspace: { type: "id", id: targetWorkspace.id },
    });
    const secondResult = await importBoardPack({
      packDir,
      userDataPath,
      targetWorkspace: { type: "id", id: targetWorkspace.id },
    });

    const activeWorkspaceCount = (
      database
        .prepare("SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL")
        .get() as { count: number }
    ).count;
    const boards = database
      .prepare(
        "SELECT name FROM boards WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY position",
      )
      .all(targetWorkspace.id) as Array<{ name: string }>;
    const activeWorkspace = database
      .prepare("SELECT value FROM settings WHERE key = ? LIMIT 1")
      .get("active_workspace_id") as { value: string } | undefined;

    expect(firstResult.workspaceId).toBe(targetWorkspace.id);
    expect(secondResult.workspaceId).toBe(targetWorkspace.id);
    expect(activeWorkspaceCount).toBe(1);
    expect(boards.map((board) => board.name)).toEqual([
      "Board 01",
      "Board 02",
      "Board 01",
      "Board 02",
    ]);
    expect(activeWorkspace?.value).toBe(targetWorkspace.id);
  });

  it("imports boards into a target workspace selected by exact name", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir } = await createGenericPack();
    const database = getDatabase(userDataPath);
    const targetWorkspaceId = createWorkspace(database, "Vacation Plan", null);
    const workspaceCountBefore = (
      database
        .prepare("SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL")
        .get() as { count: number }
    ).count;

    const result = await importBoardPack({
      packDir,
      userDataPath,
      targetWorkspace: { type: "name", name: "Vacation Plan" },
    });

    const activeWorkspace = database
      .prepare("SELECT value FROM settings WHERE key = ? LIMIT 1")
      .get("active_workspace_id") as { value: string } | undefined;
    const workspaceCountAfter = (
      database
        .prepare("SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL")
        .get() as { count: number }
    ).count;

    expect(result.workspaceId).toBe(targetWorkspaceId);
    expect(workspaceCountAfter).toBe(workspaceCountBefore);
    expect(activeWorkspace?.value).toBe(targetWorkspaceId);
  });

  it("imports boards into the stored active workspace", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir } = await createGenericPack();
    const database = getDatabase(userDataPath);
    const targetWorkspaceId = createWorkspace(database, "Vacation Plan", null);
    setActiveWorkspaceIdDirect(database, targetWorkspaceId);

    const result = await importBoardPack({
      packDir,
      userDataPath,
      targetWorkspace: { type: "active" },
    });

    const importedBoardCount = (
      database
        .prepare(
          "SELECT count(*) as count FROM boards WHERE workspace_id = ? AND deleted_at IS NULL",
        )
        .get(targetWorkspaceId) as { count: number }
    ).count;

    expect(result.workspaceId).toBe(targetWorkspaceId);
    expect(importedBoardCount).toBe(2);
  });

  it("rejects absolute manifest board paths", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir } = await createGenericPack({ firstBoardPath: "/absolute-board.json" });

    await expect(importBoardPack({ packDir, userDataPath })).rejects.toThrow(/relative/i);
  });

  it("rejects absolute manifest asset paths", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir } = await createGenericPack({ assetPath: "/absolute-image.png" });

    await expect(importBoardPack({ packDir, userDataPath })).rejects.toThrow(/relative/i);
  });

  it("rejects manifest board paths that escape the pack directory", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir, rootDir } = await createGenericPack({
      firstBoardPath: "../outside-board.json",
    });
    await writeJson(path.join(rootDir, "outside-board.json"), createBoardFile(null));

    await expect(importBoardPack({ packDir, userDataPath })).rejects.toThrow(/pack directory/i);
  });

  it("rejects manifest asset paths that escape the pack directory", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir, rootDir } = await createGenericPack({ assetPath: "../outside-image.png" });
    await fs.writeFile(path.join(rootDir, "outside-image.png"), SAMPLE_IMAGE_BYTES);

    await expect(importBoardPack({ packDir, userDataPath })).rejects.toThrow(/pack directory/i);
  });

  it("rejects unsafe file IDs before writing outside the user data images directory", async () => {
    const { rootDir, userDataPath } = await createNestedUserDataPath();
    const { packDir } = await createGenericPack();
    const escapedPath = path.join(rootDir, "escape.png");
    await writeJson(
      path.join(packDir, "boards", "board-01.json"),
      createBoardFile("a/../../../escape"),
    );

    await expect(importBoardPack({ packDir, userDataPath })).rejects.toThrow(/file id/i);
    await expect(pathExists(escapedPath)).resolves.toBe(false);
  });

  it("rejects manifest asset symlinks that escape the real pack directory", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir, rootDir } = await createGenericPack();
    const outsideAssetPath = path.join(rootDir, "outside-image.png");
    await fs.writeFile(outsideAssetPath, SAMPLE_IMAGE_BYTES);

    const symlinkCreated = await replaceWithSymlink(
      outsideAssetPath,
      path.join(packDir, "assets", "sample-image.png"),
    );
    if (!symlinkCreated) {
      return;
    }

    await expect(importBoardPack({ packDir, userDataPath })).rejects.toThrow(/pack directory/i);
  });

  it("rejects manifest symlinks that escape the real pack directory", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir, rootDir } = await createGenericPack();
    const outsideManifestPath = path.join(rootDir, "outside-manifest.json");
    await writeJson(outsideManifestPath, {
      schemaVersion: 1,
      workspace: { name: "Example Imported Workspace", icon: "*" },
      assets: [{ id: "sample-image", path: "assets/sample-image.png", mimeType: "image/png" }],
      boards: [
        { id: "board-01", name: "Board 01", path: "boards/board-01.json" },
        { id: "board-02", name: "Board 02", path: "boards/board-02.json" },
      ],
    });

    const symlinkCreated = await replaceWithSymlink(
      outsideManifestPath,
      path.join(packDir, "manifest.json"),
    );
    if (!symlinkCreated) {
      return;
    }

    await expect(importBoardPack({ packDir, userDataPath })).rejects.toThrow(/pack directory/i);
  });

  it("rejects manifest board-file symlinks that escape the real pack directory", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir, rootDir } = await createGenericPack();
    const outsideBoardPath = path.join(rootDir, "outside-board.json");
    await writeJson(outsideBoardPath, createBoardFile(null));

    const symlinkCreated = await replaceWithSymlink(
      outsideBoardPath,
      path.join(packDir, "boards", "board-01.json"),
    );
    if (!symlinkCreated) {
      return;
    }

    await expect(importBoardPack({ packDir, userDataPath })).rejects.toThrow(/pack directory/i);
  });

  it("rejects a symlinked user data images directory before writing outside", async () => {
    const { rootDir, userDataPath } = await createNestedUserDataPath();
    const { packDir } = await createGenericPack();
    const outsideImagesDir = path.join(rootDir, "outside-images");
    await fs.mkdir(outsideImagesDir);

    const symlinkCreated = await replaceWithSymlink(
      outsideImagesDir,
      path.join(userDataPath, "images"),
    );
    if (!symlinkCreated) {
      return;
    }

    await expect(importBoardPack({ packDir, userDataPath })).rejects.toThrow(/images directory/i);
    await expect(fs.readdir(outsideImagesDir)).resolves.toEqual([]);
  });

  it("rejects deleted target workspaces before importing boards", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir } = await createGenericPack();
    const database = getDatabase(userDataPath);
    const targetWorkspaceId = createWorkspace(database, "Deleted Workspace", null);
    database
      .prepare("UPDATE workspaces SET deleted_at = datetime('now','utc') WHERE id = ?")
      .run(targetWorkspaceId);
    const countsBefore = getDatabaseCounts(userDataPath);

    await expect(
      importBoardPack({
        packDir,
        userDataPath,
        targetWorkspace: { type: "id", id: targetWorkspaceId },
      }),
    ).rejects.toThrow(/target workspace/i);
    expect(getDatabaseCounts(userDataPath)).toEqual(countsBefore);
  });

  it("rejects undeclared asset references before creating imported rows", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir } = await createGenericPack();
    await writeJson(path.join(packDir, "manifest.json"), {
      schemaVersion: 1,
      workspace: { name: "Example Imported Workspace", icon: "*" },
      assets: [],
      boards: [
        { id: "board-01", name: "Board 01", path: "boards/board-01.json" },
        { id: "board-02", name: "Board 02", path: "boards/board-02.json" },
      ],
    });
    const countsBefore = getDatabaseCounts(userDataPath);

    await expect(importBoardPack({ packDir, userDataPath })).rejects.toThrow(/not declared/i);
    expect(getDatabaseCounts(userDataPath)).toEqual(countsBefore);
  });

  it("rejects unsupported asset MIME types before creating imported rows", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir } = await createGenericPack();
    await writeJson(path.join(packDir, "manifest.json"), {
      schemaVersion: 1,
      workspace: { name: "Example Imported Workspace", icon: "*" },
      assets: [{ id: "sample-image", path: "assets/sample-image.png", mimeType: "text/plain" }],
      boards: [
        { id: "board-01", name: "Board 01", path: "boards/board-01.json" },
        { id: "board-02", name: "Board 02", path: "boards/board-02.json" },
      ],
    });
    const countsBefore = getDatabaseCounts(userDataPath);

    await expect(importBoardPack({ packDir, userDataPath })).rejects.toThrow(/mime type/i);
    expect(getDatabaseCounts(userDataPath)).toEqual(countsBefore);
  });

  it("cleans up imported rows when asset copying fails after validation", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir } = await createGenericPack();
    const countsBefore = getDatabaseCounts(userDataPath);
    vi.spyOn(fs, "copyFile").mockRejectedValueOnce(
      Object.assign(new Error("source asset disappeared"), { code: "ENOENT" }),
    );

    await expect(importBoardPack({ packDir, userDataPath })).rejects.toThrow(
      /source asset disappeared/i,
    );
    expect(getDatabaseCounts(userDataPath)).toEqual(countsBefore);
  });

  it("removes a partially written image when the copy operation rejects", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir } = await createGenericPack();
    const countsBefore = getDatabaseCounts(userDataPath);
    vi.spyOn(fs, "copyFile").mockImplementationOnce(async (_source, destination) => {
      await fs.writeFile(destination, SAMPLE_IMAGE_BYTES);
      throw Object.assign(new Error("copy failed after partial write"), { code: "EIO" });
    });

    let thrown: unknown;
    try {
      await importBoardPack({ packDir, userDataPath });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("copy failed after partial write");
    expect(getDatabaseCounts(userDataPath)).toEqual(countsBefore);
    await expect(fs.readdir(path.join(userDataPath, "images"))).resolves.toEqual([]);
  });

  it("keeps an existing target workspace when cleaning up a failed targeted import", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir } = await createGenericPack();
    const database = getDatabase(userDataPath);
    const targetWorkspaceId = createWorkspace(database, "Existing Workspace", null);
    vi.spyOn(fs, "copyFile").mockImplementationOnce(async (_source, destination) => {
      await fs.writeFile(destination, SAMPLE_IMAGE_BYTES);
      throw Object.assign(new Error("copy failed after targeted write"), { code: "EIO" });
    });

    await expect(
      importBoardPack({
        packDir,
        userDataPath,
        targetWorkspace: { type: "id", id: targetWorkspaceId },
      }),
    ).rejects.toThrow("copy failed after targeted write");

    const targetWorkspace = database
      .prepare("SELECT deleted_at FROM workspaces WHERE id = ?")
      .get(targetWorkspaceId) as { deleted_at: string | null };
    const activeBoardCount = (
      database
        .prepare(
          "SELECT count(*) as count FROM boards WHERE workspace_id = ? AND deleted_at IS NULL",
        )
        .get(targetWorkspaceId) as { count: number }
    ).count;

    expect(targetWorkspace.deleted_at).toBeNull();
    expect(activeBoardCount).toBe(0);
    await expect(fs.readdir(path.join(userDataPath, "images"))).resolves.toEqual([]);
  });

  it("removes copied images when a later copy fails after validation", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir } = await createGenericPack();
    const originalCopyFile = fs.copyFile;
    await fs.writeFile(path.join(packDir, "assets", "second-image.png"), SAMPLE_IMAGE_BYTES);
    await writeJson(path.join(packDir, "boards", "board-01.json"), createBoardFileWithTwoImages());
    await writeJson(path.join(packDir, "manifest.json"), {
      schemaVersion: 1,
      workspace: { name: "Example Imported Workspace", icon: "*" },
      assets: [
        { id: "sample-image", path: "assets/sample-image.png", mimeType: "image/png" },
        { id: "second-image", path: "assets/second-image.png", mimeType: "image/png" },
      ],
      boards: [
        { id: "board-01", name: "Board 01", path: "boards/board-01.json" },
        { id: "board-02", name: "Board 02", path: "boards/board-02.json" },
      ],
    });
    const countsBefore = getDatabaseCounts(userDataPath);
    vi.spyOn(fs, "copyFile")
      .mockImplementationOnce((source, destination) => originalCopyFile(source, destination))
      .mockRejectedValueOnce(
        Object.assign(new Error("second asset disappeared"), { code: "ENOENT" }),
      );

    await expect(importBoardPack({ packDir, userDataPath })).rejects.toThrow(
      /second asset disappeared/i,
    );
    expect(getDatabaseCounts(userDataPath)).toEqual(countsBefore);
    await expect(fs.readdir(path.join(userDataPath, "images"))).resolves.toEqual([]);
  });

  it("continues image cleanup when one unlink fails and rethrows the original import failure", async () => {
    const userDataPath = await createTempDir("phosphene-user-data-");
    const { packDir } = await createGenericPack();
    const originalCopyFile = fs.copyFile;
    const originalUnlink = fs.unlink;
    await fs.writeFile(path.join(packDir, "assets", "second-image.png"), SAMPLE_IMAGE_BYTES);
    await fs.writeFile(path.join(packDir, "assets", "third-image.png"), SAMPLE_IMAGE_BYTES);
    await writeJson(
      path.join(packDir, "boards", "board-01.json"),
      createBoardFileWithThreeImages(),
    );
    await writeJson(path.join(packDir, "manifest.json"), {
      schemaVersion: 1,
      workspace: { name: "Example Imported Workspace", icon: "*" },
      assets: [
        { id: "sample-image", path: "assets/sample-image.png", mimeType: "image/png" },
        { id: "second-image", path: "assets/second-image.png", mimeType: "image/png" },
        { id: "third-image", path: "assets/third-image.png", mimeType: "image/png" },
      ],
      boards: [
        { id: "board-01", name: "Board 01", path: "boards/board-01.json" },
        { id: "board-02", name: "Board 02", path: "boards/board-02.json" },
      ],
    });
    const countsBefore = getDatabaseCounts(userDataPath);
    vi.spyOn(fs, "copyFile")
      .mockImplementationOnce((source, destination) => originalCopyFile(source, destination))
      .mockImplementationOnce((source, destination) => originalCopyFile(source, destination))
      .mockRejectedValueOnce(
        Object.assign(new Error("third asset disappeared"), { code: "ENOENT" }),
      );
    vi.spyOn(fs, "unlink")
      .mockRejectedValueOnce(Object.assign(new Error("first unlink denied"), { code: "EPERM" }))
      .mockImplementation((filePath) => originalUnlink(filePath));

    let thrown: unknown;
    try {
      await importBoardPack({ packDir, userDataPath });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("third asset disappeared");
    expect(fs.unlink).toHaveBeenCalledTimes(3);
    expect(getDatabaseCounts(userDataPath)).toEqual(countsBefore);
    await expect(fs.readdir(path.join(userDataPath, "images"))).resolves.toHaveLength(1);
  });
});
