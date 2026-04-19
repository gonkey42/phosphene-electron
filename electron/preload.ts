/// <reference lib="dom" />
import { contextBridge, ipcRenderer } from "electron";

const LIFECYCLE_FLUSH_REQUEST_EVENT = "phosphene:lifecycle:flush-request";
const LIFECYCLE_FLUSH_COMPLETE_EVENT = "phosphene:lifecycle:flush-complete";
const LIFECYCLE_READY_EVENT = "phosphene:lifecycle:ready";
const LIFECYCLE_READY_FLAG = "__PHOSPHENE_LIFECYCLE_READY__";

type FlushCompletionDetail = {
  requestId: string;
  ok: boolean;
  error?: string;
};

type SerializedFilesystemError = {
  code?: string;
  message: string;
};

type FilesystemResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: SerializedFilesystemError;
    };

type MutationResult = {
  rowsAffected: number;
};

type BrowserBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BrowserState = {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  lastError: string | null;
};

let lifecycleRequestSequence = 0;
let lifecycleReady =
  (window as Window & { [LIFECYCLE_READY_FLAG]?: boolean })[LIFECYCLE_READY_FLAG] === true;

const THEME_PREFERENCE_SELECTED_CHANNEL = "theme:preference-selected";
const THEME_GET_PREFERENCE_CHANNEL = "theme:get-preference";
const THEME_SET_PREFERENCE_CHANNEL = "theme:set-preference";
type ThemePreference = "system" | "light" | "dark";

const themePreferenceSubscribers = new Set<(preference: ThemePreference) => void>();
let lastThemePreferenceSelected: ThemePreference | null = null;
let themePreferenceIpcListener:
  | ((_event: unknown, preference: ThemePreference) => void)
  | null = null;

window.addEventListener(LIFECYCLE_READY_EVENT, () => {
  lifecycleReady = true;
});

function ensureThemePreferenceListener() {
  if (themePreferenceIpcListener) {
    return;
  }

  themePreferenceIpcListener = (_event, preference: ThemePreference) => {
    lastThemePreferenceSelected = preference;
    themePreferenceSubscribers.forEach((subscriber) => {
      subscriber(preference);
    });
  };
  ipcRenderer.on(THEME_PREFERENCE_SELECTED_CHANNEL, themePreferenceIpcListener);
}

ensureThemePreferenceListener();

function isFilesystemResult<T>(value: unknown): value is FilesystemResult<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof (value as { ok: unknown }).ok === "boolean"
  );
}

function deserializeFilesystemError(error: SerializedFilesystemError): Error & { code?: string } {
  const reconstructedError = new Error(error.message) as Error & { code?: string };

  if (error.code) {
    reconstructedError.code = error.code;
  }

  return reconstructedError;
}

async function invokeFilesystem<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = await ipcRenderer.invoke(channel, ...args);

  if (!isFilesystemResult<T>(result)) {
    return result as T;
  }

  if (!result.ok) {
    throw deserializeFilesystemError(result.error);
  }

  return result.value;
}

function requestRendererFlush(requestId: string): Promise<void> {
  if (
    !lifecycleReady &&
    (window as Window & { [LIFECYCLE_READY_FLAG]?: boolean })[LIFECYCLE_READY_FLAG] !== true
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const handleComplete = (event: Event) => {
      const detail = (event as CustomEvent<FlushCompletionDetail>).detail;

      if (detail.requestId !== requestId) {
        return;
      }

      window.removeEventListener(LIFECYCLE_FLUSH_COMPLETE_EVENT, handleComplete);

      if (!detail.ok) {
        reject(new Error(detail.error ?? "Renderer flush failed"));
        return;
      }

      resolve();
    };

    window.addEventListener(LIFECYCLE_FLUSH_COMPLETE_EVENT, handleComplete);
    window.dispatchEvent(
      new CustomEvent(LIFECYCLE_FLUSH_REQUEST_EVENT, {
        detail: { requestId },
      }),
    );
  });
}

ipcRenderer.on("lifecycle:flush-request", (_event, requestId: string) => {
  void requestRendererFlush(requestId)
    .then(() => {
      ipcRenderer.send("lifecycle:flush-response", { requestId, ok: true });
    })
    .catch((error) => {
      ipcRenderer.send("lifecycle:flush-response", {
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
});

contextBridge.exposeInMainWorld("desktop", {
  db: {
    execute(sql: string, params?: unknown[]): Promise<MutationResult> {
      return ipcRenderer.invoke("db:execute", sql, params);
    },
    select<TRows extends readonly unknown[] = unknown[]>(
      sql: string,
      params?: unknown[],
    ): Promise<TRows> {
      return ipcRenderer.invoke("db:select", sql, params);
    },
    backup(destinationPath: string) {
      return ipcRenderer.invoke("db:backup", destinationPath);
    },
  },
  boards: {
    list(workspaceId: string | null = null) {
      return ipcRenderer.invoke("boards:list", workspaceId);
    },
    get(boardId: string) {
      return ipcRenderer.invoke("boards:get", boardId);
    },
    createBoard(name: string, workspaceId: string | null) {
      return ipcRenderer.invoke("boards:create", name, workspaceId);
    },
    rename(boardId: string, name: string) {
      return ipcRenderer.invoke("boards:rename", boardId, name);
    },
    delete(boardId: string) {
      return ipcRenderer.invoke("boards:delete", boardId);
    },
    saveCanvasData(boardId: string, canvasData: string) {
      return ipcRenderer.invoke("boards:save-canvas-data", boardId, canvasData);
    },
    saveThumbnail(boardId: string, thumbnail: string) {
      return ipcRenderer.invoke("boards:save-thumbnail", boardId, thumbnail);
    },
  },
  workspaces: {
    list() {
      return ipcRenderer.invoke("workspaces:list");
    },
    get(workspaceId: string) {
      return ipcRenderer.invoke("workspaces:get", workspaceId);
    },
    createWorkspace(name: string, icon?: string) {
      return ipcRenderer.invoke("workspaces:create", name, icon);
    },
    rename(workspaceId: string, name: string) {
      return ipcRenderer.invoke("workspaces:rename", workspaceId, name);
    },
    delete(workspaceId: string) {
      return ipcRenderer.invoke("workspaces:delete", workspaceId);
    },
    reorderWorkspaces(orderedIds: string[]) {
      return ipcRenderer.invoke("workspaces:reorder", orderedIds);
    },
    getLayout(workspaceId: string) {
      return ipcRenderer.invoke("workspaces:get-layout", workspaceId);
    },
    saveLayout(workspaceId: string, layoutConfig: object) {
      return ipcRenderer.invoke("workspaces:save-layout", workspaceId, layoutConfig);
    },
  },
  settings: {
    getActiveWorkspaceId() {
      return ipcRenderer.invoke("settings:get-active-workspace-id");
    },
    setActiveWorkspaceId(workspaceId: string) {
      return ipcRenderer.invoke("settings:set-active-workspace-id", workspaceId);
    },
  },
  fs: {
    exists(path: string) {
      return invokeFilesystem<boolean>("fs:exists", path);
    },
    mkdir(path: string) {
      return invokeFilesystem<void>("fs:mkdir", path);
    },
    readFile(path: string): Promise<Uint8Array> {
      return invokeFilesystem<Uint8Array>("fs:readFile", path);
    },
    writeFile(path: string, data: Uint8Array) {
      return invokeFilesystem<void>("fs:writeFile", path, data);
    },
    copyFile(src: string, dest: string) {
      return invokeFilesystem<void>("fs:copyFile", src, dest);
    },
    readDir(path: string) {
      return invokeFilesystem<Array<{ name: string }>>("fs:readDir", path);
    },
    remove(path: string) {
      return invokeFilesystem<void>("fs:remove", path);
    },
  },
  paths: {
    appDataDir() {
      return ipcRenderer.invoke("paths:appDataDir");
    },
    join(...parts: string[]) {
      return ipcRenderer.invoke("paths:join", ...parts);
    },
  },
  lifecycle: {
    flushPendingWork() {
      lifecycleRequestSequence += 1;
      return requestRendererFlush(`renderer-${lifecycleRequestSequence}`);
    },
  },
  browser: {
    attach(bounds: BrowserBounds) {
      return ipcRenderer.invoke("browser:attach", bounds);
    },
    setBounds(bounds: BrowserBounds) {
      return ipcRenderer.invoke("browser:set-bounds", bounds);
    },
    navigate(url: string) {
      return ipcRenderer.invoke("browser:navigate", url);
    },
    goBack() {
      return ipcRenderer.invoke("browser:back");
    },
    goForward() {
      return ipcRenderer.invoke("browser:forward");
    },
    reload() {
      return ipcRenderer.invoke("browser:reload");
    },
    destroy() {
      return ipcRenderer.invoke("browser:destroy");
    },
    onStateChanged(callback: (state: BrowserState) => void) {
      const listener = (_event: unknown, state: BrowserState) => {
        callback(state);
      };

      ipcRenderer.on("browser:state-changed", listener);

      return () => {
        ipcRenderer.off("browser:state-changed", listener);
      };
    },
  },
  contextMenu: {
    showAddressInputMenu() {
      return ipcRenderer.invoke("browser:show-address-input-menu");
    },
  },
  theme: {
    getPreference() {
      return ipcRenderer.invoke(THEME_GET_PREFERENCE_CHANNEL);
    },
    setPreference(preference: "system" | "light" | "dark") {
      return ipcRenderer.invoke(THEME_SET_PREFERENCE_CHANNEL, preference);
    },
    onPreferenceSelected(callback: (preference: "system" | "light" | "dark") => void) {
      ensureThemePreferenceListener();
      themePreferenceSubscribers.add(callback);
      if (lastThemePreferenceSelected !== null) {
        callback(lastThemePreferenceSelected);
      }

      return () => {
        themePreferenceSubscribers.delete(callback);
      };
    },
  },
});
