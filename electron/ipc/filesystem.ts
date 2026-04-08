import { ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

export function registerFilesystemIPC(userDataPath: string): void {
  ipcMain.handle("paths:appDataDir", () => {
    return userDataPath;
  });

  ipcMain.handle("paths:join", (_event, ...parts: string[]) => {
    return path.join(...parts);
  });

  ipcMain.handle("fs:exists", async (_event, filePath: string) => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("fs:mkdir", async (_event, dirPath: string) => {
    await fs.mkdir(dirPath, { recursive: true });
  });

  ipcMain.handle("fs:readFile", async (_event, filePath: string) => {
    const buffer = await fs.readFile(filePath);
    return new Uint8Array(buffer);
  });

  ipcMain.handle("fs:writeFile", async (_event, filePath: string, data: Uint8Array) => {
    await fs.writeFile(filePath, data);
  });

  ipcMain.handle("fs:copyFile", async (_event, src: string, dest: string) => {
    await fs.copyFile(src, dest);
  });

  ipcMain.handle("fs:readDir", async (_event, dirPath: string) => {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map((entry) => ({ name: entry.name }));
  });

  ipcMain.handle("fs:remove", async (_event, filePath: string) => {
    await fs.unlink(filePath);
  });
}
