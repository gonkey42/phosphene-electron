import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  MenuItem,
  type MenuItemConstructorOptions,
  type WebContents,
} from "electron";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { importBoardPack, type ImportBoardPackResult } from "./board-pack/importer";
import { registerDatabaseIPC, closeDatabase } from "./ipc/database";
import { registerFilesystemIPC } from "./ipc/filesystem";
import { registerBrowserIPC } from "./ipc/browser";
import { registerBoardPackIPC } from "./ipc/board-pack";
import {
  loadPersistedThemePreference,
  persistThemePreference,
} from "./theme-preferences";

const isDev = !app.isPackaged && process.env.NODE_ENV !== "test";

function configureRemoteDebugging(): void {
  const debugPort = process.env.PHOSPHENE_DEBUG_PORT;

  if (!debugPort || app.isPackaged) {
    return;
  }

  if (!/^[0-9]+$/.test(debugPort)) {
    throw new Error("PHOSPHENE_DEBUG_PORT must be numeric");
  }

  app.commandLine.appendSwitch("remote-debugging-port", debugPort);
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
}

configureRemoteDebugging();

const userDataArg = process.argv.find((arg) => arg.startsWith("--user-data-dir="));
const userDataOverride = userDataArg
  ? userDataArg.slice("--user-data-dir=".length)
  : null;
if (userDataOverride) {
  app.setPath("userData", userDataOverride);
}
const QUIT_FLUSH_TIMEOUT_MS = 1500;
const closeApprovedWindowIds = new Set<number>();
const closeFlushInProgressWindowIds = new Set<number>();
const THEME_PREFERENCE_SELECTED_CHANNEL = "theme:preference-selected";
const THEME_GET_PREFERENCE_CHANNEL = "theme:get-preference";
const THEME_SET_PREFERENCE_CHANNEL = "theme:set-preference";
const BOARD_PACK_IMPORTED_CHANNEL = "board-packs:imported";

type ThemePreference = "system" | "light" | "dark";

const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

let currentThemePreference: ThemePreference = "system";
let hasCurrentThemePreference = false;
let themePreferenceUserDataPath: string | null = null;

type FlushResponsePayload = {
  requestId: string;
  ok: boolean;
  error?: string;
};

class RendererFlushError extends Error {
  kind: "failure" | "timeout";

  constructor(kind: "failure" | "timeout", message: string) {
    super(message);
    this.name = "RendererFlushError";
    this.kind = kind;
  }
}

function isFlushResponsePayload(payload: unknown): payload is FlushResponsePayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { requestId?: unknown }).requestId === "string" &&
    typeof (payload as { ok?: unknown }).ok === "boolean" &&
    ("error" in payload
      ? typeof (payload as { error?: unknown }).error === "string" ||
        typeof (payload as { error?: unknown }).error === "undefined"
      : true)
  );
}

class BootstrapError extends Error {
  phase: string;
  cause: unknown;

  constructor(phase: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "BootstrapError";
    this.phase = phase;
    this.cause = cause;
  }
}

function logBootstrapError(error: unknown) {
  const bootstrapError =
    error instanceof BootstrapError ? error : new BootstrapError("startup", error);
  const cause = bootstrapError.cause instanceof Error ? bootstrapError.cause : null;

  console.error("[bootstrap:error]", {
    phase: bootstrapError.phase,
    message: bootstrapError.message,
    stack: cause?.stack,
  });
}

function getBootstrapErrorMessage(error: unknown): string {
  const bootstrapError =
    error instanceof BootstrapError ? error : new BootstrapError("startup", error);

  return `Phosphene could not start during ${bootstrapError.phase}.\n\n${bootstrapError.message}\n\nCheck filesystem permissions or reinstall the app if the preload script is missing.`;
}

function presentBootstrapFailure(title: string, error: unknown) {
  logBootstrapError(error);
  dialog.showErrorBox(title, getBootstrapErrorMessage(error));
}

async function runBootstrapPhase<T>(phase: string, action: () => Promise<T> | T): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw new BootstrapError(phase, error);
  }
}

async function createWindow(): Promise<BrowserWindow> {
  const preloadPath = path.join(__dirname, "preload.js");

  const win = new BrowserWindow({
    title: "Phosphene",
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });
  attachDurableWindowCloseHandler(win);

  win.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      console.error("[window:did-fail-load]", {
        url: validatedURL,
        errorCode,
        errorDescription,
        isMainFrame,
      });
    },
  );
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("[window:render-process-gone]", details);
  });

  try {
    if (isDev) {
      await win.loadURL("http://localhost:5173");
    } else {
      await win.loadFile(path.join(__dirname, "../dist/index.html"));
    }
  } catch (error) {
    if (!win.isDestroyed()) {
      win.destroy();
    }
    throw error;
  }

  syncThemePreferenceToWindow(win);
  win.show();
  return win;
}

function waitForRendererFlush(webContents: WebContents, timeoutMs: number): Promise<void> {
  const requestId = `quit-flush-${webContents.id}-${Date.now()}`;

  return new Promise((resolve, reject) => {
    if (webContents.isDestroyed()) {
      resolve();
      return;
    }

    const cleanup = () => {
      clearTimeout(timeoutId);
      ipcMain.off("lifecycle:flush-response", handleResponse);
      webContents.off("destroyed", handleDestroyed);
    };

    const handleResponse = (event: Electron.IpcMainEvent, payload: unknown) => {
      if (event.sender !== webContents || !isFlushResponsePayload(payload)) {
        return;
      }

      if (payload.requestId !== requestId) {
        return;
      }

      cleanup();

      if (!payload.ok) {
        reject(
          new RendererFlushError(
            "failure",
            payload.error ?? `Renderer ${webContents.id} reported a flush failure`,
          ),
        );
        return;
      }

      resolve();
    };

    const handleDestroyed = () => {
      cleanup();
      resolve();
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(
        new RendererFlushError(
          "timeout",
          `Renderer ${webContents.id} flush timed out after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    ipcMain.on("lifecycle:flush-response", handleResponse);
    webContents.on("destroyed", handleDestroyed);
    webContents.send("lifecycle:flush-request", requestId);
  });
}

function allowWindowClose(window: BrowserWindow) {
  closeApprovedWindowIds.add(window.id);
  window.close();
}

function getFlushLogEvent(scope: "window:close" | "quit", error: unknown) {
  if (scope === "window:close") {
    return error instanceof RendererFlushError && error.kind === "failure"
      ? "[window:close-flush-failure]"
      : "[window:close-flush-timeout]";
  }

  return error instanceof RendererFlushError && error.kind === "failure"
    ? "[quit:flush-failure]"
    : "[quit:flush-timeout]";
}

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && THEME_PREFERENCES.includes(value as ThemePreference);
}

function sendThemePreferenceToWindow(window: BrowserWindow, preference: ThemePreference) {
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    return;
  }

  window.webContents.send(THEME_PREFERENCE_SELECTED_CHANNEL, preference);
}

function notifyRendererThemePreferenceSelected(preference: ThemePreference) {
  BrowserWindow.getAllWindows().forEach((window) => {
    sendThemePreferenceToWindow(window, preference);
  });
}

function sendBoardPackImportedToWindow(window: BrowserWindow, result: ImportBoardPackResult) {
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    return;
  }

  window.webContents.send(BOARD_PACK_IMPORTED_CHANNEL, result);
}

function notifyBoardPackImported(result: ImportBoardPackResult) {
  BrowserWindow.getAllWindows().forEach((window) => {
    sendBoardPackImportedToWindow(window, result);
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function importBoardPackFromDialog(): Promise<void> {
  let packDir: string | null = null;

  try {
    const dialogResult = await dialog.showOpenDialog({
      title: "Import Board Pack",
      buttonLabel: "Import",
      properties: ["openDirectory"],
    });

    if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
      return;
    }

    packDir = dialogResult.filePaths[0];

    const result = await importBoardPack({
      packDir,
      userDataPath: app.getPath("userData"),
    });

    notifyBoardPackImported(result);
  } catch (error) {
    const message = getErrorMessage(error);

    console.error("[board-pack:import-failed]", {
      packDir,
      error: message,
    });
    dialog.showErrorBox(
      "Board pack import failed",
      `Phosphene could not import the selected board pack.\n\n${message}`,
    );
  }
}

function installBoardPackImportMenuItem(menu: Electron.Menu) {
  const fileMenuItem = menu.items.find(
    (item) => item.role === "fileMenu" || item.label === "File",
  );

  if (!fileMenuItem?.submenu) {
    return;
  }

  fileMenuItem.submenu.insert(
    0,
    new MenuItem({
      label: "Import Board Pack...",
      click: () => {
        void importBoardPackFromDialog();
      },
    }),
  );
  fileMenuItem.submenu.insert(1, new MenuItem({ type: "separator" }));
}

function buildApplicationMenuTemplate(): MenuItemConstructorOptions[] {
  return [
    ...(process.platform === "darwin"
      ? ([{ role: "appMenu" as const }, { role: "fileMenu" as const }] satisfies
          MenuItemConstructorOptions[])
      : [{ role: "fileMenu" as const }]),
    { role: "editMenu" as const },
    {
      label: "View",
      submenu: [
        { role: "reload" as const },
        { role: "forceReload" as const },
        { role: "toggleDevTools" as const },
        { type: "separator" as const },
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
        { type: "separator" as const },
        { role: "togglefullscreen" as const },
        { type: "separator" as const },
        {
          label: "Theme",
          submenu: buildThemeSubmenuTemplate(),
        },
      ],
    },
    { role: "windowMenu" as const },
    { role: "help" as const },
  ];
}

function buildThemeSubmenuTemplate(): MenuItemConstructorOptions[] {
  const buildThemeItem = (label: string, preference: ThemePreference): MenuItemConstructorOptions => ({
    label,
    type: "radio",
    checked: currentThemePreference === preference,
    click: () => {
      try {
        setThemePreference(preference, { persist: true, notifyRenderer: true });
      } catch (error) {
        console.error("[theme:menu-selection-failed]", {
          preference,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  return [
    buildThemeItem("System", "system"),
    buildThemeItem("Light", "light"),
    buildThemeItem("Dark", "dark"),
  ];
}

function installApplicationMenu() {
  const menu = Menu.buildFromTemplate(buildApplicationMenuTemplate());
  installBoardPackImportMenuItem(menu);
  Menu.setApplicationMenu(menu);
}

function getThemePreferenceUserDataPath(): string {
  if (!themePreferenceUserDataPath) {
    throw new Error("Theme preference persistence is not initialized");
  }

  return themePreferenceUserDataPath;
}

function setThemePreference(
  preference: ThemePreference,
  options: {
    persist: boolean;
    notifyRenderer: boolean;
  },
) {
  if (options.persist) {
    persistThemePreference(getThemePreferenceUserDataPath(), preference);
  }

  currentThemePreference = preference;
  hasCurrentThemePreference = true;
  installApplicationMenu();

  if (options.notifyRenderer) {
    notifyRendererThemePreferenceSelected(preference);
  }
}

function hydratePersistedThemePreference() {
  currentThemePreference = loadPersistedThemePreference(getThemePreferenceUserDataPath());
  hasCurrentThemePreference = true;
}

function getThemePreference(): ThemePreference {
  if (!hasCurrentThemePreference) {
    hydratePersistedThemePreference();
  }

  return currentThemePreference;
}

function registerThemePreferenceIPC() {
  ipcMain.handle(THEME_GET_PREFERENCE_CHANNEL, async () => getThemePreference());
  ipcMain.handle(THEME_SET_PREFERENCE_CHANNEL, async (_event, preference: string) => {
    if (!isThemePreference(preference)) {
      throw new Error(`Invalid theme preference: ${preference}`);
    }

    setThemePreference(preference, { persist: true, notifyRenderer: true });
  });
}

function syncThemePreferenceToWindow(window: BrowserWindow) {
  if (!hasCurrentThemePreference) {
    return;
  }

  sendThemePreferenceToWindow(window, currentThemePreference);
}

export function attachDurableWindowCloseHandler(window: BrowserWindow) {
  window.on("close", (event) => {
    if (quitFlushComplete || closeApprovedWindowIds.has(window.id)) {
      closeApprovedWindowIds.delete(window.id);
      return;
    }

    event.preventDefault();

    if (closeFlushInProgressWindowIds.has(window.id)) {
      return;
    }

    closeFlushInProgressWindowIds.add(window.id);

    void waitForRendererFlush(window.webContents, QUIT_FLUSH_TIMEOUT_MS)
      .catch((error) => {
        console.error(getFlushLogEvent("window:close", error), {
          windowId: window.id,
          timeoutMs: QUIT_FLUSH_TIMEOUT_MS,
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        closeFlushInProgressWindowIds.delete(window.id);

        if (window.isDestroyed()) {
          return;
        }

        allowWindowClose(window);
      });
  });
}

async function flushRenderersBeforeQuit() {
  const windows = BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed());
  const results = await Promise.allSettled(
    windows.map((window) => waitForRendererFlush(window.webContents, QUIT_FLUSH_TIMEOUT_MS)),
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(getFlushLogEvent("quit", result.reason), {
        windowId: windows[index]?.id,
        timeoutMs: QUIT_FLUSH_TIMEOUT_MS,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });
}

async function bootstrap() {
  const legacyUserDataPath = path.join(app.getPath("appData"), "app.phosphene.desktop");

  await runBootstrapPhase("user-data", () => {
    if (userDataOverride) {
      mkdirSync(userDataOverride, { recursive: true });
      app.setPath("userData", userDataOverride);
    } else {
      mkdirSync(legacyUserDataPath, { recursive: true });
      app.setPath("userData", legacyUserDataPath);
    }
  });

  const userDataPath = app.getPath("userData");
  themePreferenceUserDataPath = userDataPath;

  await runBootstrapPhase("database-ipc", () => {
    registerDatabaseIPC(userDataPath);
  });
  await runBootstrapPhase("filesystem-ipc", () => {
    registerFilesystemIPC(userDataPath);
  });
  await runBootstrapPhase("board-pack-ipc", () => {
    registerBoardPackIPC(userDataPath);
  });
  await runBootstrapPhase("browser-ipc", () => {
    registerBrowserIPC();
  });
  await runBootstrapPhase("theme-ipc", () => {
    hydratePersistedThemePreference();
    registerThemePreferenceIPC();
    installApplicationMenu();
  });
  await runBootstrapPhase("create-window", async () => {
    await createWindow();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().catch((error) => {
        presentBootstrapFailure(
          "Phosphene could not reopen a window",
          new BootstrapError("activate-create-window", error),
        );
      });
    }
  });
}

void app.whenReady().then(bootstrap).catch((error) => {
  presentBootstrapFailure("Phosphene failed to start", error);
  app.quit();
});

let quitFlushComplete = false;
let quitFlushInProgress = false;

app.on("before-quit", (event) => {
  if (quitFlushComplete || quitFlushInProgress) {
    return;
  }

  event.preventDefault();
  quitFlushInProgress = true;

  void flushRenderersBeforeQuit()
    .catch((error) => {
      console.error("[quit:flush-failed]", error);
    })
    .finally(() => {
      quitFlushComplete = true;
      quitFlushInProgress = false;
      app.quit();
    });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  closeDatabase();
});
