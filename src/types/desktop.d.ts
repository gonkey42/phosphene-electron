interface DesktopDatabase {
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }>;
  select<T = unknown>(sql: string, params?: unknown[]): Promise<T>;
}

interface DesktopFilesystem {
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  copyFile(src: string, dest: string): Promise<void>;
  readDir(path: string): Promise<Array<{ name: string }>>;
  remove(path: string): Promise<void>;
}

interface DesktopPaths {
  appDataDir(): Promise<string>;
  join(...parts: string[]): Promise<string>;
}

interface DesktopAPI {
  db: DesktopDatabase;
  fs: DesktopFilesystem;
  paths: DesktopPaths;
}

interface Window {
  desktop: DesktopAPI;
}
