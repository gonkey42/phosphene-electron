interface DesktopBoardListItem {
  id: string;
  workspaceId: string | null;
  name: string;
  description: string | null;
  position: number;
  updatedAt: string;
}

interface DesktopBoardRecord {
  id: string;
  workspaceId: string | null;
  name: string;
  description: string | null;
  canvasData: string | null;
  thumbnail: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface DesktopBoardsAPI {
  list(workspaceId?: string | null): Promise<DesktopBoardListItem[]>;
  get(boardId: string): Promise<DesktopBoardRecord | null>;
  createBoard(name: string, workspaceId: string | null): Promise<string>;
  rename(boardId: string, name: string): Promise<void>;
  delete(boardId: string): Promise<void>;
  saveCanvasData(boardId: string, canvasData: string): Promise<void>;
  saveThumbnail(boardId: string, thumbnail: string): Promise<void>;
}

interface DesktopWorkspaceListItem {
  id: string;
  name: string;
  icon: string | null;
  position: number;
}

interface DesktopWorkspaceRecord {
  id: string;
  name: string;
  icon: string | null;
  position: number;
  layoutConfig: object | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface DesktopWorkspacesAPI {
  list(): Promise<DesktopWorkspaceListItem[]>;
  get(workspaceId: string): Promise<DesktopWorkspaceRecord | null>;
  createWorkspace(name: string, icon?: string): Promise<string>;
  rename(workspaceId: string, name: string): Promise<void>;
  delete(workspaceId: string): Promise<boolean>;
  reorderWorkspaces(orderedIds: string[]): Promise<void>;
  getLayout(workspaceId: string): Promise<object | null>;
  saveLayout(workspaceId: string, layoutConfig: object): Promise<void>;
}

interface DesktopSettingsAPI {
  getActiveWorkspaceId(): Promise<string | null>;
  setActiveWorkspaceId(workspaceId: string): Promise<void>;
}

interface DesktopStorageAPI {
  ensureDirectories(): Promise<void>;
  runDailyBackup(): Promise<
    | {
        status: "created";
        destinationPath: string;
      }
    | {
        status: "skipped";
        reason: "already-exists";
        destinationPath: string;
      }
    | {
        status: "failed";
        reason: "permission-denied" | "destination-missing" | "backup-failed";
        destinationPath: string;
        message: string;
      }
  >;
  readDroppedImage(path: string): Promise<{
    name: string;
    mimeType: string;
    data: Uint8Array;
  }>;
  readRemoteImage(url: string): Promise<{
    name: string;
    mimeType: string;
    data: Uint8Array;
  }>;
  writeBoardImage(boardId: string, fileId: string, mimeType: string, data: Uint8Array): Promise<string>;
  readBoardImage(path: string): Promise<Uint8Array | null>;
}

interface DesktopLifecycle {
  flushPendingWork(): Promise<void>;
}

type DesktopBrowserBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DesktopBrowserState = {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  lastError: string | null;
};

interface DesktopBrowserAPI {
  attach(bounds: DesktopBrowserBounds): Promise<void>;
  setBounds(bounds: DesktopBrowserBounds): Promise<void>;
  navigate(url: string): Promise<void>;
  goBack(): Promise<void>;
  goForward(): Promise<void>;
  reload(): Promise<void>;
  destroy(): Promise<void>;
  onStateChanged(callback: (state: DesktopBrowserState) => void): () => void;
}

interface DesktopContextMenuAPI {
  showAddressInputMenu(): Promise<void>;
}

interface DesktopBoardPackImportResult {
  workspaceId: string;
  importedBoards: Array<{
    sourceId: string;
    boardId: string;
    name: string;
  }>;
}

type DesktopBoardPackImportSelectorKey =
  | "targetWorkspaceId"
  | "targetWorkspaceName"
  | "targetActiveWorkspace";

type DesktopTargetWorkspaceIdImportOption = {
  targetWorkspaceId: string;
};

type DesktopTargetWorkspaceNameImportOption = {
  targetWorkspaceName: string;
};

type DesktopTargetActiveWorkspaceImportOption = {
  targetActiveWorkspace: true;
};

type DesktopBoardPackImportOption =
  | DesktopTargetWorkspaceIdImportOption
  | DesktopTargetWorkspaceNameImportOption
  | DesktopTargetActiveWorkspaceImportOption;

type DesktopBoardPackImportSelectorKeys<T> = Extract<
  keyof T,
  DesktopBoardPackImportSelectorKey
>;

type DesktopBoardPackImportIsUnion<T, U = T> = [T] extends [never]
  ? false
  : T extends unknown
    ? [U] extends [T]
      ? false
      : true
    : false;

type DesktopBoardPackImportKnownOptionKeysOnly<T> =
  Exclude<keyof T, DesktopBoardPackImportSelectorKey> extends never ? T : never;

type DesktopExactBoardPackImportOptions<T> =
  DesktopBoardPackImportIsUnion<T> extends true
    ? never
    : T extends DesktopTargetWorkspaceIdImportOption
      ? DesktopBoardPackImportSelectorKeys<T> extends "targetWorkspaceId"
        ? DesktopBoardPackImportKnownOptionKeysOnly<T>
        : never
      : T extends DesktopTargetWorkspaceNameImportOption
        ? DesktopBoardPackImportSelectorKeys<T> extends "targetWorkspaceName"
          ? DesktopBoardPackImportKnownOptionKeysOnly<T>
          : never
        : T extends DesktopTargetActiveWorkspaceImportOption
          ? DesktopBoardPackImportSelectorKeys<T> extends "targetActiveWorkspace"
            ? DesktopBoardPackImportKnownOptionKeysOnly<T>
            : never
          : never;

type DesktopBoardPackImportOptions<
  T extends DesktopBoardPackImportOption,
> = T & DesktopExactBoardPackImportOptions<T>;

type DesktopBoardPackImportIdOptions =
  DesktopBoardPackImportOptions<DesktopTargetWorkspaceIdImportOption>;

type DesktopBoardPackImportNameOptions =
  DesktopBoardPackImportOptions<DesktopTargetWorkspaceNameImportOption>;

type DesktopBoardPackImportActiveOptions =
  DesktopBoardPackImportOptions<DesktopTargetActiveWorkspaceImportOption>;

interface DesktopBoardPacksAPI {
  importFolder<const T extends DesktopBoardPackImportOption>(
    packDir: string,
    options?: DesktopBoardPackImportOptions<T>,
  ): Promise<DesktopBoardPackImportResult>;
  onImported(callback: (result: DesktopBoardPackImportResult) => void): () => void;
}

type DesktopWebPublishState = "not-online" | "online" | "changed-since-publish" | "publish-failed";

interface DesktopWebPublishWorkspaceState {
  state: DesktopWebPublishState;
  hasPublishedSnapshot: boolean;
  lastError: string | null;
  lastDeploymentUrl: string | null;
}

interface DesktopWebPublishPreparedWorkspace {
  workspace: {
    id: string;
    name: string;
    updatedAt: string;
  };
  boards: Array<{
    id: string;
    name: string;
    position: number;
    updatedAt: string;
    canvasData: string | null;
  }>;
  sourceFingerprint: string;
}

interface DesktopWebPublishCommitPayload {
  workspaceId: string;
  sourceFingerprint: string;
  boardImages: Record<string, Uint8Array>;
}

interface DesktopWebPublishDeploymentResult {
  deploymentUrl: string | null;
}

interface DesktopWebPublishAPI {
  listStates(): Promise<Record<string, DesktopWebPublishWorkspaceState>>;
  prepareWorkspace(workspaceId: string): Promise<DesktopWebPublishPreparedWorkspace>;
  commitWorkspace(
    payload: DesktopWebPublishCommitPayload,
  ): Promise<DesktopWebPublishDeploymentResult>;
  unpublishWorkspace(workspaceId: string): Promise<DesktopWebPublishDeploymentResult>;
}

type DesktopThemePreference = "system" | "light" | "dark";

interface DesktopThemeAPI {
  getPreference(): Promise<DesktopThemePreference>;
  setPreference(preference: DesktopThemePreference): Promise<void>;
  onPreferenceSelected(callback: (preference: DesktopThemePreference) => void): () => void;
}

interface DesktopAPI {
  boards: DesktopBoardsAPI;
  workspaces: DesktopWorkspacesAPI;
  storage: DesktopStorageAPI;
  lifecycle: DesktopLifecycle;
  browser: DesktopBrowserAPI;
  contextMenu: DesktopContextMenuAPI;
  boardPacks: DesktopBoardPacksAPI;
  webPublish: DesktopWebPublishAPI;
  settings: DesktopSettingsAPI;
  theme: DesktopThemeAPI;
}

interface Window {
  desktop: DesktopAPI;
}
