const LIFECYCLE_FLUSH_REQUEST_EVENT = "phosphene:lifecycle:flush-request";
const LIFECYCLE_FLUSH_COMPLETE_EVENT = "phosphene:lifecycle:flush-complete";
const LIFECYCLE_READY_EVENT = "phosphene:lifecycle:ready";
const LIFECYCLE_READY_FLAG = "__PHOSPHENE_LIFECYCLE_READY__";
const LIFECYCLE_SHARED_STATE_KEY = "__PHOSPHENE_LIFECYCLE_SHARED_STATE__";

export type DatabaseBackupResult =
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
    };

export type MutationResult = {
  rowsAffected: number;
};

type PendingWorkHandler = () => Promise<void> | void;
type FlushCompletionDetail = {
  requestId: string;
  ok: boolean;
  error?: string;
};
type LifecycleSharedState = {
  listenersBound: boolean;
  pendingWorkHandlers: Set<PendingWorkHandler>;
};

type LifecycleWindow = Window & {
  [LIFECYCLE_READY_FLAG]?: boolean;
  [LIFECYCLE_SHARED_STATE_KEY]?: LifecycleSharedState;
};

function getDesktop(): DesktopAPI {
  if (!window.desktop) {
    throw new Error("Desktop API not available — is the preload script loaded?");
  }
  return window.desktop;
}

function getLifecycleSharedState(): LifecycleSharedState {
  const lifecycleWindow = window as LifecycleWindow;
  lifecycleWindow[LIFECYCLE_SHARED_STATE_KEY] ??= {
    listenersBound: false,
    pendingWorkHandlers: new Set<PendingWorkHandler>(),
  };
  return lifecycleWindow[LIFECYCLE_SHARED_STATE_KEY]!;
}

async function flushRegisteredPendingWork(): Promise<void> {
  const handlers = Array.from(getLifecycleSharedState().pendingWorkHandlers);
  const results = await Promise.allSettled(
    handlers.map((handler) => Promise.resolve().then(() => handler())),
  );
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  if (rejected) {
    throw rejected.reason;
  }
}

function dispatchFlushCompletion(detail: FlushCompletionDetail) {
  window.dispatchEvent(new CustomEvent<FlushCompletionDetail>(LIFECYCLE_FLUSH_COMPLETE_EVENT, { detail }));
}

function ensureLifecycleListeners() {
  if (typeof window === "undefined") {
    return;
  }

  const sharedState = getLifecycleSharedState();
  if (sharedState.listenersBound) {
    return;
  }

  sharedState.listenersBound = true;

  window.addEventListener(LIFECYCLE_FLUSH_REQUEST_EVENT, (event) => {
    const { requestId } = (event as CustomEvent<{ requestId: string }>).detail;

    void flushRegisteredPendingWork()
      .then(() => {
        dispatchFlushCompletion({ requestId, ok: true });
      })
      .catch((error) => {
        dispatchFlushCompletion({
          requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  });

  window.addEventListener("beforeunload", () => {
    void flushRegisteredPendingWork().catch((error) => {
      console.error("[Lifecycle] Failed to flush pending work during beforeunload", error);
    });
  });

  (window as LifecycleWindow)[LIFECYCLE_READY_FLAG] = true;
  window.dispatchEvent(new Event(LIFECYCLE_READY_EVENT));
}

ensureLifecycleListeners();

export const db = {
  execute(sql: string, params?: unknown[]): Promise<MutationResult> {
    return getDesktop().db.execute(sql, params);
  },
  select<TRows extends readonly unknown[] = unknown[]>(
    sql: string,
    params?: unknown[],
  ): Promise<TRows> {
    return getDesktop().db.select<TRows>(sql, params);
  },
  backup(destinationPath: string): Promise<DatabaseBackupResult> {
    return getDesktop().db.backup(destinationPath);
  },
};

export const boards = {
  createBoard(name: string, workspaceId: string | null): Promise<string> {
    return getDesktop().boards.createBoard(name, workspaceId);
  },
};

export const workspaces = {
  createWorkspace(name: string, icon?: string): Promise<string> {
    return getDesktop().workspaces.createWorkspace(name, icon);
  },
  reorderWorkspaces(orderedIds: string[]): Promise<void> {
    return getDesktop().workspaces.reorderWorkspaces(orderedIds);
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

export const lifecycle = {
  flushPendingWork() {
    ensureLifecycleListeners();
    return getDesktop().lifecycle.flushPendingWork();
  },
  registerPendingWork(handler: PendingWorkHandler) {
    ensureLifecycleListeners();
    const { pendingWorkHandlers } = getLifecycleSharedState();
    pendingWorkHandlers.add(handler);

    return () => {
      pendingWorkHandlers.delete(handler);
    };
  },
};
