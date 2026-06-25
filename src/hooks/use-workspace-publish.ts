import { useCallback, useEffect, useSyncExternalStore } from "react";

import { webPublish } from "../platform/desktop-api";
import {
  publishWorkspaceToWeb,
  unpublishWorkspaceFromWeb,
} from "../lib/web-publish/workspace-publish";
import { useAppStore, type DeleteEligibility } from "../stores/app-store";

export type WorkspacePublishStatus =
  | "not-online"
  | "online"
  | "changed-since-publish"
  | "publish-failed";

export type WorkspacePublishPhase = "loading" | "loaded" | "refreshing" | "error";

export type WorkspacePublishViewState = {
  phase: WorkspacePublishPhase;
  status: WorkspacePublishStatus;
  hasPublishedSnapshot: boolean;
  errorMessage: string | null;
};

type WorkspacePublishState = {
  status: WorkspacePublishStatus;
  errorMessage: string | null;
  hasPublishedSnapshot: boolean;
};

type WorkspacePublishStoreSnapshot = {
  phase: WorkspacePublishPhase;
  states: Record<string, WorkspacePublishState>;
  errorMessage: string | null;
  busyWorkspaceIds: Set<string>;
};

type RefreshOptions = {
  force?: boolean;
};

type WorkspacePublishHookResult = WorkspacePublishViewState & {
  viewState: WorkspacePublishViewState;
  isBusy: boolean;
  deleteEligibility: DeleteEligibility;
  refresh: () => Promise<void>;
  publish: () => Promise<void>;
  unpublish: () => Promise<void>;
};

const PUBLISH_STATE_LOADING_REASON = "Workspace publish state is still loading.";
const PUBLISH_STATE_REFRESHING_REASON = "Workspace publish state is refreshing.";
const PUBLISH_STATE_ERROR_REASON = "Workspace publish state could not be checked.";
const PUBLISH_OPERATION_BUSY_REASON = "Workspace publish operation is in progress.";
const WORKSPACE_PUBLISHED_DELETE_BLOCK_REASON =
  "Workspace is published to the web; unpublish it before deleting.";

const listeners = new Set<() => void>();

let storeSnapshot = createInitialStoreSnapshot();
let refreshRequestId = 0;
let refreshPromise: Promise<void> | null = null;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getDefaultState(): WorkspacePublishState {
  return {
    status: "not-online",
    errorMessage: null,
    hasPublishedSnapshot: false,
  };
}

function createInitialStoreSnapshot(): WorkspacePublishStoreSnapshot {
  return {
    phase: "loading",
    states: {},
    errorMessage: null,
    busyWorkspaceIds: new Set(),
  };
}

function mapWorkspaceState(
  workspaceState: DesktopWebPublishWorkspaceState | undefined,
): WorkspacePublishState {
  if (!workspaceState) {
    return getDefaultState();
  }

  return {
    status: workspaceState.state,
    errorMessage: workspaceState.lastError,
    hasPublishedSnapshot: workspaceState.hasPublishedSnapshot,
  };
}

function mapWorkspaceStates(
  states: Record<string, DesktopWebPublishWorkspaceState>,
): Record<string, WorkspacePublishState> {
  return Object.fromEntries(
    Object.entries(states).map(([workspaceId, workspaceState]) => [
      workspaceId,
      mapWorkspaceState(workspaceState),
    ]),
  );
}

function emitStoreChange() {
  for (const listener of listeners) {
    listener();
  }
}

function setStoreSnapshot(
  updater: (current: WorkspacePublishStoreSnapshot) => WorkspacePublishStoreSnapshot,
) {
  storeSnapshot = updater(storeSnapshot);
  emitStoreChange();
}

function getStoreSnapshot() {
  return storeSnapshot;
}

function resetStoreWhenUnused() {
  if (listeners.size > 0) {
    return;
  }

  refreshRequestId += 1;
  refreshPromise = null;
  storeSnapshot = createInitialStoreSnapshot();
}

function subscribeToWorkspacePublishStore(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    resetStoreWhenUnused();
  };
}

function refreshWorkspacePublishStates({ force = false }: RefreshOptions = {}) {
  if (!force && refreshPromise) {
    return refreshPromise;
  }

  const requestId = refreshRequestId + 1;
  refreshRequestId = requestId;

  setStoreSnapshot((current) => ({
    ...current,
    phase: current.phase === "loading" ? "loading" : "refreshing",
    errorMessage: null,
  }));

  const nextRefreshPromise = (async () => {
    const states = await webPublish.listStates();

    if (requestId !== refreshRequestId) {
      return;
    }

    setStoreSnapshot((current) => ({
      ...current,
      phase: "loaded",
      states: mapWorkspaceStates(states),
      errorMessage: null,
    }));
  })()
    .catch((error: unknown) => {
      if (requestId !== refreshRequestId) {
        return;
      }

      setStoreSnapshot((current) => ({
        ...current,
        phase: "error",
        errorMessage: getErrorMessage(error),
      }));
    })
    .finally(() => {
      if (refreshPromise === nextRefreshPromise) {
        refreshPromise = null;
      }

      resetStoreWhenUnused();
    });

  refreshPromise = nextRefreshPromise;
  return nextRefreshPromise;
}

function ensureWorkspacePublishStates() {
  if (storeSnapshot.phase !== "loading") {
    return Promise.resolve();
  }

  return refreshWorkspacePublishStates();
}

function getWorkspaceViewState(
  workspaceId: string,
  snapshot: WorkspacePublishStoreSnapshot,
): WorkspacePublishViewState {
  const workspaceState = snapshot.states[workspaceId] ?? getDefaultState();

  return {
    phase: snapshot.phase,
    status: workspaceState.status,
    hasPublishedSnapshot: workspaceState.hasPublishedSnapshot,
    errorMessage:
      snapshot.phase === "error"
        ? snapshot.errorMessage ?? workspaceState.errorMessage
        : workspaceState.errorMessage,
  };
}

function setWorkspaceBusy(workspaceId: string, isBusy: boolean) {
  setStoreSnapshot((current) => {
    const busyWorkspaceIds = new Set(current.busyWorkspaceIds);

    if (isBusy) {
      busyWorkspaceIds.add(workspaceId);
    } else {
      busyWorkspaceIds.delete(workspaceId);
    }

    return {
      ...current,
      busyWorkspaceIds,
    };
  });
}

function clearWorkspaceError(workspaceId: string) {
  setStoreSnapshot((current) => {
    const currentState = current.states[workspaceId] ?? getDefaultState();

    return {
      ...current,
      states: {
        ...current.states,
        [workspaceId]: {
          ...currentState,
          errorMessage: null,
        },
      },
    };
  });
}

function setWorkspacePublishFailure(workspaceId: string, error: unknown) {
  const errorMessage = getErrorMessage(error);

  setStoreSnapshot((current) => {
    const currentState = current.states[workspaceId] ?? getDefaultState();

    return {
      ...current,
      phase: current.phase === "loading" ? "loaded" : current.phase,
      states: {
        ...current.states,
        [workspaceId]: {
          status: "publish-failed",
          errorMessage,
          hasPublishedSnapshot: currentState.hasPublishedSnapshot,
        },
      },
    };
  });
}

function isDeleteBlockedByBackendPredicate(viewState: WorkspacePublishViewState) {
  if (viewState.status === "online" || viewState.status === "changed-since-publish") {
    return true;
  }

  return viewState.status === "publish-failed" && viewState.hasPublishedSnapshot;
}

export function getWorkspacePublishDeleteEligibility(
  viewState: WorkspacePublishViewState,
  isBusy: boolean,
): DeleteEligibility {
  if (isBusy) {
    return { state: "unknown", reason: PUBLISH_OPERATION_BUSY_REASON };
  }

  if (viewState.phase === "loading") {
    return { state: "unknown", reason: PUBLISH_STATE_LOADING_REASON };
  }

  if (viewState.phase === "refreshing") {
    return { state: "unknown", reason: PUBLISH_STATE_REFRESHING_REASON };
  }

  if (viewState.phase === "error") {
    return { state: "unknown", reason: PUBLISH_STATE_ERROR_REASON };
  }

  if (isDeleteBlockedByBackendPredicate(viewState)) {
    return {
      state: "blocked",
      reason: WORKSPACE_PUBLISHED_DELETE_BLOCK_REASON,
    };
  }

  return { state: "allowed" };
}

export function useWorkspacePublish(workspaceId: string): WorkspacePublishHookResult {
  const snapshot = useSyncExternalStore(
    subscribeToWorkspacePublishStore,
    getStoreSnapshot,
    getStoreSnapshot,
  );
  const viewState = getWorkspaceViewState(workspaceId, snapshot);
  const isBusy = snapshot.busyWorkspaceIds.has(workspaceId);

  useEffect(() => {
    void ensureWorkspacePublishStates();
  }, []);

  const refresh = useCallback(async () => {
    await refreshWorkspacePublishStates({ force: true });
  }, []);

  const publish = useCallback(async () => {
    useAppStore.getState().cancelArmedDelete();
    setWorkspaceBusy(workspaceId, true);
    clearWorkspaceError(workspaceId);

    try {
      await publishWorkspaceToWeb(workspaceId);
      await refreshWorkspacePublishStates({ force: true });
    } catch (error) {
      setWorkspacePublishFailure(workspaceId, error);
    } finally {
      setWorkspaceBusy(workspaceId, false);
    }
  }, [workspaceId]);

  const unpublish = useCallback(async () => {
    useAppStore.getState().cancelArmedDelete();
    setWorkspaceBusy(workspaceId, true);
    clearWorkspaceError(workspaceId);

    try {
      await unpublishWorkspaceFromWeb(workspaceId);
      await refreshWorkspacePublishStates({ force: true });
    } catch (error) {
      setWorkspacePublishFailure(workspaceId, error);
    } finally {
      setWorkspaceBusy(workspaceId, false);
    }
  }, [workspaceId]);

  return {
    ...viewState,
    viewState,
    isBusy,
    deleteEligibility: getWorkspacePublishDeleteEligibility(viewState, isBusy),
    refresh,
    publish,
    unpublish,
  };
}
