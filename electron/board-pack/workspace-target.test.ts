import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  closeDatabase,
  createWorkspace,
  getDatabase,
  setActiveWorkspaceIdDirect,
} from "../ipc/database";
import {
  resolveBoardPackWorkspaceTarget,
  type BoardPackWorkspaceTarget,
} from "./workspace-target";

const tempDirs: string[] = [];

async function createTempUserDataPath(): Promise<string> {
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), "phosphene-target-resolver-"));
  tempDirs.push(dirPath);
  return dirPath;
}

async function createTestDatabase(): Promise<Database.Database> {
  const userDataPath = await createTempUserDataPath();
  return getDatabase(userDataPath);
}

function softDeleteWorkspace(database: Database.Database, workspaceId: string): void {
  database
    .prepare("UPDATE workspaces SET deleted_at = datetime('now','utc') WHERE id = ?")
    .run(workspaceId);
}

describe("resolveBoardPackWorkspaceTarget", () => {
  afterEach(async () => {
    closeDatabase();
    await Promise.all(
      tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
    );
  });

  async function resolve(target?: BoardPackWorkspaceTarget) {
    const database = await createTestDatabase();
    return { database, workspaceId: resolveBoardPackWorkspaceTarget(database, target) };
  }

  it("returns null when no target is supplied", async () => {
    const { workspaceId } = await resolve();
    expect(workspaceId).toBeNull();
  });

  it("returns null when an explicit new target is supplied", async () => {
    const { workspaceId } = await resolve({ type: "new" });
    expect(workspaceId).toBeNull();
  });

  it("resolves an active workspace by id", async () => {
    const database = await createTestDatabase();
    const workspaceId = createWorkspace(database, "Vacation Plan", null);

    expect(resolveBoardPackWorkspaceTarget(database, { type: "id", id: workspaceId })).toBe(
      workspaceId,
    );
  });

  it("trims target ids before resolution", async () => {
    const database = await createTestDatabase();
    const workspaceId = createWorkspace(database, "Vacation Plan", null);

    expect(resolveBoardPackWorkspaceTarget(database, { type: "id", id: `  ${workspaceId}\n` })).toBe(
      workspaceId,
    );
  });

  it("rejects blank target ids", async () => {
    const { database } = await resolve();
    expect(() => resolveBoardPackWorkspaceTarget(database, { type: "id", id: " \n\t " })).toThrow(
      "Target workspace id must be a non-empty string",
    );
  });

  it("rejects deleted target ids", async () => {
    const database = await createTestDatabase();
    const workspaceId = createWorkspace(database, "Vacation Plan", null);
    softDeleteWorkspace(database, workspaceId);

    expect(() => resolveBoardPackWorkspaceTarget(database, { type: "id", id: workspaceId })).toThrow(
      `Target workspace ${workspaceId} does not exist or has been deleted`,
    );
  });

  it("resolves a workspace by exact name", async () => {
    const database = await createTestDatabase();
    const workspaceId = createWorkspace(database, "Vacation Plan", null);

    expect(resolveBoardPackWorkspaceTarget(database, { type: "name", name: "Vacation Plan" })).toBe(
      workspaceId,
    );
  });

  it("trims target names before resolution", async () => {
    const database = await createTestDatabase();
    const workspaceId = createWorkspace(database, "Vacation Plan", null);

    expect(
      resolveBoardPackWorkspaceTarget(database, { type: "name", name: "\tVacation Plan  " }),
    ).toBe(workspaceId);
  });

  it("does not trim stored workspace names during resolution", async () => {
    const database = await createTestDatabase();
    createWorkspace(database, " Vacation Plan ", null);

    expect(() =>
      resolveBoardPackWorkspaceTarget(database, { type: "name", name: "Vacation Plan" }),
    ).toThrow('Target workspace name "Vacation Plan" does not exist');
  });

  it("rejects blank target names", async () => {
    const { database } = await resolve();
    expect(() =>
      resolveBoardPackWorkspaceTarget(database, { type: "name", name: " \n\t " }),
    ).toThrow("Target workspace name must be a non-empty string");
  });

  it("rejects missing target names", async () => {
    const { database } = await resolve();
    expect(() =>
      resolveBoardPackWorkspaceTarget(database, { type: "name", name: "Missing Workspace" }),
    ).toThrow('Target workspace name "Missing Workspace" does not exist');
  });

  it("matches workspace names case-sensitively", async () => {
    const database = await createTestDatabase();
    createWorkspace(database, "Vacation Plan", null);

    expect(() =>
      resolveBoardPackWorkspaceTarget(database, { type: "name", name: "vacation plan" }),
    ).toThrow('Target workspace name "vacation plan" does not exist');
  });

  it("rejects deleted target names", async () => {
    const database = await createTestDatabase();
    const workspaceId = createWorkspace(database, "Vacation Plan", null);
    softDeleteWorkspace(database, workspaceId);

    expect(() =>
      resolveBoardPackWorkspaceTarget(database, { type: "name", name: "Vacation Plan" }),
    ).toThrow('Target workspace name "Vacation Plan" does not exist');
  });

  it("resolves the stored active workspace", async () => {
    const database = await createTestDatabase();
    const workspaceId = createWorkspace(database, "Vacation Plan", null);
    setActiveWorkspaceIdDirect(database, workspaceId);

    expect(resolveBoardPackWorkspaceTarget(database, { type: "active" })).toBe(workspaceId);
  });

  it("rejects missing target ids before import writes begin", async () => {
    const { database } = await resolve();
    expect(() =>
      resolveBoardPackWorkspaceTarget(database, { type: "id", id: "missing-workspace" }),
    ).toThrow("Target workspace missing-workspace does not exist or has been deleted");
  });

  it("rejects duplicate target names", async () => {
    const database = await createTestDatabase();
    createWorkspace(database, "Vacation Plan", null);
    createWorkspace(database, "Vacation Plan", null);

    expect(() =>
      resolveBoardPackWorkspaceTarget(database, { type: "name", name: "Vacation Plan" }),
    ).toThrow('Target workspace name "Vacation Plan" is ambiguous; use --target-workspace-id');
  });

  it("rejects active targeting when no active workspace is saved", async () => {
    const { database } = await resolve();
    expect(() => resolveBoardPackWorkspaceTarget(database, { type: "active" })).toThrow(
      "No active workspace is saved",
    );
  });

  it("rejects active targeting when the saved active workspace is deleted", async () => {
    const database = await createTestDatabase();
    const workspaceId = createWorkspace(database, "Vacation Plan", null);
    setActiveWorkspaceIdDirect(database, workspaceId);
    softDeleteWorkspace(database, workspaceId);

    expect(() => resolveBoardPackWorkspaceTarget(database, { type: "active" })).toThrow(
      `Target workspace ${workspaceId} does not exist or has been deleted`,
    );
  });
});
