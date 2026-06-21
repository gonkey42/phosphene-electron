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
  storage: {
    ensureDirectories(): Promise<void>;
    runDailyBackup(): Promise<unknown>;
    readDroppedImage(path: string): Promise<{ name: string; mimeType: string; data: Uint8Array }>;
    readRemoteImage(url: string): Promise<{ name: string; mimeType: string; data: Uint8Array }>;
    writeBoardImage(boardId: string, fileId: string, mimeType: string, data: Uint8Array): Promise<string>;
    readBoardImage(path: string): Promise<Uint8Array | null>;
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
  boardPacks: {
    importFolder(packDir: string): Promise<{
      workspaceId: string;
      importedBoards: Array<{
        sourceId: string;
        boardId: string;
        name: string;
      }>;
    }>;
    onImported(callback: (result: {
      workspaceId: string;
      importedBoards: Array<{
        sourceId: string;
        boardId: string;
        name: string;
      }>;
    }) => void): () => void;
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

  it("reconstructs storage errors with their code preserved for renderer callers", async () => {
    invokeMock.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "EACCES",
        message: "permission denied",
      },
    });

    await import("./preload");

    const desktop = exposeInMainWorldMock.mock.calls[0]?.[1] as ExposedDesktop;

    await expect(desktop.storage.readDroppedImage("/private/file")).rejects.toMatchObject({
      message: "permission denied",
      code: "EACCES",
    });
  });

  it("returns storage values when the IPC result is successful", async () => {
    const fileBytes = Uint8Array.from([1, 2, 3]);

    invokeMock
      .mockResolvedValueOnce({
        ok: true,
        value: undefined,
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          name: "file.png",
          mimeType: "image/png",
          data: fileBytes,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          name: "remote.png",
          mimeType: "image/png",
          data: fileBytes,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: "/app/data/images/board-1_file-1.png",
      });

    await import("./preload");

    const desktop = exposeInMainWorldMock.mock.calls[0]?.[1] as ExposedDesktop;

    await expect(desktop.storage.ensureDirectories()).resolves.toBeUndefined();
    await expect(
      desktop.storage.readDroppedImage("/app/data/images/file.png"),
    ).resolves.toEqual({
      name: "file.png",
      mimeType: "image/png",
      data: fileBytes,
    });
    await expect(desktop.storage.readRemoteImage("https://example.com/photo.png")).resolves.toEqual({
      name: "remote.png",
      mimeType: "image/png",
      data: fileBytes,
    });
    await expect(
      desktop.storage.writeBoardImage("board-1", "file-1", "image/png", fileBytes),
    ).resolves.toBe("/app/data/images/board-1_file-1.png");
  });

  it("exposes the desktop surface without raw db, fs, or paths bridges", async () => {
    await import("./preload");

    const desktop = exposeInMainWorldMock.mock.calls[0]?.[1] as ExposedDesktop;

    expect(desktop).toEqual(
      expect.objectContaining({
        storage: expect.objectContaining({
          ensureDirectories: expect.any(Function),
          runDailyBackup: expect.any(Function),
          readDroppedImage: expect.any(Function),
          readRemoteImage: expect.any(Function),
          writeBoardImage: expect.any(Function),
          readBoardImage: expect.any(Function),
        }),
        boards: expect.objectContaining({
          createBoard: expect.any(Function),
        }),
        workspaces: expect.objectContaining({
          createWorkspace: expect.any(Function),
          reorderWorkspaces: expect.any(Function),
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

    expect(desktop).not.toHaveProperty("db");
    expect(desktop).not.toHaveProperty("fs");
    expect(desktop).not.toHaveProperty("paths");
  });

  it("exposes additive storage helpers for directory setup, backups, and board image IO", async () => {
    const imageBytes = Uint8Array.from([9, 8, 7]);

    invokeMock
      .mockResolvedValueOnce({ ok: true, value: undefined })
      .mockResolvedValueOnce({ ok: true, value: { status: "created", destinationPath: "/app/data/backups/phosphene-2026-04-19.db" } })
      .mockResolvedValueOnce({ ok: true, value: { name: "dropped.PNG", mimeType: "image/png", data: imageBytes } })
      .mockResolvedValueOnce({ ok: true, value: { name: "remote.png", mimeType: "image/png", data: imageBytes } })
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
          readRemoteImage: expect.any(Function),
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
    await expect(desktop.storage.readRemoteImage("https://example.com/photo.png")).resolves.toEqual({
      name: "remote.png",
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
      ["storage:read-remote-image", "https://example.com/photo.png"],
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

  it("exposes board pack folder import through the desktop API", async () => {
    const importResult = {
      workspaceId: "workspace-1",
      importedBoards: [
        {
          sourceId: "source-board-1",
          boardId: "board-1",
          name: "Starter Board",
        },
      ],
    };
    invokeMock.mockResolvedValueOnce(importResult);

    await import("./preload");

    const desktop = exposeInMainWorldMock.mock.calls[0]?.[1] as ExposedDesktop;

    await expect(desktop.boardPacks.importFolder("/packs/starter")).resolves.toBe(importResult);
    expect(exposeInMainWorldMock).toHaveBeenCalledWith(
      "desktop",
      expect.objectContaining({
        boardPacks: expect.objectContaining({
          importFolder: expect.any(Function),
        }),
      }),
    );
    expect(invokeMock).toHaveBeenCalledWith("board-packs:import-folder", "/packs/starter");
  });

  it("subscribes and unsubscribes board pack import notifications through ipcRenderer", async () => {
    await import("./preload");

    const desktop = exposeInMainWorldMock.mock.calls[0]?.[1] as ExposedDesktop;
    const handleImported = vi.fn();
    const importResult = {
      workspaceId: "workspace-1",
      importedBoards: [
        {
          sourceId: "source-board-1",
          boardId: "board-1",
          name: "Starter Board",
        },
      ],
    };

    const unsubscribe = desktop.boardPacks.onImported(handleImported);

    expect(onMock).toHaveBeenCalledWith("board-packs:imported", expect.any(Function));

    const listener = onMock.mock.calls.find(([channel]) => channel === "board-packs:imported")?.[1];
    listener?.({}, importResult);

    expect(handleImported).toHaveBeenCalledWith(importResult);

    unsubscribe();

    expect(offMock).toHaveBeenCalledWith("board-packs:imported", listener);
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
      .mockRejectedValueOnce(
        new Error(
          "[IPC storage:write-board-image] Invalid payload: expected data to be a Uint8Array",
        ),
      )
      .mockRejectedValueOnce(
        new Error(
          "[IPC storage:read-board-image] Invalid payload: expected board image path to stay within app data",
        ),
      );

    await import("./preload");

    const desktop = exposeInMainWorldMock.mock.calls[0]?.[1] as ExposedDesktop;

    await expect(
      desktop.storage.writeBoardImage("board-1", "file-1", "image/png", new Uint8Array()),
    ).rejects.toMatchObject({
      message: "[IPC storage:write-board-image] Invalid payload: expected data to be a Uint8Array",
    });
    await expect(desktop.storage.readBoardImage("images/board-1_file-1.png")).rejects.toThrow(
      "[IPC storage:read-board-image] Invalid payload: expected board image path to stay within app data",
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
