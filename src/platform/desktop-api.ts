function getDesktop(): DesktopAPI {
  if (!window.desktop) {
    throw new Error("Desktop API not available — is the preload script loaded?");
  }
  return window.desktop;
}

export const db = {
  execute(sql: string, params?: unknown[]) {
    return getDesktop().db.execute(sql, params);
  },
  select<T = unknown>(sql: string, params?: unknown[]): Promise<T> {
    return getDesktop().db.select<T>(sql, params);
  },
};

export const fs = {
  exists(path: string) {
    return getDesktop().fs.exists(path);
  },
  mkdir(path: string) {
    return getDesktop().fs.mkdir(path);
  },
  readFile(path: string) {
    return getDesktop().fs.readFile(path);
  },
  writeFile(path: string, data: Uint8Array) {
    return getDesktop().fs.writeFile(path, data);
  },
  copyFile(src: string, dest: string) {
    return getDesktop().fs.copyFile(src, dest);
  },
  readDir(path: string) {
    return getDesktop().fs.readDir(path);
  },
  remove(path: string) {
    return getDesktop().fs.remove(path);
  },
};

export const paths = {
  appDataDir() {
    return getDesktop().paths.appDataDir();
  },
  join(...parts: string[]) {
    return getDesktop().paths.join(...parts);
  },
};
