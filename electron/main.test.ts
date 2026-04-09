import { beforeEach, describe, expect, it, vi } from "vitest";

const appOnMock = vi.fn();
const appQuitMock = vi.fn();
const appWhenReadyMock = vi.fn();
const appGetPathMock = vi.fn();
const appSetPathMock = vi.fn();
const ipcMainOnMock = vi.fn();
const ipcMainOffMock = vi.fn();
const showErrorBoxMock = vi.fn();
const browserWindowConstructorMock = vi.fn();
const browserWindowGetAllWindowsMock = vi.fn();
const browserWindowLoadFileMock = vi.fn();
const browserWindowLoadUrlMock = vi.fn();
const browserWindowShowMock = vi.fn();
const browserWindowDestroyMock = vi.fn();

class BrowserWindowMock {
  static getAllWindows = browserWindowGetAllWindowsMock;

  constructor(options?: unknown) {
    browserWindowConstructorMock(options);
  }

  id = 7;
  loadFile = browserWindowLoadFileMock;
  loadURL = browserWindowLoadUrlMock;
  show = browserWindowShowMock;
  destroy = browserWindowDestroyMock;
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
  dialog: {
    showErrorBox: showErrorBoxMock,
  },
  ipcMain: {
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
    ipcMainOnMock.mockClear();
    ipcMainOffMock.mockClear();
    showErrorBoxMock.mockReset();
    browserWindowConstructorMock.mockReset();
    browserWindowGetAllWindowsMock.mockReset();
    browserWindowLoadFileMock.mockReset();
    browserWindowLoadUrlMock.mockReset();
    browserWindowShowMock.mockReset();
    browserWindowDestroyMock.mockReset();
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
