import { beforeEach, describe, expect, it, vi } from "vitest";

const exposeInMainWorldMock = vi.fn();
const invokeMock = vi.fn();
const onMock = vi.fn();
const offMock = vi.fn();
const sendMock = vi.fn();

async function waitForAsyncEffects(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

type ExposedDesktop = {
  db: {
    execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }>;
    select<TRows extends readonly unknown[] = unknown[]>(sql: string, params?: unknown[]): Promise<TRows>;
    backup(destinationPath: string): Promise<unknown>;
  };
  boards: {
    createBoard(name: string, workspaceId: string | null): Promise<string>;
  };
  workspaces: {
    createWorkspace(name: string, icon?: string): Promise<string>;
    reorderWorkspaces(orderedIds: string[]): Promise<void>;
  };
  fs: {
    exists(path: string): Promise<boolean>;
    mkdir(path: string): Promise<void>;
    readFile(path: string): Promise<Uint8Array>;
    writeFile(path: string, data: Uint8Array): Promise<void>;
    copyFile(src: string, dest: string): Promise<void>;
    readDir(path: string): Promise<Array<{ name: string }>>;
    remove(path: string): Promise<void>;
  };
  paths: {
    appDataDir(): Promise<string>;
    join(...parts: string[]): Promise<string>;
  };
  lifecycle: {
    flushPendingWork(): Promise<void>;
  };
  browser: {
    attach(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
    setBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
    navigate(url: string): Promise<void>;
    goBack(): Promise<void>;
    goForward(): Promise<void>;
    reload(): Promise<void>;
    destroy(): Promise<void>;
    onStateChanged(
      callback: (state: {
        url: string;
        title: string;
        canGoBack: boolean;
        canGoForward: boolean;
        isLoading: boolean;
      lastError: string | null;
    }) => void,
    ): () => void;
  };
  theme: {
    setPreference(preference: "system" | "light" | "dark"): Promise<void>;
    onPreferenceSelected(callback: (preference: "system" | "light" | "dark") => void): () => void;
  };
};

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: exposeInMainWorldMock,
  },
  ipcRenderer: {
    invoke: invokeMock,
    on: onMock,
    off: offMock,
    send: sendMock,
  },
}));

describe("preload filesystem IPC", () => {
  beforeEach(() => {
    vi.resetModules();
    exposeInMainWorldMock.mockReset();
    invokeMock.mockReset();
    onMock.mockReset();
    offMock.mockReset();
    sendMock.mockReset();
    delete (window as Window & { __PHOSPHENE_LIFECYCLE_READY__?: boolean }).__PHOSPHENE_LIFECYCLE_READY__;
  });

  it("reconstructs fs errors with their code preserved for renderer callers", async () => {
    invokeMock.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "EACCES",
        message: "permission denied",
      },
    });

    await import("./preload");

    const desktop = exposeInMainWorldMock.mock.calls[0]?.[1] as ExposedDesktop;

    await expect(desktop.fs.exists("/private/file")).rejects.toMatchObject({
      message: "permission denied",
      code: "EACCES",
    });
  });

  it("returns filesystem values when the IPC result is successful", async () => {
    const fileBytes = Uint8Array.from([1, 2, 3]);

    invokeMock
      .mockResolvedValueOnce({
        ok: true,
        value: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        value: undefined,
      })
      .mockResolvedValueOnce({
        ok: true,
        value: fileBytes,
      });

    await import("./preload");

    const desktop = exposeInMainWorldMock.mock.calls[0]?.[1] as ExposedDesktop;

    await expect(desktop.fs.exists("/missing/file")).resolves.toBe(false);
    await expect(desktop.fs.mkdir("/app/data/images")).resolves.toBeUndefined();
    await expect(desktop.fs.readFile("/app/data/images/file.png")).resolves.toEqual(fileBytes);
  });

  it("exposes the full desktop surface and wires the expected IPC invoke channels", async () => {
    invokeMock
      .mockResolvedValueOnce({
        status: "created",
        destinationPath: "/app/data/backups/phosphene.db",
      })
      .mockResolvedValueOnce("board-1")
      .mockResolvedValueOnce("workspace-1")
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ name: "thumb.png" }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce("/app/data")
      .mockResolvedValueOnce("/app/data/images/board-1");

    await import("./preload");

    const desktop = exposeInMainWorldMock.mock.calls[0]?.[1] as ExposedDesktop;

    expect(desktop).toEqual(
      expect.objectContaining({
        db: expect.objectContaining({
          execute: expect.any(Function),
          select: expect.any(Function),
          backup: expect.any(Function),
        }),
        boards: expect.objectContaining({
          createBoard: expect.any(Function),
        }),
        workspaces: expect.objectContaining({
          createWorkspace: expect.any(Function),
          reorderWorkspaces: expect.any(Function),
        }),
        fs: expect.objectContaining({
          exists: expect.any(Function),
          mkdir: expect.any(Function),
          readFile: expect.any(Function),
          writeFile: expect.any(Function),
          copyFile: expect.any(Function),
          readDir: expect.any(Function),
          remove: expect.any(Function),
        }),
        paths: expect.objectContaining({
          appDataDir: expect.any(Function),
          join: expect.any(Function),
        }),
        lifecycle: expect.objectContaining({
          flushPendingWork: expect.any(Function),
        }),
        browser: expect.objectContaining({
          attach: expect.any(Function),
          setBounds: expect.any(Function),
          navigate: expect.any(Function),
          goBack: expect.any(Function),
          goForward: expect.any(Function),
          reload: expect.any(Function),
          destroy: expect.any(Function),
          onStateChanged: expect.any(Function),
        }),
      }),
    );

    await expect(desktop.db.backup("/app/data/backups/phosphene.db")).resolves.toEqual({
      status: "created",
      destinationPath: "/app/data/backups/phosphene.db",
    });
    await expect(desktop.boards.createBoard("Board 1", "workspace-1")).resolves.toBe("board-1");
    await expect(desktop.workspaces.createWorkspace("Workspace 1", "🪟")).resolves.toBe(
      "workspace-1",
    );
    await expect(desktop.workspaces.reorderWorkspaces(["workspace-2", "workspace-1"])).resolves.toBeUndefined();
    await expect(desktop.fs.copyFile("/tmp/source.png", "/tmp/dest.png")).resolves.toBeUndefined();
    await expect(desktop.fs.readDir("/app/data/images")).resolves.toEqual([{ name: "thumb.png" }]);
    await expect(desktop.fs.remove("/app/data/images/thumb.png")).resolves.toBeUndefined();
    await expect(desktop.paths.appDataDir()).resolves.toBe("/app/data");
    await expect(desktop.paths.join("/app/data", "images", "board-1")).resolves.toBe(
      "/app/data/images/board-1",
    );

    expect(invokeMock.mock.calls).toEqual([
      ["db:backup", "/app/data/backups/phosphene.db"],
      ["boards:create", "Board 1", "workspace-1"],
      ["workspaces:create", "Workspace 1", "🪟"],
      ["workspaces:reorder", ["workspace-2", "workspace-1"]],
      ["fs:copyFile", "/tmp/source.png", "/tmp/dest.png"],
      ["fs:readDir", "/app/data/images"],
      ["fs:remove", "/app/data/images/thumb.png"],
      ["paths:appDataDir"],
      ["paths:join", "/app/data", "images", "board-1"],
    ]);
  });

  it("exposes browser bridge methods in the desktop API", async () => {
    await import("./preload");

    expect(exposeInMainWorldMock).toHaveBeenCalledWith(
      "desktop",
      expect.objectContaining({
        browser: expect.objectContaining({
          attach: expect.any(Function),
          setBounds: expect.any(Function),
          navigate: expect.any(Function),
          goBack: expect.any(Function),
          goForward: expect.any(Function),
          reload: expect.any(Function),
          destroy: expect.any(Function),
          onStateChanged: expect.any(Function),
        }),
      }),
    );
  });

  it("exposes a theme bridge for native menu synchronization", async () => {
    await import("./preload");

    expect(exposeInMainWorldMock).toHaveBeenCalledWith(
      "desktop",
      expect.objectContaining({
        theme: expect.objectContaining({
          setPreference: expect.any(Function),
          onPreferenceSelected: expect.any(Function),
        }),
      }),
    );

    const desktop = exposeInMainWorldMock.mock.calls[0]?.[1] as ExposedDesktop;
    const handlePreferenceSelected = vi.fn();

    await desktop.theme.setPreference("dark");
    expect(invokeMock).toHaveBeenCalledWith("theme:set-preference", "dark");

    const unsubscribe = desktop.theme.onPreferenceSelected(handlePreferenceSelected);
    expect(onMock).toHaveBeenCalledWith("theme:preference-selected", expect.any(Function));

    const listener = onMock.mock.calls.find(([channel]) => channel === "theme:preference-selected")?.[1];
    listener?.({}, "light");

    expect(handlePreferenceSelected).toHaveBeenCalledWith("light");

    unsubscribe();
    expect(offMock).toHaveBeenCalledWith("theme:preference-selected", listener);
  });

  it("subscribes and unsubscribes browser state listeners through ipcRenderer", async () => {
    await import("./preload");

    const desktop = exposeInMainWorldMock.mock.calls[0]?.[1] as ExposedDesktop;
    const handleStateChanged = vi.fn();

    const unsubscribe = desktop.browser.onStateChanged(handleStateChanged);

    expect(onMock).toHaveBeenCalledWith("browser:state-changed", expect.any(Function));

    const listener = onMock.mock.calls.find(([channel]) => channel === "browser:state-changed")?.[1];
    const state = {
      url: "https://example.com",
      title: "Example",
      canGoBack: false,
      canGoForward: true,
      isLoading: false,
      lastError: null,
    };

    listener?.({}, state);
    expect(handleStateChanged).toHaveBeenCalledWith(state);

    unsubscribe();

    expect(offMock).toHaveBeenCalledWith("browser:state-changed", listener);
  });

  it("propagates rejected IPC contract errors to renderer callers", async () => {
    invokeMock
      .mockRejectedValueOnce(new Error("[IPC fs:writeFile] Invalid payload: expected data to be a Uint8Array"))
      .mockRejectedValueOnce(new Error("[IPC db:execute] Invalid payload: expected sql to be a string"));

    await import("./preload");

    const desktop = exposeInMainWorldMock.mock.calls[0]?.[1] as ExposedDesktop;

    await expect(desktop.fs.writeFile("/tmp/file", new Uint8Array())).rejects.toMatchObject({
      message: "[IPC fs:writeFile] Invalid payload: expected data to be a Uint8Array",
    });
    await expect(desktop.db.execute("SELECT 1", [])).rejects.toThrow(
      "[IPC db:execute] Invalid payload: expected sql to be a string",
    );
  });

  it("responds to lifecycle flush requests even before renderer listeners are installed", async () => {
    await import("./preload");

    const lifecycleHandler = onMock.mock.calls.find(([channel]) => channel === "lifecycle:flush-request")?.[1];

    expect(lifecycleHandler).toBeTypeOf("function");

    lifecycleHandler({}, "startup-request");
    await waitForAsyncEffects();

    expect(sendMock).toHaveBeenCalledWith("lifecycle:flush-response", {
      requestId: "startup-request",
      ok: true,
    });
  });

  it("waits for registered async pending work once lifecycle listeners are ready", async () => {
    await import("./preload");
    const { lifecycle } = await import("../src/platform/desktop-api");

    const lifecycleHandler = onMock.mock.calls.find(([channel]) => channel === "lifecycle:flush-request")?.[1];

    expect(lifecycleHandler).toBeTypeOf("function");

    let resolvePendingWork: (() => void) | undefined;
    const pendingWork = new Promise<void>((resolve) => {
      resolvePendingWork = resolve;
    });
    const unregister = lifecycle.registerPendingWork(() => pendingWork);

    try {
      lifecycleHandler({}, "ready-request");
      await waitForAsyncEffects();

      expect(sendMock).not.toHaveBeenCalled();

      resolvePendingWork?.();
      await pendingWork;
      await waitForAsyncEffects();

      expect(sendMock).toHaveBeenCalledWith("lifecycle:flush-response", {
        requestId: "ready-request",
        ok: true,
      });
    } finally {
      unregister();
    }
  });

  it("does not install duplicate lifecycle listeners when desktop-api is re-evaluated", async () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");

    try {
      await import("../src/platform/desktop-api");

      const registrationCountAfterFirstImport = addEventListenerSpy.mock.calls.filter(
        ([eventName]) =>
          eventName === "phosphene:lifecycle:flush-request" || eventName === "beforeunload",
      ).length;

      vi.resetModules();

      const { lifecycle } = await import("../src/platform/desktop-api");

      const registrationCountAfterSecondImport = addEventListenerSpy.mock.calls.filter(
        ([eventName]) =>
          eventName === "phosphene:lifecycle:flush-request" || eventName === "beforeunload",
      ).length;

      expect(registrationCountAfterSecondImport).toBe(registrationCountAfterFirstImport);

      let flushCount = 0;
      const flushCompleted = new Promise<void>((resolve) => {
        const handleComplete = (event: Event) => {
          const detail = (event as CustomEvent<{ requestId: string; ok: boolean }>).detail;

          if (detail.requestId !== "hmr-request") {
            return;
          }

          window.removeEventListener("phosphene:lifecycle:flush-complete", handleComplete);
          resolve();
        };

        window.addEventListener("phosphene:lifecycle:flush-complete", handleComplete);
      });

      const unregister = lifecycle.registerPendingWork(() => {
        flushCount += 1;
      });

      try {
        window.dispatchEvent(
          new CustomEvent("phosphene:lifecycle:flush-request", {
            detail: { requestId: "hmr-request" },
          }),
        );
        await flushCompleted;
        expect(flushCount).toBe(1);
      } finally {
        unregister();
      }
    } finally {
      addEventListenerSpy.mockRestore();
    }
  });

});
