import { ipcMain } from "electron";
import { importBoardPack } from "../board-pack/importer";
import type { BoardPackWorkspaceTarget } from "../board-pack/workspace-target";

type BoardPackImportOptionsPayload = {
  targetWorkspaceId?: unknown;
  targetWorkspaceName?: unknown;
  targetActiveWorkspace?: unknown;
};

const BOARD_PACK_IMPORT_OPTION_KEYS = new Set([
  "targetWorkspaceId",
  "targetWorkspaceName",
  "targetActiveWorkspace",
]);

function assertStringPayload(channel: string, value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`[IPC ${channel}] Invalid payload: expected ${name} to be a non-empty string`);
  }

  return value;
}

function hasOwnOptionKey(
  options: BoardPackImportOptionsPayload,
  key: keyof BoardPackImportOptionsPayload,
): boolean {
  return Object.prototype.hasOwnProperty.call(options, key);
}

function assertOptionalStringPayload(
  channel: string,
  options: BoardPackImportOptionsPayload,
  name: "targetWorkspaceId" | "targetWorkspaceName",
): string | null {
  if (!hasOwnOptionKey(options, name)) {
    return null;
  }

  return assertStringPayload(channel, options[name], name).trim();
}

function assertKnownOptionKeys(channel: string, options: Record<string, unknown>): void {
  for (const key of Object.keys(options)) {
    if (!BOARD_PACK_IMPORT_OPTION_KEYS.has(key)) {
      throw new Error(`[IPC ${channel}] Invalid payload: unexpected option ${key}`);
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertOptionsPayload(channel: string, value: unknown): BoardPackImportOptionsPayload {
  if (value === undefined) {
    return {};
  }

  if (!isPlainObject(value)) {
    throw new Error(`[IPC ${channel}] Invalid payload: expected options to be a plain object`);
  }

  const options = value;
  if (Object.keys(options).length === 0) {
    throw new Error(
      `[IPC ${channel}] Invalid payload: expected options to include one target workspace selector`,
    );
  }

  assertKnownOptionKeys(channel, options);

  return options as BoardPackImportOptionsPayload;
}

function parseTargetWorkspacePayload(
  channel: string,
  optionsValue: unknown,
): BoardPackWorkspaceTarget {
  const options = assertOptionsPayload(channel, optionsValue);
  const targetWorkspaceId = assertOptionalStringPayload(
    channel,
    options,
    "targetWorkspaceId",
  );
  const targetWorkspaceName = assertOptionalStringPayload(
    channel,
    options,
    "targetWorkspaceName",
  );
  const hasTargetActiveWorkspace = hasOwnOptionKey(options, "targetActiveWorkspace");
  const targetActiveWorkspace = hasTargetActiveWorkspace && options.targetActiveWorkspace === true;

  if (hasTargetActiveWorkspace && options.targetActiveWorkspace !== true) {
    throw new Error(
      `[IPC ${channel}] Invalid payload: expected targetActiveWorkspace to be true when provided`,
    );
  }

  const targetSelectorCount =
    (targetWorkspaceId === null ? 0 : 1) +
    (targetWorkspaceName === null ? 0 : 1) +
    (targetActiveWorkspace ? 1 : 0);

  if (targetSelectorCount > 1) {
    throw new Error(
      `[IPC ${channel}] Invalid payload: use only one target workspace selector`,
    );
  }

  if (targetWorkspaceId !== null) {
    return { type: "id", id: targetWorkspaceId };
  }

  if (targetWorkspaceName !== null) {
    return { type: "name", name: targetWorkspaceName };
  }

  if (targetActiveWorkspace) {
    return { type: "active" };
  }

  return { type: "new" };
}

export function registerBoardPackIPC(userDataPath: string): void {
  ipcMain.handle("board-packs:import-folder", async (_event, packDir: unknown, options?: unknown) => {
    const validatedPackDir = assertStringPayload("board-packs:import-folder", packDir, "packDir");
    const targetWorkspace = parseTargetWorkspacePayload("board-packs:import-folder", options);

    return importBoardPack({ packDir: validatedPackDir, userDataPath, targetWorkspace });
  });
}
