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
    list(workspaceId?: string | null): Promise<Array<{ id: string; workspaceId: string | null; name: string; description: string | null; position: number; updatedAt: string }>>;
    get(boardId: string): Promise<{
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
    } | null>;
    createBoard(name: string, workspaceId: string | null): Promise<string>;
    rename(boardId: string, name: string): Promise<void>;
    delete(boardId: string): Promise<void>;
    saveCanvasData(boardId: string, canvasData: string): Promise<void>;
    saveThumbnail(boardId: string, thumbnail: string): Promise<void>;
  };
  workspaces: {
    list(): Promise<Array<{ id: string; name: string; icon: string | null; position: number }>>;
    get(workspaceId: string): Promise<{
      id: string;
      name: string;
      icon: string | null;
      position: number;
      layoutConfig: object | null;
      createdAt: string;
      updatedAt: string;
      deletedAt: string | null;
    } | null>;
    createWorkspace(name: string, icon?: string): Promise<string>;
    rename(workspaceId: string, name: string): Promise<void>;
    delete(workspaceId: string): Promise<boolean>;
    reorderWorkspaces(orderedIds: string[]): Promise<void>;
    getLayout(workspaceId: string): Promise<object | null>;
    saveLayout(workspaceId: string, layoutConfig: object): Promise<void>;
  };
  settings: {
    getActiveWorkspaceId(): Promise<string | null>;
    setActiveWorkspaceId(workspaceId: string): Promise<void>;
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
  storage: {
    ensureDirectories(): Promise<void>;
    runDailyBackup(): Promise<unknown>;
    readDroppedImage(path: string): Promise<{ name: string; mimeType: string; data: Uint8Array }>;
    writeBoardImage(boardId: string, fileId: string, mimeType: string, data: Uint8Array): Promise<string>;
    readBoardImage(path: string): Promise<Uint8Array | null>;
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
  contextMenu: {
    showAddressInputMenu(): Promise<void>;
  };
  theme: {
    getPreference(): Promise<"system" | "light" | "dark">;
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
        contextMenu: expect.objectContaining({
          showAddressInputMenu: expect.any(Function),
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

  it("exposes additive storage helpers for directory setup, backups, and board image IO", async () => {
    const imageBytes = Uint8Array.from([9, 8, 7]);

    invokeMock
      .mockResolvedValueOnce({ ok: true, value: undefined })
      .mockResolvedValueOnce({ ok: true, value: { status: "created", destinationPath: "/app/data/backups/phosphene-2026-04-19.db" } })
      .mockResolvedValueOnce({ ok: true, value: { name: "dropped.PNG", mimeType: "image/png", data: imageBytes } })
      .mockResolvedValueOnce({ ok: true, value: "images/board-1_file-1.png" })
      .mockResolvedValueOnce({ ok: true, value: imageBytes })
      .mockResolvedValueOnce({ ok: true, value: null });

    await import("./preload");

    const desktop = exposeInMainWorldMock.mock.calls[0]?.[1] as ExposedDesktop;

    expect(desktop).toEqual(
      expect.objectContaining({
        storage: expect.objectContaining({
          ensureDirectories: expect.any(Function),
          runDailyBackup: expect.any(Function),
          readDroppedImage: expect.any(Function),
          writeBoardImage: expect.any(Function),
          readBoardImage: expect.any(Function),
        }),
      }),
    );

    await expect(desktop.storage.ensureDirectories()).resolves.toBeUndefined();
    await expect(desktop.storage.runDailyBackup()).resolves.toEqual({
      status: "created",
      destinationPath: "/app/data/backups/phosphene-2026-04-19.db",
    });
    await expect(desktop.storage.readDroppedImage("/tmp/dropped.png")).resolves.toEqual({
      name: "dropped.PNG",
      mimeType: "image/png",
      data: imageBytes,
    });
    await expect(
      desktop.storage.writeBoardImage("board-1", "file-1", "image/png", imageBytes),
    ).resolves.toBe("images/board-1_file-1.png");
    await expect(desktop.storage.readBoardImage("images/board-1_file-1.png")).resolves.toEqual(
      imageBytes,
    );
    await expect(desktop.storage.readBoardImage("images/missing.png")).resolves.toBeNull();

    expect(invokeMock.mock.calls).toEqual([
      ["storage:ensure-directories"],
      ["storage:run-daily-backup"],
      ["storage:read-dropped-image", "/tmp/dropped.png"],
      ["storage:write-board-image", "board-1", "file-1", "image/png", imageBytes],
      ["storage:read-board-image", "images/board-1_file-1.png"],
      ["storage:read-board-image", "images/missing.png"],
    ]);
  });

  it("exposes additive board, workspace, settings, and theme persistence APIs", async () => {
    invokeMock
      .mockResolvedValueOnce([{ id: "board-1", workspaceId: null, name: "Board 1", description: null, position: 0, updatedAt: "2026-04-19T00:00:00Z" }])
      .mockResolvedValueOnce({
        id: "board-1",
        workspaceId: null,
        name: "Board 1",
        description: null,
        canvasData: null,
        thumbnail: null,
        position: 0,
        createdAt: "2026-04-19T00:00:00Z",
        updatedAt: "2026-04-19T00:00:00Z",
        deletedAt: null,
      })
      .mockResolvedValueOnce("board-2")
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ id: "workspace-1", name: "Home", icon: "🏠", position: 0 }])
      .mockResolvedValueOnce({
        id: "workspace-1",
        name: "Home",
        icon: "🏠",
        position: 0,
        layoutConfig: { left: 320 },
        createdAt: "2026-04-19T00:00:00Z",
        updatedAt: "2026-04-19T00:00:00Z",
        deletedAt: null,
      })
      .mockResolvedValueOnce("workspace-2")
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ left: 320 })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce("workspace-1")
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce("dark")
      .mockResolvedValueOnce(undefined);

    await import("./preload");

    const desktop = exposeInMainWorldMock.mock.calls[0]?.[1] as ExposedDesktop;

    expect(desktop).toEqual(
      expect.objectContaining({
        boards: expect.objectContaining({
          list: expect.any(Function),
          get: expect.any(Function),
          createBoard: expect.any(Function),
          rename: expect.any(Function),
          delete: expect.any(Function),
          saveCanvasData: expect.any(Function),
          saveThumbnail: expect.any(Function),
        }),
        workspaces: expect.objectContaining({
          list: expect.any(Function),
          get: expect.any(Function),
          createWorkspace: expect.any(Function),
          rename: expect.any(Function),
          delete: expect.any(Function),
          reorderWorkspaces: expect.any(Function),
          getLayout: expect.any(Function),
          saveLayout: expect.any(Function),
        }),
        settings: expect.objectContaining({
          getActiveWorkspaceId: expect.any(Function),
          setActiveWorkspaceId: expect.any(Function),
        }),
        theme: expect.objectContaining({
          getPreference: expect.any(Function),
          setPreference: expect.any(Function),
          onPreferenceSelected: expect.any(Function),
        }),
      }),
    );

    await expect(desktop.boards.list()).resolves.toEqual([
      { id: "board-1", workspaceId: null, name: "Board 1", description: null, position: 0, updatedAt: "2026-04-19T00:00:00Z" },
    ]);
    await expect(desktop.boards.get("board-1")).resolves.toEqual({
      id: "board-1",
      workspaceId: null,
      name: "Board 1",
      description: null,
      canvasData: null,
      thumbnail: null,
      position: 0,
      createdAt: "2026-04-19T00:00:00Z",
      updatedAt: "2026-04-19T00:00:00Z",
      deletedAt: null,
    });
    await expect(desktop.boards.createBoard("Board 2", null)).resolves.toBe("board-2");
    await expect(desktop.boards.rename("board-1", "Renamed board")).resolves.toBeUndefined();
    await expect(desktop.boards.delete("board-1")).resolves.toBeUndefined();
    await expect(desktop.boards.saveCanvasData("board-1", "{\"type\":\"excalidraw\"}")).resolves.toBeUndefined();
    await expect(desktop.boards.saveThumbnail("board-1", "thumbnail-data")).resolves.toBeUndefined();
    await expect(desktop.workspaces.list()).resolves.toEqual([
      { id: "workspace-1", name: "Home", icon: "🏠", position: 0 },
    ]);
    await expect(desktop.workspaces.get("workspace-1")).resolves.toEqual({
      id: "workspace-1",
      name: "Home",
      icon: "🏠",
      position: 0,
      layoutConfig: { left: 320 },
      createdAt: "2026-04-19T00:00:00Z",
      updatedAt: "2026-04-19T00:00:00Z",
      deletedAt: null,
    });
    await expect(desktop.workspaces.createWorkspace("Workspace 2", "🪟")).resolves.toBe("workspace-2");
    await expect(desktop.workspaces.rename("workspace-1", "Renamed workspace")).resolves.toBeUndefined();
    await expect(desktop.workspaces.delete("workspace-1")).resolves.toBe(true);
    await expect(desktop.workspaces.reorderWorkspaces(["workspace-2", "workspace-1"])).resolves.toBeUndefined();
    await expect(desktop.workspaces.getLayout("workspace-1")).resolves.toEqual({ left: 320 });
    await expect(desktop.workspaces.saveLayout("workspace-1", { left: 320 })).resolves.toBeUndefined();
    await expect(desktop.settings.getActiveWorkspaceId()).resolves.toBe("workspace-1");
    await expect(desktop.settings.setActiveWorkspaceId("workspace-2")).resolves.toBeUndefined();
    await expect(desktop.theme.getPreference()).resolves.toBe("dark");
    await expect(desktop.theme.setPreference("light")).resolves.toBeUndefined();

    expect(invokeMock.mock.calls).toEqual([
      ["boards:list", null],
      ["boards:get", "board-1"],
      ["boards:create", "Board 2", null],
      ["boards:rename", "board-1", "Renamed board"],
      ["boards:delete", "board-1"],
      ["boards:save-canvas-data", "board-1", "{\"type\":\"excalidraw\"}"],
      ["boards:save-thumbnail", "board-1", "thumbnail-data"],
      ["workspaces:list"],
      ["workspaces:get", "workspace-1"],
      ["workspaces:create", "Workspace 2", "🪟"],
      ["workspaces:rename", "workspace-1", "Renamed workspace"],
      ["workspaces:delete", "workspace-1"],
      ["workspaces:reorder", ["workspace-2", "workspace-1"]],
      ["workspaces:get-layout", "workspace-1"],
      ["workspaces:save-layout", "workspace-1", { left: 320 }],
      ["settings:get-active-workspace-id"],
      ["settings:set-active-workspace-id", "workspace-2"],
      ["theme:get-preference"],
      ["theme:set-preference", "light"],
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

  it("exposes context menu bridge methods in the desktop API", async () => {
    await import("./preload");

    const desktop = exposeInMainWorldMock.mock.calls[0]?.[1] as ExposedDesktop;

    await desktop.contextMenu.showAddressInputMenu();

    expect(exposeInMainWorldMock).toHaveBeenCalledWith(
      "desktop",
      expect.objectContaining({
        contextMenu: expect.objectContaining({
          showAddressInputMenu: expect.any(Function),
        }),
      }),
    );
    expect(invokeMock).toHaveBeenCalledWith("browser:show-address-input-menu");
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

    expect(onMock).toHaveBeenCalledWith("theme:preference-selected", expect.any(Function));
    const listener = onMock.mock.calls.find(([channel]) => channel === "theme:preference-selected")?.[1];
    listener?.({}, "light");

    const unsubscribe = desktop.theme.onPreferenceSelected(handlePreferenceSelected);

    expect(handlePreferenceSelected).toHaveBeenCalledWith("light");

    unsubscribe();
  });

  it("replays the most recent theme selection to late subscribers", async () => {
    await import("./preload");

    const desktop = exposeInMainWorldMock.mock.calls[0]?.[1] as ExposedDesktop;
    const firstSubscriber = vi.fn();
    const handlePreferenceSelected = vi.fn();

    const unsubscribeFirst = desktop.theme.onPreferenceSelected(firstSubscriber);
    const listener = onMock.mock.calls.find(([channel]) => channel === "theme:preference-selected")?.[1];
    listener?.({}, "dark");

    expect(firstSubscriber).toHaveBeenCalledWith("dark");

    unsubscribeFirst();

    const unsubscribe = desktop.theme.onPreferenceSelected(handlePreferenceSelected);

    expect(handlePreferenceSelected).toHaveBeenCalledWith("dark");

    unsubscribe();
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
