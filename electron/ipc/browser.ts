import {
  BrowserView,
  BrowserWindow,
  Menu,
  ipcMain,
  type ContextMenuParams,
  type IpcMainInvokeEvent,
} from "electron";

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
const hiddenBrowserWindows = new Set<number>();
const browserOwnerTokens = new Map<number, string>();

const ALLOWED_BROWSER_URL_SCHEMES = new Set(["http:", "https:", "about:"]);

function assertAllowedBrowserUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid browser URL: ${url}`);
  }

  if (!ALLOWED_BROWSER_URL_SCHEMES.has(parsed.protocol)) {
    throw new Error(`Unsafe URL scheme for browser navigation: ${parsed.protocol}`);
  }
}

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

function isZeroBrowserBounds(bounds: BrowserBounds): boolean {
  return bounds.width <= 0 || bounds.height <= 0;
}

function isBrowserOwnerRequestAllowed(windowId: number, ownerToken?: string): boolean {
  const currentOwnerToken = browserOwnerTokens.get(windowId);

  return currentOwnerToken ? ownerToken === currentOwnerToken : ownerToken === undefined;
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
  hiddenBrowserWindows.delete(window.id);
  browserOwnerTokens.delete(window.id);

  if (options.notifyRenderer) {
    updateBrowserState(window, createDefaultState());
  }
}

function ensureBrowserView(
  window: BrowserWindow,
  options: { reattachHidden: boolean } = { reattachHidden: false },
): BrowserView {
  const existingView = browserViews.get(window.id);
  if (existingView) {
    if (options.reattachHidden || !hiddenBrowserWindows.has(window.id)) {
      window.setBrowserView(existingView);
    }
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

  const handleContextMenu = (_event: unknown, params: ContextMenuParams) => {
    const template = [
      {
        label: "Back",
        enabled: browserView.webContents.canGoBack(),
        click: () => {
          browserView.webContents.goBack();
        },
      },
      {
        label: "Forward",
        enabled: browserView.webContents.canGoForward(),
        click: () => {
          browserView.webContents.goForward();
        },
      },
      { type: "separator" as const },
      { role: "reload" as const },
      { type: "separator" as const },
      { role: "cut" as const, enabled: params.editFlags.canCut },
      { role: "copy" as const, enabled: params.editFlags.canCopy },
      { role: "paste" as const, enabled: params.editFlags.canPaste },
      { role: "selectAll" as const },
    ];

    Menu.buildFromTemplate(template).popup({ window });
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
  browserView.webContents.on("context-menu", handleContextMenu);
  window.on("closed", handleWindowClosed);

  browserCleanup.set(window.id, () => {
    browserView.webContents.off("did-start-loading", handleDidStartLoading);
    browserView.webContents.off("did-stop-loading", handleDidStopLoading);
    browserView.webContents.off("did-fail-load", handleDidFailLoad);
    browserView.webContents.off("context-menu", handleContextMenu);
    window.off("closed", handleWindowClosed);
  });

  browserViews.set(window.id, browserView);
  browserStates.set(window.id, createDefaultState());
  window.setBrowserView(browserView);
  updateBrowserState(window, createDefaultState());

  return browserView;
}

function restoreBrowserAttachSnapshot(
  window: BrowserWindow,
  snapshot: {
    view: BrowserView | undefined;
    hidden: boolean;
    ownerToken: string | undefined;
  },
) {
  const currentView = browserViews.get(window.id);
  if (currentView && currentView !== snapshot.view) {
    teardownBrowserView(window, {
      notifyRenderer: false,
      closeWebContents: true,
    });
  }

  if (snapshot.view) {
    browserViews.set(window.id, snapshot.view);
    if (snapshot.hidden) {
      hiddenBrowserWindows.add(window.id);
      try {
        window.setBrowserView(null);
      } catch (rollbackError) {
        hiddenBrowserWindows.delete(window.id);
        throw rollbackError;
      }
    } else {
      window.setBrowserView(snapshot.view);
      hiddenBrowserWindows.delete(window.id);
    }
  } else {
    browserViews.delete(window.id);
    if (snapshot.hidden) {
      hiddenBrowserWindows.add(window.id);
      try {
        window.setBrowserView(null);
      } catch (rollbackError) {
        hiddenBrowserWindows.delete(window.id);
        throw rollbackError;
      }
    } else {
      hiddenBrowserWindows.delete(window.id);
    }
  }

  if (snapshot.ownerToken) {
    browserOwnerTokens.set(window.id, snapshot.ownerToken);
  } else {
    browserOwnerTokens.delete(window.id);
  }
}

export function registerBrowserIPC() {
  ipcMain.handle("browser:show-address-input-menu", async (event) => {
    const window = getWindowForEvent(event);
    if (!window) {
      return;
    }

    Menu.buildFromTemplate([
      { role: "undo" as const },
      { role: "redo" as const },
      { type: "separator" as const },
      { role: "cut" as const },
      { role: "copy" as const },
      { role: "paste" as const },
      { role: "selectAll" as const },
    ]).popup({ window });
  });

  ipcMain.handle("browser:attach", async (event, bounds: BrowserBounds, ownerToken?: string) => {
    const window = getWindowForEvent(event);
    if (!window) {
      throw new Error("Browser attach requested without an owning BrowserWindow");
    }

    const attachSnapshot = {
      view: browserViews.get(window.id),
      hidden: hiddenBrowserWindows.has(window.id),
      ownerToken: browserOwnerTokens.get(window.id),
    };

    try {
      const browserView = ensureBrowserView(window, { reattachHidden: true });
      browserView.setBounds(bounds);
      hiddenBrowserWindows.delete(window.id);
      if (ownerToken) {
        browserOwnerTokens.set(window.id, ownerToken);
      } else {
        browserOwnerTokens.delete(window.id);
      }
    } catch (error) {
      restoreBrowserAttachSnapshot(window, attachSnapshot);
      throw error;
    }
  });

  ipcMain.handle("browser:set-bounds", async (event, bounds: BrowserBounds, ownerToken?: string) => {
    const window = getWindowForEvent(event);
    if (!window) {
      return;
    }

    if (!isBrowserOwnerRequestAllowed(window.id, ownerToken)) {
      return;
    }

    const browserView = browserViews.get(window.id);
    if (!browserView || hiddenBrowserWindows.has(window.id) || isZeroBrowserBounds(bounds)) {
      return;
    }

    browserView.setBounds(bounds);
  });

  ipcMain.handle("browser:hide", async (event, ownerToken?: string) => {
    const window = getWindowForEvent(event);
    if (!window) {
      return;
    }

    if (!isBrowserOwnerRequestAllowed(window.id, ownerToken)) {
      return;
    }

    if (browserViews.has(window.id)) {
      window.setBrowserView(null);
    }
    hiddenBrowserWindows.add(window.id);
    browserOwnerTokens.delete(window.id);
  });

  ipcMain.handle("browser:get-state", async (event) => {
    const window = getWindowForEvent(event);
    if (!window) {
      return createDefaultState();
    }

    return getBrowserState(window.id);
  });

  ipcMain.handle("browser:navigate", async (event, url: string) => {
    const window = getWindowForEvent(event);
    if (!window) {
      throw new Error("Browser navigate requested without an owning BrowserWindow");
    }

    assertAllowedBrowserUrl(url);

    const browserView = browserViews.get(window.id);
    if (!browserView) {
      return;
    }

    await browserView.webContents.loadURL(url);
  });

  ipcMain.handle("browser:back", async (event) => {
    const window = getWindowForEvent(event);
    if (!window) {
      return;
    }

    const browserView = browserViews.get(window.id);
    if (!browserView) {
      return;
    }

    if (browserView.webContents.canGoBack()) {
      browserView.webContents.goBack();
    }
  });

  ipcMain.handle("browser:forward", async (event) => {
    const window = getWindowForEvent(event);
    if (!window) {
      return;
    }

    const browserView = browserViews.get(window.id);
    if (!browserView) {
      return;
    }

    if (browserView.webContents.canGoForward()) {
      browserView.webContents.goForward();
    }
  });

  ipcMain.handle("browser:reload", async (event) => {
    const window = getWindowForEvent(event);
    if (!window) {
      return;
    }

    const browserView = browserViews.get(window.id);
    if (!browserView) {
      return;
    }

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
