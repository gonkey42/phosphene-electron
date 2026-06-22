import fs from "node:fs/promises";
import path from "node:path";
import {
  getPackAssetId,
  isPackAssetUrl,
  parseBoardPackBoardFile,
  parseBoardPackManifest,
  type BoardPackBoardFile,
} from "./format";
import {
  createBoard,
  createWorkspace,
  getDatabase,
  saveBoardCanvasDataDirect,
  setActiveWorkspaceIdDirect,
} from "../ipc/database";

export type ImportBoardPackOptions = {
  packDir: string;
  userDataPath: string;
  targetWorkspaceId?: string | null;
};

export type ImportBoardPackResult = {
  workspaceId: string;
  importedBoards: Array<{
    sourceId: string;
    boardId: string;
    name: string;
  }>;
};

const extensionsByMimeType: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/gif": "gif",
  "image/webp": "webp",
};

type ResolvedAsset = {
  id: string;
  path: string;
  mimeType: string;
  extension: string;
  resolvedPath: string;
};

type ResolvedBoard = {
  id: string;
  name: string;
  resolvedPath: string;
};

type ValidatedBoard = ResolvedBoard & {
  boardFile: BoardPackBoardFile;
};

type PreparedImageDestination = {
  relativePath: string;
  destinationPath: string;
};

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${label} JSON: ${message}`);
  }
}

function isPathInsideDirectory(rootPath: string, targetPath: string): boolean {
  const relativeToRoot = path.relative(rootPath, targetPath);
  return (
    relativeToRoot === "" || (!relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot))
  );
}

function assertPathInsideDirectory(rootPath: string, targetPath: string, label: string): void {
  if (!isPathInsideDirectory(rootPath, targetPath)) {
    throw new Error(`Board pack ${label} path must stay within pack directory`);
  }
}

async function resolvePackFilePath(
  realPackRoot: string,
  relativePath: string,
  label: string,
): Promise<string> {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Board pack ${label} path must be relative`);
  }

  const resolvedPath = path.resolve(realPackRoot, relativePath);
  assertPathInsideDirectory(realPackRoot, resolvedPath, label);

  const realResolvedPath = await fs.realpath(resolvedPath);
  assertPathInsideDirectory(realPackRoot, realResolvedPath, label);

  return realResolvedPath;
}

async function readJsonFile(filePath: string, label: string): Promise<unknown> {
  return parseJson(await fs.readFile(filePath, "utf8"), label);
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function isMissingPathError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === "ENOENT" || code === "ENOTDIR";
}

function getSupportedImageExtension(mimeType: string): string {
  const extension = extensionsByMimeType[mimeType];
  if (!extension) {
    throw new Error(`Unsupported board pack asset MIME type: ${mimeType}`);
  }
  return extension;
}

function assertSafeFileId(fileId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) {
    throw new Error(`Board pack file id ${fileId} contains unsafe characters`);
  }
}

function validateCanvasFiles(
  canvasData: BoardPackBoardFile["canvasData"],
  assetsById: Map<string, ResolvedAsset>,
): void {
  for (const [fileId, fileData] of Object.entries(canvasData.files ?? {})) {
    assertSafeFileId(fileId);

    if (typeof fileData !== "object" || fileData === null || Array.isArray(fileData)) {
      continue;
    }

    const dataURL = (fileData as { dataURL?: unknown }).dataURL;
    if (typeof dataURL !== "string" || !isPackAssetUrl(dataURL)) {
      continue;
    }

    const assetId = getPackAssetId(dataURL);
    const asset = assetsById.get(assetId);
    if (!asset) {
      throw new Error(`Board pack asset ${assetId} is not declared in manifest`);
    }
  }
}

function resolveBoardImageDestination(
  realImagesRoot: string,
  boardId: string,
  fileId: string,
  extension: string,
): PreparedImageDestination {
  const relativePath = path.posix.join("images", `${boardId}_${fileId}.${extension}`);
  const destinationPath = path.resolve(realImagesRoot, `${boardId}_${fileId}.${extension}`);

  if (!isPathInsideDirectory(realImagesRoot, destinationPath)) {
    throw new Error("Board pack image destination must stay within images directory");
  }

  return {
    relativePath,
    destinationPath,
  };
}

async function prepareImagesDirectory(imagesDir: string): Promise<string> {
  await fs.mkdir(imagesDir, { recursive: true });

  const imagesDirStats = await fs.lstat(imagesDir);
  if (imagesDirStats.isSymbolicLink()) {
    throw new Error("Board pack images directory must not be a symlink");
  }

  if (!imagesDirStats.isDirectory()) {
    throw new Error("Board pack images directory must be a directory");
  }

  return fs.realpath(imagesDir);
}

function hasPackAssetReferences(validatedBoards: ValidatedBoard[]): boolean {
  return validatedBoards.some((board) =>
    Object.values(board.boardFile.canvasData.files ?? {}).some((fileData) => {
      if (typeof fileData !== "object" || fileData === null || Array.isArray(fileData)) {
        return false;
      }

      const dataURL = (fileData as { dataURL?: unknown }).dataURL;
      return typeof dataURL === "string" && isPackAssetUrl(dataURL);
    }),
  );
}

async function rewriteCanvasFiles(
  canvasData: BoardPackBoardFile["canvasData"],
  boardId: string,
  assetsById: Map<string, ResolvedAsset>,
  realImagesRoot: string | null,
  copiedImagePaths: string[],
): Promise<BoardPackBoardFile["canvasData"]> {
  const rewrittenFiles = { ...canvasData.files };

  for (const [fileId, fileData] of Object.entries(canvasData.files ?? {})) {
    if (typeof fileData !== "object" || fileData === null || Array.isArray(fileData)) {
      continue;
    }

    const dataURL = (fileData as { dataURL?: unknown }).dataURL;
    if (typeof dataURL !== "string" || !isPackAssetUrl(dataURL)) {
      continue;
    }

    const assetId = getPackAssetId(dataURL);
    const asset = assetsById.get(assetId);
    if (!asset) {
      throw new Error(`Board pack asset ${assetId} is not declared in manifest`);
    }

    if (realImagesRoot === null) {
      throw new Error("Board pack images directory was not prepared");
    }

    const { relativePath, destinationPath } = resolveBoardImageDestination(
      realImagesRoot,
      boardId,
      fileId,
      asset.extension,
    );

    copiedImagePaths.push(destinationPath);
    await fs.copyFile(asset.resolvedPath, destinationPath);
    rewrittenFiles[fileId] = {
      ...fileData,
      dataURL: `phosphene-file://${relativePath}`,
    };
  }

  return {
    ...canvasData,
    files: rewrittenFiles,
  };
}

async function resolveManifestAssets(
  realPackRoot: string,
  manifestAssets: ReturnType<typeof parseBoardPackManifest>["assets"],
): Promise<ResolvedAsset[]> {
  return Promise.all(
    manifestAssets.map(
      async (asset): Promise<ResolvedAsset> => ({
        ...asset,
        extension: getSupportedImageExtension(asset.mimeType),
        resolvedPath: await resolvePackFilePath(realPackRoot, asset.path, `asset ${asset.id}`),
      }),
    ),
  );
}

async function resolveManifestBoards(
  realPackRoot: string,
  manifestBoards: ReturnType<typeof parseBoardPackManifest>["boards"],
): Promise<ResolvedBoard[]> {
  return Promise.all(
    manifestBoards.map(
      async (board): Promise<ResolvedBoard> => ({
        id: board.id,
        name: board.name,
        resolvedPath: await resolvePackFilePath(realPackRoot, board.path, `board ${board.id}`),
      }),
    ),
  );
}

async function readAndValidateBoards(
  resolvedBoards: ResolvedBoard[],
  assetsById: Map<string, ResolvedAsset>,
): Promise<ValidatedBoard[]> {
  const validatedBoards: ValidatedBoard[] = [];

  for (const board of resolvedBoards) {
    const boardFile = parseBoardPackBoardFile(
      await readJsonFile(board.resolvedPath, `board pack board ${board.id}`),
    );
    validateCanvasFiles(boardFile.canvasData, assetsById);
    validatedBoards.push({
      ...board,
      boardFile,
    });
  }

  return validatedBoards;
}

function assertTargetWorkspaceExists(
  database: ReturnType<typeof getDatabase>,
  workspaceId: string,
): void {
  const row = database
    .prepare("SELECT id FROM workspaces WHERE id = ? AND deleted_at IS NULL LIMIT 1")
    .get(workspaceId) as { id: string } | undefined;

  if (!row) {
    throw new Error(`Target workspace ${workspaceId} does not exist or has been deleted`);
  }
}

async function cleanupPartialImport(
  database: ReturnType<typeof getDatabase>,
  createdWorkspaceId: string | null,
  createdBoardIds: string[],
  copiedImagePaths: string[],
): Promise<unknown[]> {
  const cleanupFailures: unknown[] = [];

  try {
    const cleanup = database.transaction((boardIds: string[], workspaceId: string | null) => {
      for (const boardId of boardIds) {
        database
          .prepare(
            "UPDATE boards SET deleted_at = datetime('now','utc') WHERE id = ? AND deleted_at IS NULL",
          )
          .run(boardId);
      }

      if (workspaceId !== null) {
        database
          .prepare(
            "UPDATE workspaces SET deleted_at = datetime('now','utc') WHERE id = ? AND deleted_at IS NULL",
          )
          .run(workspaceId);
      }
    });

    cleanup(createdBoardIds, createdWorkspaceId);
  } catch (error) {
    cleanupFailures.push(error);
  }

  for (const copiedImagePath of copiedImagePaths) {
    try {
      await fs.unlink(copiedImagePath);
    } catch (error) {
      if (!isMissingPathError(error)) {
        cleanupFailures.push(error);
      }
    }
  }

  return cleanupFailures;
}

function attachCleanupFailures(importError: unknown, cleanupFailures: unknown[]): void {
  if (cleanupFailures.length === 0 || !(importError instanceof Error)) {
    return;
  }

  try {
    Object.defineProperty(importError, "cleanupFailures", {
      value: cleanupFailures,
      configurable: true,
    });
  } catch {
    // Cleanup metadata must never replace the original import failure.
  }

  if (importError.cause === undefined) {
    try {
      importError.cause = new AggregateError(cleanupFailures, "Board pack import cleanup failed");
    } catch {
      // Cleanup metadata must never replace the original import failure.
    }
  }
}

export async function importBoardPack(
  options: ImportBoardPackOptions,
): Promise<ImportBoardPackResult> {
  const packDir = path.resolve(options.packDir);
  const realPackRoot = await fs.realpath(packDir);
  const manifestPath = await resolvePackFilePath(realPackRoot, "manifest.json", "manifest");
  const manifest = parseBoardPackManifest(await readJsonFile(manifestPath, "board pack manifest"));
  const resolvedAssets = await resolveManifestAssets(realPackRoot, manifest.assets);
  const resolvedBoards = await resolveManifestBoards(realPackRoot, manifest.boards);
  const assetsById = new Map(resolvedAssets.map((asset) => [asset.id, asset]));
  const validatedBoards = await readAndValidateBoards(resolvedBoards, assetsById);
  const database = getDatabase(options.userDataPath);

  if (options.targetWorkspaceId != null) {
    assertTargetWorkspaceExists(database, options.targetWorkspaceId);
  }

  const imagesDir = path.join(options.userDataPath, "images");
  const realImagesRoot = hasPackAssetReferences(validatedBoards)
    ? await prepareImagesDirectory(imagesDir)
    : null;
  const workspaceId =
    options.targetWorkspaceId ??
    createWorkspace(database, manifest.workspace.name, manifest.workspace.icon ?? null);
  const importedBoards: ImportBoardPackResult["importedBoards"] = [];
  const createdWorkspaceId = options.targetWorkspaceId == null ? workspaceId : null;
  const createdBoardIds: string[] = [];
  const copiedImagePaths: string[] = [];

  try {
    for (const board of validatedBoards) {
      const boardId = createBoard(database, board.name, workspaceId);
      createdBoardIds.push(boardId);
      const canvasData = await rewriteCanvasFiles(
        board.boardFile.canvasData,
        boardId,
        assetsById,
        realImagesRoot,
        copiedImagePaths,
      );

      saveBoardCanvasDataDirect(database, boardId, JSON.stringify(canvasData));
      importedBoards.push({
        sourceId: board.id,
        boardId,
        name: board.name,
      });
    }

    setActiveWorkspaceIdDirect(database, workspaceId);
  } catch (error) {
    const cleanupFailures = await cleanupPartialImport(
      database,
      createdWorkspaceId,
      createdBoardIds,
      copiedImagePaths,
    );
    attachCleanupFailures(error, cleanupFailures);
    throw error;
  }

  return {
    workspaceId,
    importedBoards,
  };
}
