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
import { registerDatabaseIPC, closeDatabase } from "./ipc/database";
import { registerFilesystemIPC } from "./ipc/filesystem";
import { registerBrowserIPC } from "./ipc/browser";

const isDev = !app.isPackaged;
const QUIT_FLUSH_TIMEOUT_MS = 1500;
const closeApprovedWindowIds = new Set<number>();
const closeFlushInProgressWindowIds = new Set<number>();
const THEME_PREFERENCE_SELECTED_CHANNEL = "theme:preference-selected";
const THEME_SET_PREFERENCE_CHANNEL = "theme:set-preference";

type ThemePreference = "system" | "light" | "dark";

const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

let currentThemePreference: ThemePreference = "system";
let hasCurrentThemePreference = false;

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

function buildApplicationMenuTemplate(): MenuItemConstructorOptions[] {
  return [
    ...(process.platform === "darwin"
      ? ([{ role: "appMenu" as const }, { role: "fileMenu" as const }] satisfies
          MenuItemConstructorOptions[])
      : [{ role: "fileMenu" as const }]),
    { role: "editMenu" as const },
    { role: "viewMenu" as const },
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
      setThemePreference(preference, true);
    },
  });

  return [
    buildThemeItem("System", "system"),
    buildThemeItem("Light", "light"),
    buildThemeItem("Dark", "dark"),
  ];
}

function insertThemeMenu(menu: Menu) {
  const viewMenuItem = menu.items.find((item) => item.role === "viewMenu");
  const viewSubmenu = viewMenuItem?.submenu;

  if (!viewSubmenu) {
    return;
  }

  viewSubmenu.append(new MenuItem({ type: "separator" }));
  viewSubmenu.append(
    new MenuItem({
      label: "Theme",
      submenu: buildThemeSubmenuTemplate(),
    }),
  );
}

function installApplicationMenu() {
  const menu = Menu.buildFromTemplate(buildApplicationMenuTemplate());
  insertThemeMenu(menu);
  Menu.setApplicationMenu(menu);
}

function setThemePreference(preference: ThemePreference, notifyRenderer: boolean) {
  currentThemePreference = preference;
  hasCurrentThemePreference = true;
  installApplicationMenu();

  if (notifyRenderer) {
    notifyRendererThemePreferenceSelected(preference);
  }
}

function registerThemePreferenceIPC() {
  ipcMain.handle(THEME_SET_PREFERENCE_CHANNEL, async (_event, preference: string) => {
    if (!isThemePreference(preference)) {
      throw new Error(`Invalid theme preference: ${preference}`);
    }

    setThemePreference(preference, false);
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
    mkdirSync(legacyUserDataPath, { recursive: true });
    app.setPath("userData", legacyUserDataPath);
  });

  const userDataPath = app.getPath("userData");

  await runBootstrapPhase("database-ipc", () => {
    registerDatabaseIPC(userDataPath);
  });
  await runBootstrapPhase("filesystem-ipc", () => {
    registerFilesystemIPC(userDataPath);
  });
  await runBootstrapPhase("browser-ipc", () => {
    registerBrowserIPC();
  });
  await runBootstrapPhase("theme-ipc", () => {
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
