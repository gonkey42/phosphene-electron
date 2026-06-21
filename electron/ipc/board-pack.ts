import { ipcMain } from "electron";
import { importBoardPack } from "../board-pack/importer";

function assertStringPayload(channel: string, value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`[IPC ${channel}] Invalid payload: expected ${name} to be a non-empty string`);
  }

  return value;
}

export function registerBoardPackIPC(userDataPath: string): void {
  ipcMain.handle("board-packs:import-folder", async (_event, packDir: unknown) => {
    const validatedPackDir = assertStringPayload("board-packs:import-folder", packDir, "packDir");

    return importBoardPack({ packDir: validatedPackDir, userDataPath });
  });
}
