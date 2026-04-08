import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  db: {
    execute(sql: string, params?: unknown[]) {
      return ipcRenderer.invoke("db:execute", sql, params);
    },
    select(sql: string, params?: unknown[]) {
      return ipcRenderer.invoke("db:select", sql, params);
    },
  },
  fs: {
    exists(path: string) {
      return ipcRenderer.invoke("fs:exists", path);
    },
    mkdir(path: string) {
      return ipcRenderer.invoke("fs:mkdir", path);
    },
    readFile(path: string): Promise<Uint8Array> {
      return ipcRenderer.invoke("fs:readFile", path);
    },
    writeFile(path: string, data: Uint8Array) {
      return ipcRenderer.invoke("fs:writeFile", path, data);
    },
    copyFile(src: string, dest: string) {
      return ipcRenderer.invoke("fs:copyFile", src, dest);
    },
    readDir(path: string) {
      return ipcRenderer.invoke("fs:readDir", path);
    },
    remove(path: string) {
      return ipcRenderer.invoke("fs:remove", path);
    },
  },
  paths: {
    appDataDir() {
      return ipcRenderer.invoke("paths:appDataDir");
    },
    join(...parts: string[]) {
      return ipcRenderer.invoke("paths:join", ...parts);
    },
  },
});
