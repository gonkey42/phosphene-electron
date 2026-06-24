import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { initializeSchema } from "./schema";
import type { WebPublishManifest } from "../web-publish/types";

const handleMock = vi.fn();

vi.mock("electron", () => ({
  ipcMain: {
    handle: handleMock,
  },
}));

type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

const tempDirs: string[] = [];

async function createTempUserDataPath(): Promise<string> {
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), "phosphene-web-publish-ipc-"));
  tempDirs.push(dirPath);
  return dirPath;
}

function openSeedDatabase(userDataPath: string): Database.Database {
  const database = new Database(path.join(userDataPath, "phosphene.db"));
  initializeSchema(database);
  database.prepare("DELETE FROM boards").run();
  database.prepare("DELETE FROM workspaces").run();
  return database;
}

function insertWorkspace(database: Database.Database, id: string, name = "Trip Plan") {
  database
    .prepare("INSERT INTO workspaces (id, name, icon, position, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, name, null, 0, "2026-06-24T01:00:00.000Z");
}

function insertBoard(
  database: Database.Database,
  {
    id,
    workspaceId,
    name,
    position,
    canvasData,
  }: {
    id: string;
    workspaceId: string;
    name: string;
    position: number;
    canvasData: string;
  },
) {
  database
    .prepare(
      "INSERT INTO boards (id, workspace_id, name, position, canvas_data, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(id, workspaceId, name, position, canvasData, "2026-06-24T01:00:00.000Z");
}

async function registerHandlers(
  userDataPath: string,
  deploySite = vi.fn().mockResolvedValue({ deploymentUrl: "https://deploy.example" }),
) {
  const { closeDatabase } = await import("./database");
  closeDatabase();
  vi.resetModules();
  handleMock.mockReset();
  vi.doMock("electron", () => ({
    ipcMain: {
      handle: handleMock,
    },
  }));

  const { registerWebPublishIPC, WEB_PUBLISH_CHANNELS } = await import("./web-publish");
  registerWebPublishIPC(userDataPath, { deploySite });

  const getHandler = (channel: string): IpcHandler => {
    const handler = handleMock.mock.calls.find(
      ([registeredChannel]) => registeredChannel === channel,
    )?.[1];
    expect(handler).toBeTypeOf("function");
    return handler as IpcHandler;
  };

  return {
    deploySite,
    prepare: getHandler(WEB_PUBLISH_CHANNELS.prepareWorkspace),
    commit: getHandler(WEB_PUBLISH_CHANNELS.commitWorkspace),
    unpublish: getHandler(WEB_PUBLISH_CHANNELS.unpublishWorkspace),
    listStates: getHandler(WEB_PUBLISH_CHANNELS.listStates),
  };
}

async function seedWorkspaceWithBoards(userDataPath: string) {
  const database = openSeedDatabase(userDataPath);
  insertWorkspace(database, "workspace-1");
  insertBoard(database, {
    id: "board-2",
    workspaceId: "workspace-1",
    name: "Second",
    position: 1,
    canvasData: '{"elements":[{"id":"second"}]}',
  });
  insertBoard(database, {
    id: "board-1",
    workspaceId: "workspace-1",
    name: "First",
    position: 0,
    canvasData: '{"elements":[{"id":"first"}]}',
  });
  database.close();
}

async function publishWorkspace(
  handlers: { prepare: IpcHandler; commit: IpcHandler },
  workspaceId: string,
  boardImages: Record<string, Uint8Array>,
) {
  const prepared = (await handlers.prepare({}, workspaceId)) as { sourceFingerprint: string };
  return handlers.commit(
    {},
    {
      workspaceId,
      sourceFingerprint: prepared.sourceFingerprint,
      boardImages,
    },
  );
}

describe("registerWebPublishIPC", () => {
  beforeEach(async () => {
    handleMock.mockReset();
  });

  afterEach(async () => {
    const { closeDatabase } = await import("./database");
    closeDatabase();
    vi.resetModules();
    await Promise.all(
      tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
    );
  });

  it("prepares a workspace publish payload with board canvas data", async () => {
    const userDataPath = await createTempUserDataPath();
    await seedWorkspaceWithBoards(userDataPath);
    const { prepare } = await registerHandlers(userDataPath);

    const payload = await prepare({}, "workspace-1");

    expect(payload).toMatchObject({
      workspace: { id: "workspace-1", name: "Trip Plan" },
      boards: [
        {
          id: "board-1",
          name: "First",
          position: 0,
          canvasData: '{"elements":[{"id":"first"}]}',
        },
        {
          id: "board-2",
          name: "Second",
          position: 1,
          canvasData: '{"elements":[{"id":"second"}]}',
        },
      ],
    });
    expect((payload as { sourceFingerprint?: string }).sourceFingerprint).toEqual(
      expect.any(String),
    );
    expect((payload as { sourceFingerprint: string }).sourceFingerprint.length).toBeGreaterThan(0);
  });

  it("rejects commit payloads with a stale source fingerprint", async () => {
    const userDataPath = await createTempUserDataPath();
    await seedWorkspaceWithBoards(userDataPath);
    const deploySite = vi.fn().mockResolvedValue({ deploymentUrl: "https://deploy.example" });
    const { prepare, commit } = await registerHandlers(userDataPath, deploySite);
    const prepared = (await prepare({}, "workspace-1")) as { sourceFingerprint: string };
    const database = new Database(path.join(userDataPath, "phosphene.db"));
    database.prepare("UPDATE boards SET name = ? WHERE id = ?").run("Changed", "board-1");
    database.close();

    await expect(
      commit(
        {},
        {
          workspaceId: "workspace-1",
          sourceFingerprint: prepared.sourceFingerprint,
          boardImages: {
            "board-1": new Uint8Array([1, 2, 3]),
            "board-2": new Uint8Array([4, 5, 6]),
          },
        },
      ),
    ).rejects.toThrow("Workspace changed during publish; prepare the publish again");
    expect(deploySite).not.toHaveBeenCalled();
  });

  it("rejects commit payloads when board canvas data changes after prepare", async () => {
    const userDataPath = await createTempUserDataPath();
    await seedWorkspaceWithBoards(userDataPath);
    const deploySite = vi.fn().mockResolvedValue({ deploymentUrl: "https://deploy.example" });
    const { prepare, commit } = await registerHandlers(userDataPath, deploySite);
    const prepared = (await prepare({}, "workspace-1")) as { sourceFingerprint: string };
    const database = new Database(path.join(userDataPath, "phosphene.db"));
    database.exec("DROP TRIGGER IF EXISTS boards_updated_at");
    database
      .prepare("UPDATE boards SET canvas_data = ? WHERE id = ?")
      .run('{"elements":[{"id":"changed"}]}', "board-1");
    database.close();

    await expect(
      commit(
        {},
        {
          workspaceId: "workspace-1",
          sourceFingerprint: prepared.sourceFingerprint,
          boardImages: {
            "board-1": new Uint8Array([1, 2, 3]),
            "board-2": new Uint8Array([4, 5, 6]),
          },
        },
      ),
    ).rejects.toThrow("Workspace changed during publish; prepare the publish again");
    expect(deploySite).not.toHaveBeenCalled();
  });

  it("marks first-time publish deployment failures as publish-failed", async () => {
    const userDataPath = await createTempUserDataPath();
    await seedWorkspaceWithBoards(userDataPath);
    const deploySite = vi.fn().mockRejectedValue(new Error("Wrangler is not authenticated"));
    const { prepare, commit, listStates } = await registerHandlers(userDataPath, deploySite);
    const prepared = (await prepare({}, "workspace-1")) as { sourceFingerprint: string };

    await expect(
      commit(
        {},
        {
          workspaceId: "workspace-1",
          sourceFingerprint: prepared.sourceFingerprint,
          boardImages: {
            "board-1": new Uint8Array([1, 2, 3]),
            "board-2": new Uint8Array([4, 5, 6]),
          },
        },
      ),
    ).rejects.toThrow("Wrangler is not authenticated");

    await expect(listStates({})).resolves.toMatchObject({
      "workspace-1": {
        state: "publish-failed",
        hasPublishedSnapshot: false,
        lastError: "Wrangler is not authenticated",
      },
    });
    expect(deploySite).toHaveBeenCalledOnce();
  });

  it("keeps an old published snapshot when a republish fails before an unrelated deploy succeeds", async () => {
    const userDataPath = await createTempUserDataPath();
    await seedWorkspaceWithBoards(userDataPath);
    const database = new Database(path.join(userDataPath, "phosphene.db"));
    insertWorkspace(database, "workspace-2", "Other Plan");
    insertBoard(database, {
      id: "board-3",
      workspaceId: "workspace-2",
      name: "Other",
      position: 0,
      canvasData: '{"elements":[{"id":"other"}]}',
    });
    database.close();
    const deploySite = vi
      .fn()
      .mockResolvedValueOnce({ deploymentUrl: "https://deploy.example/initial" })
      .mockRejectedValueOnce(new Error("Wrangler deploy failed"))
      .mockResolvedValueOnce({ deploymentUrl: "https://deploy.example/other" });
    const { prepare, commit } = await registerHandlers(userDataPath, deploySite);

    await publishWorkspace({ prepare, commit }, "workspace-1", {
      "board-1": new Uint8Array([1, 1, 1]),
      "board-2": new Uint8Array([2, 2, 2]),
    });

    await expect(
      publishWorkspace({ prepare, commit }, "workspace-1", {
        "board-1": new Uint8Array([9, 9, 9]),
        "board-2": new Uint8Array([8, 8, 8]),
      }),
    ).rejects.toThrow("Wrangler deploy failed");

    await publishWorkspace({ prepare, commit }, "workspace-2", {
      "board-3": new Uint8Array([3, 3, 3]),
    });

    await expect(
      fs.readFile(
        path.join(userDataPath, "web-publish", "snapshots", "workspace-1", "boards", "board-1.png"),
      ),
    ).resolves.toEqual(Buffer.from([1, 1, 1]));
    await expect(
      fs.readFile(
        path.join(userDataPath, "web-publish", "site", "assets", "workspace-1", "board-1.png"),
      ),
    ).resolves.toEqual(Buffer.from([1, 1, 1]));
    await expect(
      fs.readFile(
        path.join(
          userDataPath,
          "web-publish",
          "failed-deployments",
          "workspace-1",
          "publish",
          "site",
          "assets",
          "workspace-1",
          "board-1.png",
        ),
      ),
    ).resolves.toEqual(Buffer.from([9, 9, 9]));
  });

  it("keeps first-time failed publishes out of later successful deployments", async () => {
    const userDataPath = await createTempUserDataPath();
    await seedWorkspaceWithBoards(userDataPath);
    const database = new Database(path.join(userDataPath, "phosphene.db"));
    insertWorkspace(database, "workspace-2", "Other Plan");
    insertBoard(database, {
      id: "board-3",
      workspaceId: "workspace-2",
      name: "Other",
      position: 0,
      canvasData: '{"elements":[{"id":"other"}]}',
    });
    database.close();
    const deploySite = vi
      .fn()
      .mockRejectedValueOnce(new Error("Wrangler deploy failed"))
      .mockResolvedValueOnce({ deploymentUrl: "https://deploy.example/other" });
    const { prepare, commit, listStates } = await registerHandlers(userDataPath, deploySite);

    await expect(
      publishWorkspace({ prepare, commit }, "workspace-1", {
        "board-1": new Uint8Array([1, 2, 3]),
        "board-2": new Uint8Array([4, 5, 6]),
      }),
    ).rejects.toThrow("Wrangler deploy failed");

    await expect(listStates({})).resolves.toMatchObject({
      "workspace-1": {
        state: "publish-failed",
        hasPublishedSnapshot: false,
        lastError: "Wrangler deploy failed",
      },
    });

    await publishWorkspace({ prepare, commit }, "workspace-2", {
      "board-3": new Uint8Array([3, 3, 3]),
    });

    const manifest = JSON.parse(
      await fs.readFile(path.join(userDataPath, "web-publish", "manifest.json"), "utf8"),
    ) as WebPublishManifest;
    expect(manifest.workspaces["workspace-1"]).toBeUndefined();
    expect(manifest.workspaces["workspace-2"]).toBeDefined();
    await expect(
      fs.readFile(path.join(userDataPath, "web-publish", "site", "index.html"), "utf8"),
    ).resolves.not.toContain("Trip Plan");
    await expect(
      fs
        .readFile(
          path.join(userDataPath, "web-publish", "site", "assets", "workspace-1", "board-1.png"),
        )
        .catch((error: unknown) => (error as NodeJS.ErrnoException).code),
    ).resolves.toBe("ENOENT");
  });

  it("writes workspace snapshots and deploys the regenerated site", async () => {
    const userDataPath = await createTempUserDataPath();
    await seedWorkspaceWithBoards(userDataPath);
    const deploySite = vi.fn().mockResolvedValue({ deploymentUrl: "https://deploy.example" });
    const { prepare, commit } = await registerHandlers(userDataPath, deploySite);
    const prepared = (await prepare({}, "workspace-1")) as { sourceFingerprint: string };

    await commit(
      {},
      {
        workspaceId: "workspace-1",
        sourceFingerprint: prepared.sourceFingerprint,
        boardImages: {
          "board-1": new Uint8Array([1, 2, 3]),
          "board-2": new Uint8Array([4, 5, 6]),
        },
      },
    );

    await expect(
      fs.readFile(path.join(userDataPath, "web-publish", "manifest.json"), "utf8"),
    ).resolves.toContain("workspace-1");
    const snapshot = JSON.parse(
      await fs.readFile(
        path.join(userDataPath, "web-publish", "snapshots", "workspace-1", "workspace.json"),
        "utf8",
      ),
    ) as { boards: Array<{ id: string; imageFile: string }> };
    expect(snapshot.boards.map((board) => board.id)).toEqual(["board-1", "board-2"]);
    await expect(
      fs.readFile(path.join(userDataPath, "web-publish", "site", "index.html"), "utf8"),
    ).resolves.toContain("Trip Plan");
    await expect(
      fs.readFile(
        path.join(userDataPath, "web-publish", "snapshots", "workspace-1", "boards", "board-1.png"),
      ),
    ).resolves.toEqual(Buffer.from([1, 2, 3]));
    await expect(
      fs.readFile(
        path.join(userDataPath, "web-publish", "snapshots", "workspace-1", "boards", "board-2.png"),
      ),
    ).resolves.toEqual(Buffer.from([4, 5, 6]));
    await expect(
      fs.readFile(
        path.join(userDataPath, "web-publish", "site", "assets", "workspace-1", "board-1.png"),
      ),
    ).resolves.toEqual(Buffer.from([1, 2, 3]));
    await expect(
      fs.readFile(
        path.join(userDataPath, "web-publish", "site", "assets", "workspace-1", "board-2.png"),
      ),
    ).resolves.toEqual(Buffer.from([4, 5, 6]));
    expect(deploySite).toHaveBeenCalledOnce();
  });

  it("unpublishes a workspace and deploys the regenerated site", async () => {
    const userDataPath = await createTempUserDataPath();
    const publishRoot = path.join(userDataPath, "web-publish");
    const snapshotDir = path.join(publishRoot, "snapshots", "workspace-1");
    await fs.mkdir(path.join(snapshotDir, "boards"), { recursive: true });
    const manifest: WebPublishManifest = {
      schemaVersion: 1,
      projectName: "phosphene",
      hostname: "phosphene.gonkey.org",
      workspaces: {
        "workspace-1": {
          workspaceId: "workspace-1",
          slug: "trip-plan",
          name: "Trip Plan",
          sourceFingerprint: "old-fingerprint",
          publishedAt: "2026-06-24T01:00:00.000Z",
          lastDeploymentUrl: "https://old.example",
          lastError: null,
        },
      },
    };
    await fs.writeFile(
      path.join(publishRoot, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await fs.writeFile(
      path.join(snapshotDir, "workspace.json"),
      JSON.stringify({
        workspace: { id: "workspace-1", name: "Trip Plan", slug: "trip-plan" },
        boards: [{ id: "board-1", name: "First", position: 0, imageFile: "board-1.png" }],
      }),
    );
    await fs.writeFile(path.join(snapshotDir, "boards", "board-1.png"), "png");
    const deploySite = vi.fn().mockResolvedValue({ deploymentUrl: "https://deploy.example" });
    const { unpublish } = await registerHandlers(userDataPath, deploySite);

    await unpublish({}, "workspace-1");

    const updatedManifest = JSON.parse(
      await fs.readFile(path.join(publishRoot, "manifest.json"), "utf8"),
    ) as WebPublishManifest;
    expect(updatedManifest.workspaces["workspace-1"]).toBeUndefined();
    await expect(
      fs.readFile(path.join(publishRoot, "site", "index.html"), "utf8"),
    ).resolves.not.toContain("Trip Plan");
    await expect(
      fs
        .readFile(path.join(publishRoot, "site", "workspaces", "trip-plan", "index.html"), "utf8")
        .catch((error: unknown) => (error as NodeJS.ErrnoException).code),
    ).resolves.toBe("ENOENT");
    expect(deploySite).toHaveBeenCalledOnce();
  });

  it("keeps published local artifacts when unpublish deployment fails", async () => {
    const userDataPath = await createTempUserDataPath();
    await seedWorkspaceWithBoards(userDataPath);
    const deploySite = vi
      .fn()
      .mockResolvedValueOnce({ deploymentUrl: "https://deploy.example/publish" })
      .mockRejectedValueOnce(new Error("Wrangler deploy failed"));
    const { prepare, commit, unpublish } = await registerHandlers(userDataPath, deploySite);

    await publishWorkspace({ prepare, commit }, "workspace-1", {
      "board-1": new Uint8Array([1, 2, 3]),
      "board-2": new Uint8Array([4, 5, 6]),
    });

    await expect(unpublish({}, "workspace-1")).rejects.toThrow("Wrangler deploy failed");

    const manifest = JSON.parse(
      await fs.readFile(path.join(userDataPath, "web-publish", "manifest.json"), "utf8"),
    ) as WebPublishManifest;
    expect(manifest.workspaces["workspace-1"]?.lastError).toBe("Wrangler deploy failed");
    await expect(
      fs.readFile(path.join(userDataPath, "web-publish", "site", "index.html"), "utf8"),
    ).resolves.toContain("Trip Plan");
    await expect(
      fs.readFile(
        path.join(
          userDataPath,
          "web-publish",
          "failed-deployments",
          "workspace-1",
          "unpublish",
          "site",
          "index.html",
        ),
        "utf8",
      ),
    ).resolves.not.toContain("Trip Plan");
    await expect(
      fs.readFile(
        path.join(userDataPath, "web-publish", "snapshots", "workspace-1", "boards", "board-1.png"),
      ),
    ).resolves.toEqual(Buffer.from([1, 2, 3]));
  });

  it("rejects board image payloads that are not Uint8Array values", async () => {
    const userDataPath = await createTempUserDataPath();
    await seedWorkspaceWithBoards(userDataPath);
    const deploySite = vi.fn().mockResolvedValue({ deploymentUrl: "https://deploy.example" });
    const { prepare, commit } = await registerHandlers(userDataPath, deploySite);
    const prepared = (await prepare({}, "workspace-1")) as { sourceFingerprint: string };

    await expect(
      commit(
        {},
        {
          workspaceId: "workspace-1",
          sourceFingerprint: prepared.sourceFingerprint,
          boardImages: {
            "board-1": "not bytes",
            "board-2": new Uint8Array([4, 5, 6]),
          },
        },
      ),
    ).rejects.toThrow(/^expected board image data to be a Uint8Array$/);
    expect(deploySite).not.toHaveBeenCalled();
  });

  it("rejects traversal-shaped workspace and board ids before writing publish artifacts", async () => {
    const userDataPath = await createTempUserDataPath();
    const database = openSeedDatabase(userDataPath);
    insertWorkspace(database, "../workspace-outside", "Traversal");
    insertBoard(database, {
      id: "../board-outside",
      workspaceId: "../workspace-outside",
      name: "Traversal Board",
      position: 0,
      canvasData: '{"elements":[]}',
    });
    database.close();
    const deploySite = vi.fn().mockResolvedValue({ deploymentUrl: "https://deploy.example" });
    const { prepare, commit } = await registerHandlers(userDataPath, deploySite);

    await expect(
      publishWorkspace({ prepare, commit }, "../workspace-outside", {
        "../board-outside": new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toThrow("Unsafe web publish path segment");
    expect(deploySite).not.toHaveBeenCalled();
    await expect(
      fs
        .readFile(path.join(userDataPath, "workspace-outside", "boards", "..", "board-outside.png"))
        .catch((error: unknown) => (error as NodeJS.ErrnoException).code),
    ).resolves.toBe("ENOENT");
  });
});
