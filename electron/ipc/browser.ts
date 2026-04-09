import { BrowserView, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";

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

const browserViews = new Map<number, BrowserView>();
const browserStates = new Map<number, BrowserState>();
const browserCleanup = new Map<number, () => void>();

function createDefaultState(): BrowserState {
  return {
    url: "",
    title: "",
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
    lastError: null,
  };
}

function getWindowForEvent(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

function getBrowserState(windowId: number): BrowserState {
  return browserStates.get(windowId) ?? createDefaultState();
}

function updateBrowserState(window: BrowserWindow, nextState: Partial<BrowserState>) {
  const state = {
    ...getBrowserState(window.id),
    ...nextState,
  };

  browserStates.set(window.id, state);
  if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
    window.webContents.send("browser:state-changed", state);
  }
}

function teardownBrowserView(
  window: BrowserWindow,
  options: {
    notifyRenderer: boolean;
    closeWebContents: boolean;
  },
) {
  browserCleanup.get(window.id)?.();
  browserCleanup.delete(window.id);

  const browserView = browserViews.get(window.id);
  if (browserView) {
    if (!window.isDestroyed()) {
      window.setBrowserView(null);
    }

    if (options.closeWebContents) {
      browserView.webContents.close();
    }
  }

  browserViews.delete(window.id);
  browserStates.delete(window.id);

  if (options.notifyRenderer) {
    updateBrowserState(window, createDefaultState());
  }
}

function ensureBrowserView(window: BrowserWindow): BrowserView {
  const existingView = browserViews.get(window.id);
  if (existingView) {
    return existingView;
  }

  const browserView = new BrowserView({
    webPreferences: {
      sandbox: true,
    },
  });

  const handleDidStartLoading = () => {
    updateBrowserState(window, {
      isLoading: true,
      lastError: null,
    });
  };

  const handleDidStopLoading = () => {
    updateBrowserState(window, {
      url: browserView.webContents.getURL(),
      title: browserView.webContents.getTitle(),
      canGoBack: browserView.webContents.canGoBack(),
      canGoForward: browserView.webContents.canGoForward(),
      isLoading: false,
      lastError: null,
    });
  };

  const handleDidFailLoad = (_event: unknown, _errorCode: number, errorDescription: string) => {
    updateBrowserState(window, {
      isLoading: false,
      lastError: errorDescription,
    });
  };

  const handleWindowClosed = () => {
    teardownBrowserView(window, {
      notifyRenderer: false,
      closeWebContents: true,
    });
  };

  browserView.webContents.on("did-start-loading", handleDidStartLoading);
  browserView.webContents.on("did-stop-loading", handleDidStopLoading);
  browserView.webContents.on("did-fail-load", handleDidFailLoad);
  window.on("closed", handleWindowClosed);

  browserCleanup.set(window.id, () => {
    browserView.webContents.off("did-start-loading", handleDidStartLoading);
    browserView.webContents.off("did-stop-loading", handleDidStopLoading);
    browserView.webContents.off("did-fail-load", handleDidFailLoad);
    window.off("closed", handleWindowClosed);
  });

  window.setBrowserView(browserView);
  browserViews.set(window.id, browserView);
  browserStates.set(window.id, createDefaultState());
  updateBrowserState(window, createDefaultState());

  return browserView;
}

export function registerBrowserIPC() {
  ipcMain.handle("browser:attach", async (event, bounds: BrowserBounds) => {
    const window = getWindowForEvent(event);
    if (!window) {
      throw new Error("Browser attach requested without an owning BrowserWindow");
    }

    const browserView = ensureBrowserView(window);
    browserView.setBounds(bounds);
  });

  ipcMain.handle("browser:set-bounds", async (event, bounds: BrowserBounds) => {
    const window = getWindowForEvent(event);
    if (!window) {
      return;
    }

    const browserView = ensureBrowserView(window);
    browserView.setBounds(bounds);
  });

  ipcMain.handle("browser:navigate", async (event, url: string) => {
    const window = getWindowForEvent(event);
    if (!window) {
      throw new Error("Browser navigate requested without an owning BrowserWindow");
    }

    const browserView = ensureBrowserView(window);
    await browserView.webContents.loadURL(url);
  });

  ipcMain.handle("browser:back", async (event) => {
    const window = getWindowForEvent(event);
    if (!window) {
      return;
    }

    const browserView = ensureBrowserView(window);
    if (browserView.webContents.canGoBack()) {
      browserView.webContents.goBack();
    }
  });

  ipcMain.handle("browser:forward", async (event) => {
    const window = getWindowForEvent(event);
    if (!window) {
      return;
    }

    const browserView = ensureBrowserView(window);
    if (browserView.webContents.canGoForward()) {
      browserView.webContents.goForward();
    }
  });

  ipcMain.handle("browser:reload", async (event) => {
    const window = getWindowForEvent(event);
    if (!window) {
      return;
    }

    const browserView = ensureBrowserView(window);
    browserView.webContents.reload();
  });

  ipcMain.handle("browser:destroy", async (event) => {
    const window = getWindowForEvent(event);
    if (!window) {
      return;
    }

    if (!browserViews.has(window.id)) {
      return;
    }

    teardownBrowserView(window, {
      notifyRenderer: true,
      closeWebContents: true,
    });
  });
}
