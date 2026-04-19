const LIFECYCLE_FLUSH_REQUEST_EVENT = "phosphene:lifecycle:flush-request";
const LIFECYCLE_FLUSH_COMPLETE_EVENT = "phosphene:lifecycle:flush-complete";
const LIFECYCLE_READY_EVENT = "phosphene:lifecycle:ready";
const LIFECYCLE_READY_FLAG = "__PHOSPHENE_LIFECYCLE_READY__";
const LIFECYCLE_SHARED_STATE_KEY = "__PHOSPHENE_LIFECYCLE_SHARED_STATE__";

export type DatabaseBackupResult =
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
    };

export type BoardListItem = {
  id: string;
  workspaceId: string | null;
  name: string;
  description: string | null;
  position: number;
  updatedAt: string;
};

export type BoardRecord = {
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
};

export type WorkspaceListItem = {
  id: string;
  name: string;
  icon: string | null;
  position: number;
};

export type WorkspaceRecord = {
  id: string;
  name: string;
  icon: string | null;
  position: number;
  layoutConfig: object | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type BrowserBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrowserState = {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  lastError: string | null;
};

type PendingWorkHandler = () => Promise<void> | void;
type FlushCompletionDetail = {
  requestId: string;
  ok: boolean;
  error?: string;
};
type LifecycleSharedState = {
  listenersBound: boolean;
  pendingWorkHandlers: Set<PendingWorkHandler>;
};

type LifecycleWindow = Window & {
  [LIFECYCLE_READY_FLAG]?: boolean;
  [LIFECYCLE_SHARED_STATE_KEY]?: LifecycleSharedState;
};

function getDesktop(): DesktopAPI {
  if (!window.desktop) {
    throw new Error("Desktop API not available — is the preload script loaded?");
  }
  return window.desktop;
}

function getLifecycleSharedState(): LifecycleSharedState {
  const lifecycleWindow = window as LifecycleWindow;
  lifecycleWindow[LIFECYCLE_SHARED_STATE_KEY] ??= {
    listenersBound: false,
    pendingWorkHandlers: new Set<PendingWorkHandler>(),
  };
  return lifecycleWindow[LIFECYCLE_SHARED_STATE_KEY]!;
}

async function flushRegisteredPendingWork(): Promise<void> {
  const handlers = Array.from(getLifecycleSharedState().pendingWorkHandlers);
  const results = await Promise.allSettled(
    handlers.map((handler) => Promise.resolve().then(() => handler())),
  );
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  if (rejected) {
    throw rejected.reason;
  }
}

function dispatchFlushCompletion(detail: FlushCompletionDetail) {
  window.dispatchEvent(new CustomEvent<FlushCompletionDetail>(LIFECYCLE_FLUSH_COMPLETE_EVENT, { detail }));
}

function ensureLifecycleListeners() {
  if (typeof window === "undefined") {
    return;
  }

  const sharedState = getLifecycleSharedState();
  if (sharedState.listenersBound) {
    return;
  }

  sharedState.listenersBound = true;

  window.addEventListener(LIFECYCLE_FLUSH_REQUEST_EVENT, (event) => {
    const { requestId } = (event as CustomEvent<{ requestId: string }>).detail;

    void flushRegisteredPendingWork()
      .then(() => {
        dispatchFlushCompletion({ requestId, ok: true });
      })
      .catch((error) => {
        dispatchFlushCompletion({
          requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  });

  window.addEventListener("beforeunload", () => {
    void flushRegisteredPendingWork().catch((error) => {
      console.error("[Lifecycle] Failed to flush pending work during beforeunload", error);
    });
  });

  (window as LifecycleWindow)[LIFECYCLE_READY_FLAG] = true;
  window.dispatchEvent(new Event(LIFECYCLE_READY_EVENT));
}

ensureLifecycleListeners();

export const boards = {
  list(workspaceId: string | null = null) {
    return getDesktop().boards.list(workspaceId);
  },
  get(boardId: string) {
    return getDesktop().boards.get(boardId);
  },
  createBoard(name: string, workspaceId: string | null): Promise<string> {
    return getDesktop().boards.createBoard(name, workspaceId);
  },
  rename(boardId: string, name: string) {
    return getDesktop().boards.rename(boardId, name);
  },
  delete(boardId: string) {
    return getDesktop().boards.delete(boardId);
  },
  saveCanvasData(boardId: string, canvasData: string) {
    return getDesktop().boards.saveCanvasData(boardId, canvasData);
  },
  saveThumbnail(boardId: string, thumbnail: string) {
    return getDesktop().boards.saveThumbnail(boardId, thumbnail);
  },
};

export const workspaces = {
  list() {
    return getDesktop().workspaces.list();
  },
  get(workspaceId: string) {
    return getDesktop().workspaces.get(workspaceId);
  },
  createWorkspace(name: string, icon?: string): Promise<string> {
    return getDesktop().workspaces.createWorkspace(name, icon);
  },
  rename(workspaceId: string, name: string) {
    return getDesktop().workspaces.rename(workspaceId, name);
  },
  delete(workspaceId: string) {
    return getDesktop().workspaces.delete(workspaceId);
  },
  reorderWorkspaces(orderedIds: string[]): Promise<void> {
    return getDesktop().workspaces.reorderWorkspaces(orderedIds);
  },
  getLayout(workspaceId: string) {
    return getDesktop().workspaces.getLayout(workspaceId);
  },
  saveLayout(workspaceId: string, layoutConfig: object) {
    return getDesktop().workspaces.saveLayout(workspaceId, layoutConfig);
  },
};

export const settings = {
  getActiveWorkspaceId() {
    return getDesktop().settings.getActiveWorkspaceId();
  },
  setActiveWorkspaceId(workspaceId: string) {
    return getDesktop().settings.setActiveWorkspaceId(workspaceId);
  },
};

export const storage = {
  ensureDirectories() {
    return getDesktop().storage.ensureDirectories();
  },
  runDailyBackup() {
    return getDesktop().storage.runDailyBackup();
  },
  readDroppedImage(path: string) {
    return getDesktop().storage.readDroppedImage(path);
  },
  readRemoteImage(url: string) {
    return getDesktop().storage.readRemoteImage(url);
  },
  writeBoardImage(boardId: string, fileId: string, mimeType: string, data: Uint8Array) {
    return getDesktop().storage.writeBoardImage(boardId, fileId, mimeType, data);
  },
  readBoardImage(path: string) {
    return getDesktop().storage.readBoardImage(path);
  },
};

export const lifecycle = {
  flushPendingWork() {
    ensureLifecycleListeners();
    return getDesktop().lifecycle.flushPendingWork();
  },
  registerPendingWork(handler: PendingWorkHandler) {
    ensureLifecycleListeners();
    const { pendingWorkHandlers } = getLifecycleSharedState();
    pendingWorkHandlers.add(handler);

    return () => {
      pendingWorkHandlers.delete(handler);
    };
  },
};

export const browser = {
  attach(bounds: BrowserBounds) {
    return getDesktop().browser.attach(bounds);
  },
  setBounds(bounds: BrowserBounds) {
    return getDesktop().browser.setBounds(bounds);
  },
  navigate(url: string) {
    return getDesktop().browser.navigate(url);
  },
  goBack() {
    return getDesktop().browser.goBack();
  },
  goForward() {
    return getDesktop().browser.goForward();
  },
  reload() {
    return getDesktop().browser.reload();
  },
  destroy() {
    return getDesktop().browser.destroy();
  },
  onStateChanged(callback: (state: BrowserState) => void) {
    return getDesktop().browser.onStateChanged(callback);
  },
};

export const contextMenu = {
  showAddressInputMenu() {
    return getDesktop().contextMenu.showAddressInputMenu();
  },
};

export const theme = {
  getPreference() {
    return getDesktop().theme.getPreference();
  },
  setPreference(preference: "system" | "light" | "dark") {
    return getDesktop().theme.setPreference(preference);
  },
  onPreferenceSelected(callback: (preference: "system" | "light" | "dark") => void) {
    return getDesktop().theme.onPreferenceSelected(callback);
  },
};
