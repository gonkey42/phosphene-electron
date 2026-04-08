import { app, BrowserWindow } from "electron";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { registerDatabaseIPC, closeDatabase } from "./ipc/database";
import { registerFilesystemIPC } from "./ipc/filesystem";

const isDev = !app.isPackaged;
const legacyUserDataPath = path.join(app.getPath("appData"), "app.phosphene.desktop");

mkdirSync(legacyUserDataPath, { recursive: true });
app.setPath("userData", legacyUserDataPath);

function createWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, "preload.js");

  const win = new BrowserWindow({
    title: "Phosphene",
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  return win;
}

app.whenReady().then(() => {
  const userDataPath = app.getPath("userData");

  registerDatabaseIPC(userDataPath);
  registerFilesystemIPC(userDataPath);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  closeDatabase();
});
