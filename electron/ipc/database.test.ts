import { beforeEach, describe, expect, it, vi } from "vitest";

const handleMock = vi.fn();
const execMock = vi.fn();
const prepareMock = vi.fn();
const runMock = vi.fn();
const allMock = vi.fn();
const getMock = vi.fn();
const backupMock = vi.fn();
const pragmaMock = vi.fn();
const closeMock = vi.fn();
const databaseConstructorMock = vi.fn();
const accessMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("node:fs/promises", () => ({
  default: {
    access: accessMock,
  },
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: handleMock,
  },
}));

vi.mock("better-sqlite3", () => {
  const DatabaseMock = function (this: object, filePath: string) {
    databaseConstructorMock(filePath);
    return {
      pragma: pragmaMock,
      exec: execMock,
      prepare: prepareMock,
      transaction: transactionMock,
      backup: backupMock,
      close: closeMock,
    };
  };

  return { default: DatabaseMock };
});

describe("registerDatabaseIPC", () => {
  beforeEach(() => {
    vi.resetModules();
    handleMock.mockReset();
    execMock.mockReset();
    prepareMock.mockReset();
    runMock.mockReset();
    allMock.mockReset();
    getMock.mockReset();
    backupMock.mockReset();
    pragmaMock.mockReset();
    closeMock.mockReset();
    databaseConstructorMock.mockReset();
    accessMock.mockReset();
    transactionMock.mockReset();

    prepareMock.mockReturnValue({
      run: runMock,
      all: allMock,
      get: getMock,
    });
    runMock.mockReturnValue({ changes: 1 });
    allMock.mockReturnValue([]);
    getMock.mockReturnValue({ count: 1 });
    backupMock.mockResolvedValue({ totalPages: 4, remainingPages: 0 });
    transactionMock.mockImplementation((callback: (...args: any[]) => unknown) => {
      return (...args: any[]) => callback(...args);
    });
  });

  it("reorders positional parameters to match placeholder order for execute handlers", async () => {
    const { registerDatabaseIPC } = await import("./database");

    registerDatabaseIPC("/app/data");

    const executeHandler = handleMock.mock.calls.find(([channel]) => channel === "db:execute")?.[1];

    expect(executeHandler).toBeTypeOf("function");

    executeHandler(
      {},
      "UPDATE boards SET name = $2, canvas_data = $3 WHERE id = $1 AND deleted_at IS NULL",
      ["board-1", "Updated board", "{\"type\":\"excalidraw\"}"],
    );

    expect(prepareMock).toHaveBeenCalledWith(
      "UPDATE boards SET name = ?, canvas_data = ? WHERE id = ? AND deleted_at IS NULL",
    );
    expect(runMock).toHaveBeenCalledWith(
      "Updated board",
      "{\"type\":\"excalidraw\"}",
      "board-1",
    );
  });

  it("rejects malformed execute payloads before touching SQLite internals", async () => {
    const { registerDatabaseIPC } = await import("./database");

    registerDatabaseIPC("/app/data");
    const prepareCallsBefore = prepareMock.mock.calls.length;
    const runCallsBefore = runMock.mock.calls.length;

    const executeHandler = handleMock.mock.calls.find(([channel]) => channel === "db:execute")?.[1];

    await expect(executeHandler({}, 42, [])).rejects.toThrow(
      "[IPC db:execute] Invalid payload: expected sql to be a string",
    );
    await expect(executeHandler({}, "SELECT 1", { bad: true })).rejects.toThrow(
      "[IPC db:execute] Invalid payload: expected params to be an array",
    );

    expect(prepareMock.mock.calls.length).toBe(prepareCallsBefore);
    expect(runMock.mock.calls.length).toBe(runCallsBefore);
  });

  it("rejects malformed select payloads before preparing SQL", async () => {
    const { registerDatabaseIPC } = await import("./database");

    registerDatabaseIPC("/app/data");
    const prepareCallsBefore = prepareMock.mock.calls.length;
    const allCallsBefore = allMock.mock.calls.length;

    const selectHandler = handleMock.mock.calls.find(([channel]) => channel === "db:select")?.[1];

    await expect(selectHandler({}, null, [])).rejects.toThrow(
      "[IPC db:select] Invalid payload: expected sql to be a string",
    );
    await expect(selectHandler({}, "SELECT 1", "not-an-array")).rejects.toThrow(
      "[IPC db:select] Invalid payload: expected params to be an array",
    );

    expect(prepareMock.mock.calls.length).toBe(prepareCallsBefore);
    expect(allMock.mock.calls.length).toBe(allCallsBefore);
  });

  it("rejects malformed backup payloads with a normalized contract error", async () => {
    const { registerDatabaseIPC } = await import("./database");

    registerDatabaseIPC("/app/data");

    const backupHandler = handleMock.mock.calls.find(([channel]) => channel === "db:backup")?.[1];

    await expect(backupHandler({}, 99)).rejects.toThrow(
      "[IPC db:backup] Invalid payload: expected destinationPath to be a string",
    );
    expect(backupMock).not.toHaveBeenCalled();
  });

  it("backs up the database through SQLite instead of copying the db file directly", async () => {
    accessMock.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));

    const { registerDatabaseIPC } = await import("./database");

    registerDatabaseIPC("/app/data");

    const backupHandler = handleMock.mock.calls.find(([channel]) => channel === "db:backup")?.[1];

    expect(backupHandler).toBeTypeOf("function");

    await expect(backupHandler({}, "/app/data/backups/phosphene-2026-03-30.db")).resolves.toEqual({
      status: "created",
      destinationPath: "/app/data/backups/phosphene-2026-03-30.db",
    });
    expect(backupMock).toHaveBeenCalledWith("/app/data/backups/phosphene-2026-03-30.db");
  });

  it("skips backup when the destination file already exists", async () => {
    accessMock.mockResolvedValue(undefined);

    const { registerDatabaseIPC } = await import("./database");

    registerDatabaseIPC("/app/data");

    const backupHandler = handleMock.mock.calls.find(([channel]) => channel === "db:backup")?.[1];

    await expect(backupHandler({}, "/app/data/backups/phosphene-2026-03-30.db")).resolves.toEqual({
      status: "skipped",
      reason: "already-exists",
      destinationPath: "/app/data/backups/phosphene-2026-03-30.db",
    });
    expect(backupMock).not.toHaveBeenCalled();
  });

  it("returns a precise failure cause when the SQLite backup fails", async () => {
    accessMock.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
    backupMock.mockRejectedValue(
      Object.assign(new Error("permission denied"), {
        code: "EACCES",
      }),
    );

    const { registerDatabaseIPC } = await import("./database");

    registerDatabaseIPC("/app/data");

    const backupHandler = handleMock.mock.calls.find(([channel]) => channel === "db:backup")?.[1];

    await expect(backupHandler({}, "/app/data/backups/phosphene-2026-03-30.db")).resolves.toEqual({
      status: "failed",
      reason: "permission-denied",
      destinationPath: "/app/data/backups/phosphene-2026-03-30.db",
      message: "permission denied",
    });
  });

  it("bootstraps schema before focused create handlers run on a fresh database", async () => {
    const prepareMap = new Map<string, { get?: () => unknown; run?: (...args: unknown[]) => unknown }>();
    prepareMock.mockImplementation((sql: string) => {
      if (sql === "SELECT MAX(version) as version FROM schema_version") {
        return {
          get: () => ({ version: null }),
        };
      }

      if (
        sql ===
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'"
      ) {
        return {
          get: () => undefined,
        };
      }

      if (sql === "INSERT INTO schema_version (version) VALUES (?)") {
        return {
          run: runMock,
        };
      }

      if (sql === "SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL") {
        return {
          get: () => ({ count: 0 }),
        };
      }

      if (sql === "SELECT COALESCE(MAX(position), -1) + 1 as position FROM boards WHERE deleted_at IS NULL AND workspace_id IS NULL") {
        return {
          get: () => ({ position: 0 }),
        };
      }

      if (sql === "SELECT COALESCE(MAX(position), -1) + 1 as position FROM workspaces WHERE deleted_at IS NULL") {
        return {
          get: () => ({ position: 1 }),
        };
      }

      const prepared = prepareMap.get(sql);
      if (prepared) {
        return prepared;
      }

      const statement = {
        run: runMock,
        all: allMock,
        get: getMock,
      };
      prepareMap.set(sql, statement);
      return statement;
    });
    execMock.mockImplementation((sql: string) => {
      return sql;
    });

    const { registerDatabaseIPC } = await import("./database");

    registerDatabaseIPC("/fresh-data");

    expect(pragmaMock).toHaveBeenCalledWith("journal_mode = WAL");
    expect(pragmaMock).toHaveBeenCalledWith("foreign_keys = ON");
    expect(
      execMock.mock.calls.some(([sql]) => String(sql).includes("CREATE TABLE IF NOT EXISTS workspaces")),
    ).toBe(true);
    expect(
      execMock.mock.calls.some(([sql]) => String(sql).includes("CREATE TRIGGER IF NOT EXISTS boards_updated_at")),
    ).toBe(true);
    expect(prepareMock).toHaveBeenCalledWith(
      "SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL",
    );

    const createBoardHandler = handleMock.mock.calls.find(([channel]) => channel === "boards:create")?.[1];
    const createWorkspaceHandler = handleMock.mock.calls.find(([channel]) => channel === "workspaces:create")?.[1];

    expect(createBoardHandler).toBeTypeOf("function");
    expect(createWorkspaceHandler).toBeTypeOf("function");

    const boardId = await createBoardHandler({}, "Fresh board", null);
    const workspaceId = await createWorkspaceHandler({}, "Fresh workspace", "🪟");

    expect(boardId).toMatch(/^[a-f0-9]{32}$/);
    expect(workspaceId).toMatch(/^[a-f0-9]{32}$/);
  });

  it("creates a board within a single transaction so the computed position and insert stay coupled", async () => {
    const state = {
      boards: [
        { id: "board-1", workspace_id: null, position: 0 },
        { id: "board-2", workspace_id: null, position: 1 },
      ] as Array<{ id: string; workspace_id: string | null; position: number }>,
    };
    let inTransaction = false;
    let insertedBoardId: string | null = null;

    const database = {
      prepare(sql: string) {
        if (
          sql ===
          "SELECT COALESCE(MAX(position), -1) + 1 as position FROM boards WHERE deleted_at IS NULL AND workspace_id IS NULL"
        ) {
          return {
            get() {
              expect(inTransaction).toBe(true);
              return { position: Math.max(...state.boards.map((board) => board.position)) + 1 };
            },
          };
        }

        if (sql === "INSERT INTO boards (id, workspace_id, name, position) VALUES (?, ?, ?, ?)") {
          return {
            run(id: string, workspaceId: string | null, name: string, position: number) {
              expect(inTransaction).toBe(true);
              insertedBoardId = id;
              state.boards.push({ id, workspace_id: workspaceId, position });
              return { changes: 1 };
            },
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
      transaction(callback: (...args: any[]) => unknown) {
        return (...args: any[]) => {
          inTransaction = true;
          try {
            return callback(...args);
          } finally {
            inTransaction = false;
          }
        };
      },
    };

    const { createBoard } = await import("./database");
    const boardId = await createBoard(database as never, "New board", null);

    expect(boardId).toBe(insertedBoardId);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(state.boards).toEqual([
      { id: "board-1", workspace_id: null, position: 0 },
      { id: "board-2", workspace_id: null, position: 1 },
      { id: boardId, workspace_id: null, position: 2 },
    ]);
  });

  it("creates a workspace within a single transaction so the computed position and insert stay coupled", async () => {
    const state = {
      workspaces: [
        { id: "workspace-1", position: 0 },
        { id: "workspace-2", position: 1 },
      ],
    };
    let inTransaction = false;
    let insertedWorkspaceId: string | null = null;

    const database = {
      prepare(sql: string) {
        if (
          sql ===
          "SELECT COALESCE(MAX(position), -1) + 1 as position FROM workspaces WHERE deleted_at IS NULL"
        ) {
          return {
            get() {
              expect(inTransaction).toBe(true);
              return { position: Math.max(...state.workspaces.map((workspace) => workspace.position)) + 1 };
            },
          };
        }

        if (sql === "INSERT INTO workspaces (id, name, icon, position) VALUES (?, ?, ?, ?)") {
          return {
            run(id: string, name: string, icon: string | null, position: number) {
              expect(inTransaction).toBe(true);
              insertedWorkspaceId = id;
              state.workspaces.push({ id, position });
              return { changes: 1 };
            },
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
      transaction(callback: (...args: any[]) => unknown) {
        return (...args: any[]) => {
          inTransaction = true;
          try {
            return callback(...args);
          } finally {
            inTransaction = false;
          }
        };
      },
    };

    const { createWorkspace } = await import("./database");
    const workspaceId = await createWorkspace(database as never, "New workspace", "🪟");

    expect(workspaceId).toBe(insertedWorkspaceId);
    expect(state.workspaces).toEqual([
      { id: "workspace-1", position: 0 },
      { id: "workspace-2", position: 1 },
      { id: workspaceId, position: 2 },
    ]);
  });

  it("rolls back a workspace reorder when an update affects zero rows", async () => {
    const state = {
      workspaces: [
        { id: "workspace-1", position: 0 },
        { id: "workspace-2", position: 1 },
      ],
    };
    let inTransaction = false;

    const database = {
      prepare(sql: string) {
        if (sql === "UPDATE workspaces SET position = ? WHERE id = ? AND deleted_at IS NULL") {
          return {
            run(position: number, id: string) {
              expect(inTransaction).toBe(true);
              const workspace = state.workspaces.find((entry) => entry.id === id);
              if (!workspace) {
                return { changes: 0 };
              }

              workspace.position = position;
              return id === "workspace-2" ? { changes: 0 } : { changes: 1 };
            },
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
      transaction(callback: (...args: any[]) => unknown) {
        return (...args: any[]) => {
          inTransaction = true;
          const snapshot = structuredClone(state);
          try {
            return callback(...args);
          } catch (error) {
            state.workspaces = snapshot.workspaces;
            throw error;
          } finally {
            inTransaction = false;
          }
        };
      },
    };

    const { reorderWorkspaces } = await import("./database");

    expect(() => reorderWorkspaces(database as never, ["workspace-1", "workspace-2"])).toThrow(
      "Workspace reorder affected 0 rows",
    );
    expect(state.workspaces).toEqual([
      { id: "workspace-1", position: 0 },
      { id: "workspace-2", position: 1 },
    ]);
  });

  it("rolls back a workspace reorder if a later update fails", async () => {
    const state = {
      workspaces: [
        { id: "workspace-1", position: 0 },
        { id: "workspace-2", position: 1 },
      ],
    };
    let inTransaction = false;

    const database = {
      prepare(sql: string) {
        if (sql === "UPDATE workspaces SET position = ? WHERE id = ? AND deleted_at IS NULL") {
          return {
            run(position: number, id: string) {
              expect(inTransaction).toBe(true);
              const workspace = state.workspaces.find((entry) => entry.id === id);
              if (!workspace) {
                throw new Error(`Missing workspace: ${id}`);
              }

              workspace.position = position;

              if (id === "workspace-2") {
                throw new Error("update failed");
              }
              return { changes: 1 };
            },
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
      transaction(callback: (...args: any[]) => unknown) {
        return (...args: any[]) => {
          inTransaction = true;
          const snapshot = structuredClone(state);
          try {
            return callback(...args);
          } catch (error) {
            state.workspaces = snapshot.workspaces;
            throw error;
          } finally {
            inTransaction = false;
          }
        };
      },
    };

    const { reorderWorkspaces } = await import("./database");

    expect(() => reorderWorkspaces(database as never, ["workspace-1", "workspace-2"])).toThrow(
      "update failed",
    );
    expect(state.workspaces).toEqual([
      { id: "workspace-1", position: 0 },
      { id: "workspace-2", position: 1 },
    ]);
  });
});
