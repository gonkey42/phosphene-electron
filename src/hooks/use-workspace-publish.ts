import { useCallback, useEffect, useRef, useState } from "react";

import { webPublish } from "../platform/desktop-api";
import {
  publishWorkspaceToWeb,
  unpublishWorkspaceFromWeb,
} from "../lib/web-publish/workspace-publish";

export type WorkspacePublishStatus =
  | "not-online"
  | "online"
  | "changed-since-publish"
  | "publish-failed";

type WorkspacePublishState = {
  status: WorkspacePublishStatus;
  errorMessage: string | null;
  hasPublishedSnapshot: boolean;
};

const STALE_REFRESH_ERROR = Symbol("stale-workspace-publish-refresh");

type StaleRefreshError = Error & {
  [STALE_REFRESH_ERROR]: true;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createStaleRefreshError(): StaleRefreshError {
  const error = new Error("Stale workspace publish refresh");
  return Object.assign(error, { [STALE_REFRESH_ERROR]: true as const });
}

function isStaleRefreshError(error: unknown): error is StaleRefreshError {
  return error instanceof Error && STALE_REFRESH_ERROR in error;
}

function getDefaultState(): WorkspacePublishState {
  return {
    status: "not-online",
    errorMessage: null,
    hasPublishedSnapshot: false,
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

export function useWorkspacePublish(workspaceId: string): {
  status: WorkspacePublishStatus;
  hasPublishedSnapshot: boolean;
  isBusy: boolean;
  errorMessage: string | null;
  publish: () => Promise<void>;
  unpublish: () => Promise<void>;
} {
  const [publishState, setPublishState] = useState<WorkspacePublishState>(getDefaultState);
  const [isBusy, setIsBusy] = useState(false);
  const requestIdRef = useRef(0);

  const refreshState = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    let states: Record<string, DesktopWebPublishWorkspaceState>;
    try {
      states = await webPublish.listStates();
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        throw createStaleRefreshError();
      }

      throw error;
    }

    if (requestId === requestIdRef.current) {
      setPublishState(mapWorkspaceState(states[workspaceId]));
    }
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await refreshState();
      } catch (error) {
        if (isStaleRefreshError(error)) {
          return;
        }

        if (!cancelled) {
          setPublishState({
            status: "publish-failed",
            errorMessage: getErrorMessage(error),
            hasPublishedSnapshot: false,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshState]);

  const publish = useCallback(async () => {
    setIsBusy(true);
    setPublishState((current) => ({ ...current, errorMessage: null }));

    try {
      await publishWorkspaceToWeb(workspaceId);
      await refreshState();
    } catch (error) {
      setPublishState((current) => ({
        status: "publish-failed",
        errorMessage: getErrorMessage(error),
        hasPublishedSnapshot: current.hasPublishedSnapshot,
      }));
    } finally {
      setIsBusy(false);
    }
  }, [refreshState, workspaceId]);

  const unpublish = useCallback(async () => {
    setIsBusy(true);
    setPublishState((current) => ({ ...current, errorMessage: null }));

    try {
      await unpublishWorkspaceFromWeb(workspaceId);
      await refreshState();
    } catch (error) {
      setPublishState((current) => ({
        status: "publish-failed",
        errorMessage: getErrorMessage(error),
        hasPublishedSnapshot: current.hasPublishedSnapshot,
      }));
    } finally {
      setIsBusy(false);
    }
  }, [refreshState, workspaceId]);

  return {
    status: publishState.status,
    hasPublishedSnapshot: publishState.hasPublishedSnapshot,
    isBusy,
    errorMessage: publishState.errorMessage,
    publish,
    unpublish,
  };
}
