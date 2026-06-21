export const BOARD_PACK_SCHEMA_VERSION = 1;
export const PACK_ASSET_URL_PREFIX = "phosphene-pack-asset://";

export type BoardPackAsset = {
  id: string;
  path: string;
  mimeType: string;
};

export type BoardPackManifestBoard = {
  id: string;
  name: string;
  description?: string | null;
  path: string;
};

export type BoardPackManifest = {
  schemaVersion: 1;
  workspace: {
    name: string;
    icon?: string | null;
  };
  assets: BoardPackAsset[];
  boards: BoardPackManifestBoard[];
};

export type BoardPackCanvasData = {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

export type BoardPackBoardFile = {
  schemaVersion: 1;
  canvasData: BoardPackCanvasData;
};

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function assertOptionalString(value: unknown, label: string): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }
  return assertString(value, label);
}

function assertSchemaVersion(value: unknown, label: string): 1 {
  if (value !== BOARD_PACK_SCHEMA_VERSION) {
    throw new Error(`Unsupported ${label} schemaVersion ${String(value)}`);
  }
  return BOARD_PACK_SCHEMA_VERSION;
}

function assertArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

export function parseBoardPackManifest(value: unknown): BoardPackManifest {
  const input = assertRecord(value, "Board pack manifest");
  const workspace = assertRecord(input.workspace, "Board pack workspace");
  const assets = assertArray(
    input.assets === undefined ? [] : input.assets,
    "Board pack assets",
  ).map((asset, index) => {
    const record = assertRecord(asset, `Board pack asset ${index}`);
    return {
      id: assertString(record.id, `Board pack asset ${index} id`),
      path: assertString(record.path, `Board pack asset ${index} path`),
      mimeType: assertString(record.mimeType, `Board pack asset ${index} mimeType`),
    };
  });
  const boards = assertArray(input.boards, "Board pack boards").map((board, index) => {
    const record = assertRecord(board, `Board pack board ${index}`);
    return {
      id: assertString(record.id, `Board pack board ${index} id`),
      name: assertString(record.name, `Board pack board ${index} name`),
      description:
        assertOptionalString(record.description, `Board pack board ${index} description`) ?? null,
      path: assertString(record.path, `Board pack board ${index} path`),
    };
  });

  const assetIds = new Set<string>();
  for (const asset of assets) {
    if (assetIds.has(asset.id)) {
      throw new Error(`Duplicate board pack asset id ${asset.id}`);
    }
    assetIds.add(asset.id);
  }

  const boardIds = new Set<string>();
  for (const board of boards) {
    if (boardIds.has(board.id)) {
      throw new Error(`Duplicate board pack board id ${board.id}`);
    }
    boardIds.add(board.id);
  }

  return {
    schemaVersion: assertSchemaVersion(input.schemaVersion, "board pack"),
    workspace: {
      name: assertString(workspace.name, "Board pack workspace name"),
      icon: assertOptionalString(workspace.icon, "Board pack workspace icon") ?? null,
    },
    assets,
    boards,
  };
}

export function parseBoardPackBoardFile(value: unknown): BoardPackBoardFile {
  const input = assertRecord(value, "Board pack board file");
  const canvasData = assertRecord(input.canvasData, "Board pack board canvasData");
  const elements = assertArray(canvasData.elements, "Board pack board elements");
  const appState =
    canvasData.appState === undefined
      ? {}
      : assertRecord(canvasData.appState, "Board pack board appState");
  const files =
    canvasData.files === undefined ? {} : assertRecord(canvasData.files, "Board pack board files");

  return {
    schemaVersion: assertSchemaVersion(input.schemaVersion, "board pack board"),
    canvasData: {
      elements,
      appState,
      files,
    },
  };
}

export function isPackAssetUrl(value: string): boolean {
  return value.startsWith(PACK_ASSET_URL_PREFIX);
}

export function getPackAssetId(value: string): string {
  return value.slice(PACK_ASSET_URL_PREFIX.length);
}
