type DesktopMutationResult = {
  rowsAffected: number;
};

interface DesktopDatabase {
  execute(sql: string, params?: unknown[]): Promise<DesktopMutationResult>;
  select<TRows extends readonly unknown[] = unknown[]>(
    sql: string,
    params?: unknown[],
  ): Promise<TRows>;
  backup(destinationPath: string): Promise<
    | {
        status: "created";
        destinationPath: string;
      }
    | {
        status: "skipped";
        reason: "already-exists";
        destinationPath: string;
      }
    | {
        status: "failed";
        reason: "permission-denied" | "destination-missing" | "backup-failed";
        destinationPath: string;
        message: string;
      }
  >;
}

interface DesktopBoardsAPI {
  createBoard(name: string, workspaceId: string | null): Promise<string>;
}

interface DesktopWorkspacesAPI {
  createWorkspace(name: string, icon?: string): Promise<string>;
  reorderWorkspaces(orderedIds: string[]): Promise<void>;
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

interface DesktopLifecycle {
  flushPendingWork(): Promise<void>;
}

interface DesktopAPI {
  db: DesktopDatabase;
  boards: DesktopBoardsAPI;
  workspaces: DesktopWorkspacesAPI;
  fs: DesktopFilesystem;
  paths: DesktopPaths;
  lifecycle: DesktopLifecycle;
}

interface Window {
  desktop: DesktopAPI;
}
