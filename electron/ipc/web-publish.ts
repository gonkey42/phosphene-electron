import { ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type Database from "better-sqlite3";
import { getDatabase } from "./database";
import { deployWebPublishSite } from "../web-publish/deployer";
import {
  assertSafeWebPublishPathSegment,
  resolveInsideWebPublishRoot,
} from "../web-publish/artifact-paths";
import {
  getWebPublishRoot,
  readWebPublishManifest,
  writeWebPublishManifest,
} from "../web-publish/manifest-store";
import { createWorkspaceSlug, ensureUniqueWorkspaceSlug } from "../web-publish/slug";
import { createWorkspaceSourceFingerprint } from "../web-publish/source-fingerprint";
import {
  type WebPublishBoardSource,
  type WebPublishManifest,
  type WebPublishWorkspaceManifestEntry,
  type WebPublishWorkspaceSource,
} from "../web-publish/types";
import { generateWebPublishSite } from "../web-publish/site-generator";

export const WEB_PUBLISH_CHANNELS = {
  listStates: "web-publish:list-states",
  prepareWorkspace: "web-publish:prepare-workspace",
  commitWorkspace: "web-publish:commit-workspace",
  unpublishWorkspace: "web-publish:unpublish-workspace",
} as const;

type DeploySite = (options: {
  outputDir: string;
  projectName: string;
}) => Promise<{ deploymentUrl: string | null }>;

export type RegisterWebPublishIPCOptions = {
  deploySite?: DeploySite;
};

type WorkspaceRow = {
  id: string;
  name: string;
  updated_at: string;
};

type BoardRow = {
  id: string;
  name: string;
  position: number;
  canvas_data: string | null;
  updated_at: string;
};

type PreparedWorkspace = {
  workspace: WebPublishWorkspaceSource;
  boards: WebPublishBoardSource[];
  sourceFingerprint: string;
};

type CommitWorkspacePayload = {
  workspaceId: string;
  sourceFingerprint: string;
  boardImages: Record<string, Uint8Array>;
};

const GET_WORKSPACE_SOURCE_SQL =
  "SELECT id, name, updated_at FROM workspaces WHERE id = ? AND deleted_at IS NULL LIMIT 1";
const LIST_BOARD_SOURCES_SQL =
  "SELECT id, name, position, canvas_data, updated_at FROM boards WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY position, id";

function createIPCContractError(channel: string, message: string): Error {
  return new Error(`[IPC ${channel}] Invalid payload: ${message}`);
}

function assertStringPayload(channel: string, value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw createIPCContractError(channel, `expected ${name} to be a non-empty string`);
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toWorkspaceSource(row: WorkspaceRow): WebPublishWorkspaceSource {
  return {
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at,
  };
}

function toBoardSource(row: BoardRow): WebPublishBoardSource {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    canvasData: row.canvas_data,
    updatedAt: row.updated_at,
  };
}

function prepareWorkspaceSource(
  database: Database.Database,
  workspaceId: string,
): PreparedWorkspace {
  const workspaceRow = database.prepare(GET_WORKSPACE_SOURCE_SQL).get(workspaceId) as
    | WorkspaceRow
    | undefined;

  if (!workspaceRow) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  const boardRows = database.prepare(LIST_BOARD_SOURCES_SQL).all(workspaceId) as BoardRow[];
  const workspace = toWorkspaceSource(workspaceRow);
  const boards = boardRows.map(toBoardSource);
  const sourceFingerprint = createWorkspaceSourceFingerprint({
    workspace,
    boards,
  });

  return {
    workspace,
    boards,
    sourceFingerprint,
  };
}

function assertCommitPayload(channel: string, value: unknown): CommitWorkspacePayload {
  if (!isPlainObject(value)) {
    throw createIPCContractError(channel, "expected payload to be a plain object");
  }

  const workspaceId = assertStringPayload(channel, value.workspaceId, "workspaceId");
  const sourceFingerprint = assertStringPayload(
    channel,
    value.sourceFingerprint,
    "sourceFingerprint",
  );

  if (!isPlainObject(value.boardImages)) {
    throw createIPCContractError(channel, "expected boardImages to be a plain object");
  }

  const boardImages: Record<string, Uint8Array> = {};
  for (const [boardId, imageData] of Object.entries(value.boardImages)) {
    if (!(imageData instanceof Uint8Array)) {
      throw new Error("expected board image data to be a Uint8Array");
    }

    boardImages[boardId] = imageData;
  }

  return {
    workspaceId,
    sourceFingerprint,
    boardImages,
  };
}

function getSnapshotRoot(userDataPath: string): string {
  return path.join(getWebPublishRoot(userDataPath), "snapshots");
}

function getSiteOutputDir(userDataPath: string): string {
  return path.join(getWebPublishRoot(userDataPath), "site");
}

function getStagingRoot(userDataPath: string): string {
  return path.join(getWebPublishRoot(userDataPath), "staging", randomUUID());
}

async function copyExistingSnapshots(sourceRoot: string, targetRoot: string): Promise<void> {
  try {
    await fs.cp(sourceRoot, targetRoot, { recursive: true });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      await fs.mkdir(targetRoot, { recursive: true });
      return;
    }

    throw error;
  }
}

async function writeWorkspaceSnapshot(
  snapshotRoot: string,
  prepared: PreparedWorkspace,
  slug: string,
  boardImages: Record<string, Uint8Array>,
): Promise<void> {
  const workspaceId = assertSafeWebPublishPathSegment(prepared.workspace.id);
  const workspaceSnapshotDir = resolveInsideWebPublishRoot(snapshotRoot, workspaceId);
  const boardSnapshotDir = resolveInsideWebPublishRoot(workspaceSnapshotDir, "boards");
  await fs.rm(workspaceSnapshotDir, { recursive: true, force: true });
  await fs.mkdir(boardSnapshotDir, { recursive: true });

  const snapshotBoards = prepared.boards.map((board) => {
    const boardId = assertSafeWebPublishPathSegment(board.id);
    const imageData = boardImages[board.id];
    if (!imageData) {
      throw createIPCContractError(
        WEB_PUBLISH_CHANNELS.commitWorkspace,
        `missing image data for board ${board.id}`,
      );
    }

    const imageFile = assertSafeWebPublishPathSegment(`${boardId}.png`);
    return {
      id: board.id,
      name: board.name,
      position: board.position,
      imageFile,
    };
  });

  for (const board of snapshotBoards) {
    await fs.writeFile(
      resolveInsideWebPublishRoot(boardSnapshotDir, board.imageFile),
      boardImages[board.id],
    );
  }

  await fs.writeFile(
    resolveInsideWebPublishRoot(workspaceSnapshotDir, "workspace.json"),
    `${JSON.stringify(
      {
        workspace: {
          id: prepared.workspace.id,
          name: prepared.workspace.name,
          slug,
        },
        boards: snapshotBoards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function regenerateSite(
  manifest: WebPublishManifest,
  snapshotRoot: string,
  outputDir: string,
): Promise<string> {
  await generateWebPublishSite({
    manifest,
    snapshotRoot,
    outputDir,
  });
  return outputDir;
}

function createPublishedEntry(
  manifest: WebPublishManifest,
  prepared: PreparedWorkspace,
  deploymentUrl: string | null,
  lastError: string | null,
): WebPublishWorkspaceManifestEntry {
  const existingEntry = manifest.workspaces[prepared.workspace.id];
  const usedSlugs = new Set(
    Object.values(manifest.workspaces)
      .filter((entry) => entry.workspaceId !== prepared.workspace.id)
      .map((entry) => entry.slug),
  );
  const slug = ensureUniqueWorkspaceSlug(
    createWorkspaceSlug(prepared.workspace.name, existingEntry?.slug),
    prepared.workspace.id,
    usedSlugs,
  );

  return {
    workspaceId: prepared.workspace.id,
    slug,
    name: prepared.workspace.name,
    sourceFingerprint: prepared.sourceFingerprint,
    publishedAt: new Date().toISOString(),
    lastDeploymentUrl: deploymentUrl,
    lastError,
  };
}

async function deployGeneratedSite(
  manifest: WebPublishManifest,
  snapshotRoot: string,
  outputDir: string,
  deploySite: DeploySite,
): Promise<{ deploymentUrl: string | null }> {
  await regenerateSite(manifest, snapshotRoot, outputDir);
  return deploySite({
    outputDir,
    projectName: manifest.projectName,
  });
}

async function markPublishFailure(
  userDataPath: string,
  manifest: WebPublishManifest,
  workspaceId: string,
  error: unknown,
  fallbackEntry?: WebPublishWorkspaceManifestEntry,
): Promise<void> {
  const existingEntry = manifest.workspaces[workspaceId];
  const failedEntry = existingEntry ?? fallbackEntry;
  if (!failedEntry) {
    return;
  }

  const failedWorkspaces = { ...(manifest.failedWorkspaces ?? {}) };
  const failedManifest: WebPublishManifest = existingEntry
    ? {
        ...manifest,
        failedWorkspaces,
        workspaces: {
          ...manifest.workspaces,
          [workspaceId]: {
            ...existingEntry,
            lastError: getErrorMessage(error),
          },
        },
      }
    : {
        ...manifest,
        failedWorkspaces: {
          ...failedWorkspaces,
          [workspaceId]: {
            ...failedEntry,
            lastDeploymentUrl: null,
            lastError: getErrorMessage(error),
          },
        },
      };

  await writeWebPublishManifest(userDataPath, failedManifest);
}

async function promoteSuccessfulPublishArtifacts(
  userDataPath: string,
  workspaceId: string,
  stagingSnapshotRoot: string,
  stagingSiteOutputDir: string,
): Promise<void> {
  const safeWorkspaceId = assertSafeWebPublishPathSegment(workspaceId);
  const canonicalWorkspaceSnapshotDir = resolveInsideWebPublishRoot(
    getSnapshotRoot(userDataPath),
    safeWorkspaceId,
  );
  const stagedWorkspaceSnapshotDir = resolveInsideWebPublishRoot(
    stagingSnapshotRoot,
    safeWorkspaceId,
  );
  await fs.rm(canonicalWorkspaceSnapshotDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(canonicalWorkspaceSnapshotDir), { recursive: true });
  await fs.cp(stagedWorkspaceSnapshotDir, canonicalWorkspaceSnapshotDir, { recursive: true });

  const canonicalSiteOutputDir = getSiteOutputDir(userDataPath);
  await fs.rm(canonicalSiteOutputDir, { recursive: true, force: true });
  await fs.cp(stagingSiteOutputDir, canonicalSiteOutputDir, { recursive: true });
}

async function promoteSuccessfulUnpublishArtifacts(
  userDataPath: string,
  workspaceId: string,
  stagingSiteOutputDir: string,
): Promise<void> {
  await fs.rm(resolveInsideWebPublishRoot(getSnapshotRoot(userDataPath), workspaceId), {
    recursive: true,
    force: true,
  });

  const canonicalSiteOutputDir = getSiteOutputDir(userDataPath);
  await fs.rm(canonicalSiteOutputDir, { recursive: true, force: true });
  await fs.cp(stagingSiteOutputDir, canonicalSiteOutputDir, { recursive: true });
}

async function preserveFailedDeploymentSite(
  userDataPath: string,
  workspaceId: string,
  action: "publish" | "unpublish",
  stagingSiteOutputDir: string,
): Promise<void> {
  try {
    await fs.access(stagingSiteOutputDir);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  const failedSiteOutputDir = resolveInsideWebPublishRoot(
    getWebPublishRoot(userDataPath),
    "failed-deployments",
    workspaceId,
    action,
    "site",
  );
  await fs.rm(failedSiteOutputDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(failedSiteOutputDir), { recursive: true });
  await fs.cp(stagingSiteOutputDir, failedSiteOutputDir, { recursive: true });
}

async function commitWorkspace(
  userDataPath: string,
  database: Database.Database,
  deploySite: DeploySite,
  payloadValue: unknown,
): Promise<{ deploymentUrl: string | null }> {
  const payload = assertCommitPayload(WEB_PUBLISH_CHANNELS.commitWorkspace, payloadValue);
  const prepared = prepareWorkspaceSource(database, payload.workspaceId);

  if (prepared.sourceFingerprint !== payload.sourceFingerprint) {
    throw new Error("Workspace changed during publish; prepare the publish again");
  }

  const currentBoardIds = new Set(prepared.boards.map((board) => board.id));
  for (const boardId of Object.keys(payload.boardImages)) {
    if (!currentBoardIds.has(boardId)) {
      throw createIPCContractError(
        WEB_PUBLISH_CHANNELS.commitWorkspace,
        `unexpected image data for board ${boardId}`,
      );
    }
  }

  const manifest = await readWebPublishManifest(userDataPath);
  const provisionalEntry = createPublishedEntry(manifest, prepared, null, null);
  const nextManifest: WebPublishManifest = {
    ...manifest,
    failedWorkspaces: {
      ...(manifest.failedWorkspaces ?? {}),
    },
    workspaces: {
      ...manifest.workspaces,
      [prepared.workspace.id]: provisionalEntry,
    },
  };
  delete nextManifest.failedWorkspaces?.[prepared.workspace.id];

  const stagingRoot = getStagingRoot(userDataPath);
  const stagingSnapshotRoot = path.join(stagingRoot, "snapshots");
  const stagingSiteOutputDir = path.join(stagingRoot, "site");

  try {
    await copyExistingSnapshots(getSnapshotRoot(userDataPath), stagingSnapshotRoot);
    await writeWorkspaceSnapshot(
      stagingSnapshotRoot,
      prepared,
      provisionalEntry.slug,
      payload.boardImages,
    );
    const deployment = await deployGeneratedSite(
      nextManifest,
      stagingSnapshotRoot,
      stagingSiteOutputDir,
      deploySite,
    );
    const successManifest: WebPublishManifest = {
      ...nextManifest,
      failedWorkspaces: {
        ...(nextManifest.failedWorkspaces ?? {}),
      },
      workspaces: {
        ...nextManifest.workspaces,
        [prepared.workspace.id]: {
          ...provisionalEntry,
          lastDeploymentUrl: deployment.deploymentUrl,
          lastError: null,
        },
      },
    };
    delete successManifest.failedWorkspaces?.[prepared.workspace.id];
    await promoteSuccessfulPublishArtifacts(
      userDataPath,
      prepared.workspace.id,
      stagingSnapshotRoot,
      stagingSiteOutputDir,
    );
    await writeWebPublishManifest(userDataPath, successManifest);
    return deployment;
  } catch (error) {
    await preserveFailedDeploymentSite(
      userDataPath,
      prepared.workspace.id,
      "publish",
      stagingSiteOutputDir,
    );
    await markPublishFailure(
      userDataPath,
      manifest,
      prepared.workspace.id,
      error,
      provisionalEntry,
    );
    throw error;
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
}

async function unpublishWorkspace(
  userDataPath: string,
  deploySite: DeploySite,
  workspaceIdValue: unknown,
): Promise<{ deploymentUrl: string | null }> {
  const workspaceId = assertStringPayload(
    WEB_PUBLISH_CHANNELS.unpublishWorkspace,
    workspaceIdValue,
    "workspaceId",
  );
  const manifest = await readWebPublishManifest(userDataPath);
  if (!manifest.workspaces[workspaceId]) {
    return { deploymentUrl: null };
  }

  const nextWorkspaces = { ...manifest.workspaces };
  delete nextWorkspaces[workspaceId];
  const nextManifest: WebPublishManifest = {
    ...manifest,
    workspaces: nextWorkspaces,
  };
  const stagingRoot = getStagingRoot(userDataPath);
  const stagingSnapshotRoot = path.join(stagingRoot, "snapshots");
  const stagingSiteOutputDir = path.join(stagingRoot, "site");

  try {
    await copyExistingSnapshots(getSnapshotRoot(userDataPath), stagingSnapshotRoot);
    const deployment = await deployGeneratedSite(
      nextManifest,
      stagingSnapshotRoot,
      stagingSiteOutputDir,
      deploySite,
    );
    await promoteSuccessfulUnpublishArtifacts(userDataPath, workspaceId, stagingSiteOutputDir);
    await writeWebPublishManifest(userDataPath, nextManifest);
    return deployment;
  } catch (error) {
    await preserveFailedDeploymentSite(
      userDataPath,
      workspaceId,
      "unpublish",
      stagingSiteOutputDir,
    );
    await markPublishFailure(userDataPath, manifest, workspaceId, error);
    throw error;
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
}

async function listStates(userDataPath: string, database: Database.Database) {
  const manifest = await readWebPublishManifest(userDataPath);
  const states: Record<
    string,
    {
      state: "not-online" | "online" | "changed-since-publish" | "publish-failed";
      lastError: string | null;
      lastDeploymentUrl: string | null;
    }
  > = {};

  for (const workspace of database
    .prepare("SELECT id FROM workspaces WHERE deleted_at IS NULL ORDER BY position")
    .all() as Array<{ id: string }>) {
    const entry = manifest.workspaces[workspace.id];
    if (!entry) {
      const failedEntry = manifest.failedWorkspaces?.[workspace.id];
      if (failedEntry) {
        states[workspace.id] = {
          state: "publish-failed",
          lastError: failedEntry.lastError,
          lastDeploymentUrl: failedEntry.lastDeploymentUrl,
        };
        continue;
      }

      states[workspace.id] = {
        state: "not-online",
        lastError: null,
        lastDeploymentUrl: null,
      };
      continue;
    }

    const prepared = prepareWorkspaceSource(database, workspace.id);
    states[workspace.id] = {
      state: entry.lastError
        ? "publish-failed"
        : prepared.sourceFingerprint === entry.sourceFingerprint
          ? "online"
          : "changed-since-publish",
      lastError: entry.lastError,
      lastDeploymentUrl: entry.lastDeploymentUrl,
    };
  }

  for (const entry of Object.values(manifest.workspaces)) {
    if (states[entry.workspaceId]) {
      continue;
    }

    states[entry.workspaceId] = {
      state: entry.lastError ? "publish-failed" : "online",
      lastError: entry.lastError,
      lastDeploymentUrl: entry.lastDeploymentUrl,
    };
  }

  for (const entry of Object.values(manifest.failedWorkspaces ?? {})) {
    if (states[entry.workspaceId]) {
      continue;
    }

    states[entry.workspaceId] = {
      state: "publish-failed",
      lastError: entry.lastError,
      lastDeploymentUrl: entry.lastDeploymentUrl,
    };
  }

  return states;
}

export function registerWebPublishIPC(
  userDataPath: string,
  { deploySite = deployWebPublishSite }: RegisterWebPublishIPCOptions = {},
): void {
  const database = getDatabase(userDataPath);

  ipcMain.handle(WEB_PUBLISH_CHANNELS.listStates, async () => listStates(userDataPath, database));

  ipcMain.handle(WEB_PUBLISH_CHANNELS.prepareWorkspace, async (_event, workspaceId: unknown) => {
    const validatedWorkspaceId = assertStringPayload(
      WEB_PUBLISH_CHANNELS.prepareWorkspace,
      workspaceId,
      "workspaceId",
    );
    return prepareWorkspaceSource(database, validatedWorkspaceId);
  });

  ipcMain.handle(WEB_PUBLISH_CHANNELS.commitWorkspace, async (_event, payload: unknown) => {
    return commitWorkspace(userDataPath, database, deploySite, payload);
  });

  ipcMain.handle(WEB_PUBLISH_CHANNELS.unpublishWorkspace, async (_event, workspaceId: unknown) => {
    return unpublishWorkspace(userDataPath, deploySite, workspaceId);
  });
}
