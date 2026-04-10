import { beforeEach, describe, expect, it, vi } from "vitest";

const appOnMock = vi.fn();
const appQuitMock = vi.fn();
const appWhenReadyMock = vi.fn();
const appGetPathMock = vi.fn();
const appSetPathMock = vi.fn();
const ipcMainHandleMock = vi.fn();
const ipcMainOnMock = vi.fn();
const ipcMainOffMock = vi.fn();
const showErrorBoxMock = vi.fn();
const browserWindowConstructorMock = vi.fn();
const browserWindowGetAllWindowsMock = vi.fn();
const browserWindowFromWebContentsMock = vi.fn();
const browserWindowLoadFileMock = vi.fn();
const browserWindowLoadUrlMock = vi.fn();
const browserWindowShowMock = vi.fn();
const browserWindowDestroyMock = vi.fn();
const browserWindowSetBrowserViewMock = vi.fn();
const menuBuildFromTemplateMock = vi.fn();
const menuSetApplicationMenuMock = vi.fn();

class BrowserViewMock {
  constructor(_options?: unknown) {}

  listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  setBounds = vi.fn();
  webContents = {
    loadURL: vi.fn(),
    canGoBack: vi.fn(() => false),
    canGoForward: vi.fn(() => false),
    goBack: vi.fn(),
    goForward: vi.fn(),
    reload: vi.fn(),
    getURL: vi.fn(() => ""),
    getTitle: vi.fn(() => ""),
    close: vi.fn(),
    on: vi.fn((eventName: string, listener: (...args: unknown[]) => void) => {
      const listeners = this.listeners.get(eventName) ?? new Set();
      listeners.add(listener);
      this.listeners.set(eventName, listeners);
    }),
    off: vi.fn((eventName: string, listener: (...args: unknown[]) => void) => {
      this.listeners.get(eventName)?.delete(listener);
    }),
  };

  emit(eventName: string, ...args: unknown[]) {
    this.listeners.get(eventName)?.forEach((listener) => listener({}, ...args));
  }
}

class BrowserWindowMock {
  static getAllWindows = browserWindowGetAllWindowsMock;
  static fromWebContents = browserWindowFromWebContentsMock;
  constructor(options?: unknown) {
    browserWindowConstructorMock(options);
  }

  id = 7;
  loadFile = browserWindowLoadFileMock;
  loadURL = browserWindowLoadUrlMock;
  show = browserWindowShowMock;
  destroy = browserWindowDestroyMock;
  setBrowserView = browserWindowSetBrowserViewMock;
  isDestroyed = vi.fn(() => false);
  on = vi.fn();
  off = vi.fn();
  webContents = {
    id: 7,
    isDestroyed: vi.fn(() => false),
    send: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
}

async function waitForAsyncEffects(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

vi.mock("electron", () => ({
  app: {
    isPackaged: true,
    whenReady: appWhenReadyMock,
    on: appOnMock,
    quit: appQuitMock,
    getPath: appGetPathMock,
    setPath: appSetPathMock,
  },
  BrowserWindow: BrowserWindowMock,
  BrowserView: BrowserViewMock,
  dialog: {
    showErrorBox: showErrorBoxMock,
  },
  Menu: {
    buildFromTemplate: menuBuildFromTemplateMock,
    setApplicationMenu: menuSetApplicationMenuMock,
  },
  ipcMain: {
    handle: ipcMainHandleMock,
    on: ipcMainOnMock,
    off: ipcMainOffMock,
  },
}));

vi.mock("./ipc/database", () => ({
  closeDatabase: vi.fn(),
  registerDatabaseIPC: vi.fn(),
}));

vi.mock("./ipc/filesystem", () => ({
  registerFilesystemIPC: vi.fn(),
}));

describe("electron main close flushing", () => {
  beforeEach(() => {
    appOnMock.mockClear();
    appQuitMock.mockClear();
    appWhenReadyMock.mockReset();
    appGetPathMock.mockReset();
    appSetPathMock.mockReset();
    ipcMainHandleMock.mockClear();
    ipcMainOnMock.mockClear();
    ipcMainOffMock.mockClear();
    showErrorBoxMock.mockReset();
    browserWindowConstructorMock.mockReset();
    browserWindowGetAllWindowsMock.mockReset();
    browserWindowFromWebContentsMock.mockReset();
    browserWindowLoadFileMock.mockReset();
    browserWindowLoadUrlMock.mockReset();
    browserWindowShowMock.mockReset();
    browserWindowDestroyMock.mockReset();
    browserWindowSetBrowserViewMock.mockReset();
    menuBuildFromTemplateMock.mockReset();
    menuSetApplicationMenuMock.mockReset();
    appWhenReadyMock.mockResolvedValue(undefined);
    appGetPathMock.mockImplementation((name: string) => {
      if (name === "appData") {
        return "/tmp/phosphene-test-app-data";
      }

      if (name === "userData") {
        return "/tmp/phosphene-test-app-data/app.phosphene.desktop";
      }

      return `/mock/${name}`;
    });
    vi.resetModules();
  });

  it("waits for renderer flush before allowing a window close to continue", async () => {
    const sendMock = vi.fn();
    const webContentsOnMock = vi.fn();
    const webContentsOffMock = vi.fn();
    const closeMock = vi.fn();
    const windowOnMock = vi.fn();
    const windowOffMock = vi.fn();

    const windowStub = {
      id: 7,
      isDestroyed: () => false,
      close: closeMock,
      on: windowOnMock,
      off: windowOffMock,
      webContents: {
        id: 7,
        isDestroyed: () => false,
        send: sendMock,
        on: webContentsOnMock,
        off: webContentsOffMock,
      },
    };

    const { attachDurableWindowCloseHandler } = await import("./main");

    attachDurableWindowCloseHandler(windowStub as never);

    const closeListener = windowOnMock.mock.calls.find(([eventName]) => eventName === "close")?.[1];
    expect(closeListener).toEqual(expect.any(Function));

    const preventDefault = vi.fn();
    closeListener?.({ preventDefault } as never);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(closeMock).not.toHaveBeenCalled();

    const flushResponseHandler = ipcMainOnMock.mock.calls.find(
      ([eventName]) => eventName === "lifecycle:flush-response",
    )?.[1];
    expect(flushResponseHandler).toEqual(expect.any(Function));

    const requestId = sendMock.mock.calls[0]?.[1] as string;

    await flushResponseHandler?.({ sender: windowStub.webContents } as never, { requestId, ok: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the initial browser window hidden until the first load finishes", async () => {
    browserWindowLoadFileMock.mockImplementation(async () => {
      expect(browserWindowShowMock).not.toHaveBeenCalled();
    });

    await import("./main");
    await waitForAsyncEffects();
    await waitForAsyncEffects();

    expect(browserWindowConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        show: false,
        webPreferences: expect.objectContaining({
          contextIsolation: true,
          nodeIntegration: false,
        }),
      }),
    );
    expect(browserWindowShowMock).toHaveBeenCalledTimes(1);
    expect(browserWindowShowMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      browserWindowLoadFileMock.mock.invocationCallOrder[0],
    );
  });

  it("registers browser IPC during bootstrap", async () => {
    await import("./main");
    await waitForAsyncEffects();
    await waitForAsyncEffects();

    expect(ipcMainHandleMock).toHaveBeenCalledWith("browser:attach", expect.any(Function));
    expect(ipcMainHandleMock).toHaveBeenCalledWith("browser:set-bounds", expect.any(Function));
    expect(ipcMainHandleMock).toHaveBeenCalledWith("browser:navigate", expect.any(Function));
    expect(ipcMainHandleMock).toHaveBeenCalledWith("browser:back", expect.any(Function));
    expect(ipcMainHandleMock).toHaveBeenCalledWith("browser:forward", expect.any(Function));
    expect(ipcMainHandleMock).toHaveBeenCalledWith("browser:reload", expect.any(Function));
    expect(ipcMainHandleMock).toHaveBeenCalledWith("browser:destroy", expect.any(Function));
  });

  it("registers a View > Theme menu with system, light, and dark items", async () => {
    menuBuildFromTemplateMock.mockReturnValue({} as never);
    const windowInstance = new BrowserWindowMock();
    browserWindowGetAllWindowsMock.mockReturnValue([windowInstance as never]);

    await import("./main");
    await waitForAsyncEffects();
    await waitForAsyncEffects();

    expect(ipcMainHandleMock).toHaveBeenCalledWith("theme:set-preference", expect.any(Function));
    expect(menuBuildFromTemplateMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          label: "View",
          submenu: expect.arrayContaining([
            expect.objectContaining({
              label: "Theme",
              submenu: expect.arrayContaining([
                expect.objectContaining({ label: "System" }),
                expect.objectContaining({ label: "Light" }),
                expect.objectContaining({ label: "Dark" }),
              ]),
            }),
          ]),
        }),
      ]),
    );
    expect(menuSetApplicationMenuMock).toHaveBeenCalledTimes(1);

    const themePreferenceHandler = ipcMainHandleMock.mock.calls.find(
      ([channel]) => channel === "theme:set-preference",
    )?.[1];
    await themePreferenceHandler?.({ sender: windowInstance.webContents } as never, "light");

    expect(menuBuildFromTemplateMock).toHaveBeenCalledTimes(2);
    const secondMenuTemplate = menuBuildFromTemplateMock.mock.calls[1]?.[0] as Array<{
      label?: string;
      submenu?: Array<{
        label?: string;
        submenu?: Array<{
          label?: string;
          checked?: boolean;
        }>;
      }>;
    }>;
    const secondThemeMenu = secondMenuTemplate.find((item) => item.label === "View")?.submenu?.find(
      (item) => item.label === "Theme",
    );
    const lightItem = secondThemeMenu?.submenu?.find((item) => item.label === "Light");

    expect(lightItem?.checked).toBe(true);

    const menuTemplate = menuBuildFromTemplateMock.mock.calls[0]?.[0] as Array<{
      label?: string;
      submenu?: Array<{
        label?: string;
        submenu?: Array<{
          label?: string;
          click?: () => void;
        }>;
      }>;
    }>;
    const themeMenu = menuTemplate.find((item) => item.label === "View")?.submenu?.find(
      (item) => item.label === "Theme",
    );
    const darkItem = themeMenu?.submenu?.find((item) => item.label === "Dark");

    darkItem?.click?.();

    expect(windowInstance.webContents.send).toHaveBeenCalledWith(
      "theme:preference-selected",
      "dark",
    );
  });

  it("attaches a browser view and navigates through the registered handlers", async () => {
    const windowInstance = new BrowserWindowMock();
    browserWindowFromWebContentsMock.mockReturnValue(windowInstance);

    await import("./main");
    await waitForAsyncEffects();
    await waitForAsyncEffects();

    const attachHandler = ipcMainHandleMock.mock.calls.find(
      ([channel]) => channel === "browser:attach",
    )?.[1];
    const navigateHandler = ipcMainHandleMock.mock.calls.find(
      ([channel]) => channel === "browser:navigate",
    )?.[1];

    expect(attachHandler).toEqual(expect.any(Function));
    expect(navigateHandler).toEqual(expect.any(Function));

    await attachHandler?.(
      { sender: windowInstance.webContents } as never,
      { x: 10, y: 20, width: 300, height: 200 },
    );

    expect(browserWindowSetBrowserViewMock).toHaveBeenCalled();
    const attachedView = browserWindowSetBrowserViewMock.mock.calls[0]?.[0] as BrowserViewMock;
    expect(attachedView.setBounds).toHaveBeenCalledWith({
      x: 10,
      y: 20,
      width: 300,
      height: 200,
    });

    await navigateHandler?.({ sender: windowInstance.webContents } as never, "https://example.com");

    expect(attachedView.webContents.loadURL).toHaveBeenCalledWith("https://example.com");
  });

  it("emits browser state updates and cleans up the attached view", async () => {
    const windowInstance = new BrowserWindowMock();
    browserWindowFromWebContentsMock.mockReturnValue(windowInstance);

    await import("./main");
    await waitForAsyncEffects();
    await waitForAsyncEffects();

    const attachHandler = ipcMainHandleMock.mock.calls.find(
      ([channel]) => channel === "browser:attach",
    )?.[1];
    const destroyHandler = ipcMainHandleMock.mock.calls.find(
      ([channel]) => channel === "browser:destroy",
    )?.[1];

    await attachHandler?.(
      { sender: windowInstance.webContents } as never,
      { x: 0, y: 0, width: 640, height: 480 },
    );

    const attachedView = browserWindowSetBrowserViewMock.mock.calls[0]?.[0] as BrowserViewMock;
    attachedView.webContents.getURL.mockReturnValue("https://example.com");
    attachedView.webContents.getTitle.mockReturnValue("Example");
    attachedView.webContents.canGoBack.mockReturnValue(true);
    attachedView.webContents.canGoForward.mockReturnValue(false);

    attachedView.emit("did-start-loading");
    attachedView.emit("did-stop-loading");
    attachedView.emit("did-fail-load", -2, "Navigation failed");

    expect(windowInstance.webContents.send).toHaveBeenCalledWith(
      "browser:state-changed",
      expect.objectContaining({
        isLoading: true,
        lastError: null,
      }),
    );
    expect(windowInstance.webContents.send).toHaveBeenCalledWith(
      "browser:state-changed",
      expect.objectContaining({
        url: "https://example.com",
        title: "Example",
        canGoBack: true,
        canGoForward: false,
        isLoading: false,
        lastError: null,
      }),
    );
    expect(windowInstance.webContents.send).toHaveBeenCalledWith(
      "browser:state-changed",
      expect.objectContaining({
        isLoading: false,
        lastError: "Navigation failed",
      }),
    );

    await destroyHandler?.({ sender: windowInstance.webContents } as never);

    expect(browserWindowSetBrowserViewMock).toHaveBeenLastCalledWith(null);
    expect(attachedView.webContents.close).toHaveBeenCalledTimes(1);
  });

  it("cleans up browser bookkeeping when the owning window closes", async () => {
    const windowInstance = new BrowserWindowMock();
    browserWindowFromWebContentsMock.mockReturnValue(windowInstance);

    await import("./main");
    await waitForAsyncEffects();
    await waitForAsyncEffects();

    const attachHandler = ipcMainHandleMock.mock.calls.find(
      ([channel]) => channel === "browser:attach",
    )?.[1];

    await attachHandler?.(
      { sender: windowInstance.webContents } as never,
      { x: 0, y: 0, width: 400, height: 300 },
    );

    const attachedView = browserWindowSetBrowserViewMock.mock.calls[0]?.[0] as BrowserViewMock;
    const closedListener = windowInstance.on.mock.calls.find(([eventName]) => eventName === "closed")?.[1];

    expect(closedListener).toEqual(expect.any(Function));

    closedListener?.();
    attachedView.emit("did-start-loading");

    expect(windowInstance.webContents.send).toHaveBeenCalledTimes(1);
    expect(attachedView.webContents.close).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed flush responses until a valid payload arrives", async () => {
    const sendMock = vi.fn();
    const webContentsOnMock = vi.fn();
    const webContentsOffMock = vi.fn();
    const closeMock = vi.fn();
    const windowOnMock = vi.fn();
    const windowOffMock = vi.fn();

    const webContentsStub = {
      id: 7,
      isDestroyed: () => false,
      send: sendMock,
      on: webContentsOnMock,
      off: webContentsOffMock,
    };
    const windowStub = {
      id: 7,
      isDestroyed: () => false,
      close: closeMock,
      on: windowOnMock,
      off: windowOffMock,
      webContents: webContentsStub,
    };

    const { attachDurableWindowCloseHandler } = await import("./main");

    attachDurableWindowCloseHandler(windowStub as never);

    const closeListener = windowOnMock.mock.calls.find(([eventName]) => eventName === "close")?.[1];
    const preventDefault = vi.fn();
    closeListener?.({ preventDefault } as never);

    const flushResponseHandler = ipcMainOnMock.mock.calls.find(
      ([eventName]) => eventName === "lifecycle:flush-response",
    )?.[1];
    const requestId = sendMock.mock.calls[0]?.[1] as string;

    expect(() => flushResponseHandler?.({ sender: webContentsStub } as never, null)).not.toThrow();
    expect(() =>
      flushResponseHandler?.({ sender: webContentsStub } as never, { requestId, ok: "yes" }),
    ).not.toThrow();
    expect(closeMock).not.toHaveBeenCalled();

    await flushResponseHandler?.({ sender: webContentsStub } as never, { requestId, ok: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("ignores flush responses from a different sender", async () => {
    const sendMock = vi.fn();
    const webContentsOnMock = vi.fn();
    const webContentsOffMock = vi.fn();
    const closeMock = vi.fn();
    const windowOnMock = vi.fn();
    const windowOffMock = vi.fn();

    const webContentsStub = {
      id: 7,
      isDestroyed: () => false,
      send: sendMock,
      on: webContentsOnMock,
      off: webContentsOffMock,
    };
    const windowStub = {
      id: 7,
      isDestroyed: () => false,
      close: closeMock,
      on: windowOnMock,
      off: windowOffMock,
      webContents: webContentsStub,
    };

    const { attachDurableWindowCloseHandler } = await import("./main");

    attachDurableWindowCloseHandler(windowStub as never);

    const closeListener = windowOnMock.mock.calls.find(([eventName]) => eventName === "close")?.[1];
    closeListener?.({ preventDefault: vi.fn() } as never);

    const flushResponseHandler = ipcMainOnMock.mock.calls.find(
      ([eventName]) => eventName === "lifecycle:flush-response",
    )?.[1];
    const requestId = sendMock.mock.calls[0]?.[1] as string;

    await flushResponseHandler?.({ sender: { id: 999 } } as never, { requestId, ok: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(closeMock).not.toHaveBeenCalled();

    await flushResponseHandler?.({ sender: webContentsStub } as never, { requestId, ok: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("logs explicit close flush failures separately from timeouts", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sendMock = vi.fn();
    const webContentsOnMock = vi.fn();
    const webContentsOffMock = vi.fn();
    const closeMock = vi.fn();
    const windowOnMock = vi.fn();
    const windowOffMock = vi.fn();

    const webContentsStub = {
      id: 7,
      isDestroyed: () => false,
      send: sendMock,
      on: webContentsOnMock,
      off: webContentsOffMock,
    };
    const windowStub = {
      id: 7,
      isDestroyed: () => false,
      close: closeMock,
      on: windowOnMock,
      off: windowOffMock,
      webContents: webContentsStub,
    };

    const { attachDurableWindowCloseHandler } = await import("./main");

    attachDurableWindowCloseHandler(windowStub as never);

    const closeListener = windowOnMock.mock.calls.find(([eventName]) => eventName === "close")?.[1];
    closeListener?.({ preventDefault: vi.fn() } as never);

    const flushResponseHandler = ipcMainOnMock.mock.calls.find(
      ([eventName]) => eventName === "lifecycle:flush-response",
    )?.[1];
    const requestId = sendMock.mock.calls[0]?.[1] as string;

    await flushResponseHandler?.(
      { sender: webContentsStub } as never,
      { requestId, ok: false, error: "renderer refused flush" },
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalledWith("[window:close-flush-failure]", {
      windowId: 7,
      timeoutMs: 1500,
      error: "renderer refused flush",
    });
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("logs explicit quit flush failures separately from timeouts", async () => {
    appWhenReadyMock.mockReturnValue(new Promise(() => {}));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sendMock = vi.fn();
    const webContentsOnMock = vi.fn();
    const webContentsOffMock = vi.fn();

    const webContentsStub = {
      id: 7,
      isDestroyed: () => false,
      send: sendMock,
      on: webContentsOnMock,
      off: webContentsOffMock,
    };
    const windowStub = {
      id: 7,
      isDestroyed: () => false,
      webContents: webContentsStub,
    };
    browserWindowGetAllWindowsMock.mockReturnValue([windowStub]);

    await import("./main");

    const beforeQuitHandler = appOnMock.mock.calls.find(([eventName]) => eventName === "before-quit")?.[1];
    expect(beforeQuitHandler).toEqual(expect.any(Function));

    const preventDefault = vi.fn();
    beforeQuitHandler?.({ preventDefault } as never);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledTimes(1);

    const flushResponseHandler = ipcMainOnMock.mock.calls.find(
      ([eventName]) => eventName === "lifecycle:flush-response",
    )?.[1];
    const requestId = sendMock.mock.calls[0]?.[1] as string;

    await flushResponseHandler?.(
      { sender: webContentsStub } as never,
      { requestId, ok: false, error: "renderer flush failed on quit" },
    );
    await waitForAsyncEffects();
    await waitForAsyncEffects();

    expect(consoleErrorSpy).toHaveBeenCalledWith("[quit:flush-failure]", {
      windowId: 7,
      timeoutMs: 1500,
      error: "renderer flush failed on quit",
    });
    expect(appQuitMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces fatal bootstrap failures and quits the app", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    browserWindowLoadFileMock.mockRejectedValueOnce(new Error("missing dist index"));

    await import("./main");
    await waitForAsyncEffects();
    await waitForAsyncEffects();

    expect(browserWindowDestroyMock).toHaveBeenCalledTimes(1);
    expect(showErrorBoxMock).toHaveBeenCalledWith(
      "Phosphene failed to start",
      expect.stringContaining("create-window"),
    );
    expect(appQuitMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[bootstrap:error]",
      expect.objectContaining({
        phase: "create-window",
        message: "missing dist index",
      }),
    );
  });

  it("surfaces activate-time window creation failures to the user", async () => {
    browserWindowLoadFileMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("missing dist index"));
    browserWindowGetAllWindowsMock.mockReturnValue([]);

    await import("./main");
    await waitForAsyncEffects();
    await waitForAsyncEffects();

    const activateHandler = appOnMock.mock.calls.find(([eventName]) => eventName === "activate")?.[1];

    expect(activateHandler).toEqual(expect.any(Function));

    activateHandler?.();
    await waitForAsyncEffects();
    await waitForAsyncEffects();

    expect(showErrorBoxMock).toHaveBeenCalledWith(
      "Phosphene could not reopen a window",
      expect.stringContaining("activate-create-window"),
    );
  });
});
