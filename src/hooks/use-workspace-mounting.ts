import { useEffect, useMemo, useRef } from "react";

export function useWorkspaceMounting(
  workspaces: Array<{ id: string }>,
  activeWorkspaceId: string | null,
) {
  const previousActiveWorkspaceIdRef = useRef<string | null>(null);

  const activeWorkspaceIndex = useMemo(
    () =>
      activeWorkspaceId
        ? workspaces.findIndex((workspace) => workspace.id === activeWorkspaceId)
        : -1,
    [activeWorkspaceId, workspaces],
  );

  const renderedActiveWorkspaceId = useMemo(() => {
    if (!activeWorkspaceId) {
      return null;
    }

    return activeWorkspaceIndex >= 0 ? activeWorkspaceId : previousActiveWorkspaceIdRef.current;
  }, [activeWorkspaceId, activeWorkspaceIndex]);

  const renderedActiveWorkspaceIndex = useMemo(
    () =>
      renderedActiveWorkspaceId
        ? workspaces.findIndex((workspace) => workspace.id === renderedActiveWorkspaceId)
        : -1,
    [renderedActiveWorkspaceId, workspaces],
  );

  const mountedWorkspaceIds = useMemo(() => {
    if (activeWorkspaceId && activeWorkspaceIndex >= 0) {
      return getEagerWorkspaceIds({
        workspaces,
        activeWorkspaceId,
        activeWorkspaceIndex,
      });
    }

    if (activeWorkspaceId && previousActiveWorkspaceIdRef.current) {
      const previousActiveWorkspaceIndex = workspaces.findIndex(
        (workspace) => workspace.id === previousActiveWorkspaceIdRef.current,
      );

      if (previousActiveWorkspaceIndex >= 0) {
        return getEagerWorkspaceIds({
          workspaces,
          activeWorkspaceId: previousActiveWorkspaceIdRef.current,
          activeWorkspaceIndex: previousActiveWorkspaceIndex,
        });
      }
    }

    return [];
  }, [activeWorkspaceId, activeWorkspaceIndex, workspaces]);

  const mountedWorkspaceIdSet = useMemo(() => new Set(mountedWorkspaceIds), [mountedWorkspaceIds]);

  const mountedWorkspaces = useMemo(
    () => workspaces.filter((workspace) => mountedWorkspaceIdSet.has(workspace.id)),
    [mountedWorkspaceIdSet, workspaces],
  );

  const direction = useMemo(() => {
    if (!previousActiveWorkspaceIdRef.current || !activeWorkspaceId) {
      return 0;
    }

    const previousIndex = workspaces.findIndex(
      (workspace) => workspace.id === previousActiveWorkspaceIdRef.current,
    );
    const nextIndex = workspaces.findIndex((workspace) => workspace.id === activeWorkspaceId);

    if (previousIndex < 0 || nextIndex < 0 || previousIndex === nextIndex) {
      return 0;
    }

    return nextIndex > previousIndex ? 1 : -1;
  }, [activeWorkspaceId, workspaces]);

  useEffect(() => {
    if (activeWorkspaceIndex < 0) {
      return;
    }

    previousActiveWorkspaceIdRef.current = activeWorkspaceId;
  }, [activeWorkspaceId, activeWorkspaceIndex]);

  return {
    activeWorkspaceIndex,
    previousActiveWorkspaceId: previousActiveWorkspaceIdRef.current,
    renderedActiveWorkspaceId,
    renderedActiveWorkspaceIndex,
    mountedWorkspaces,
    mountedWorkspaceIds,
    direction,
  };
}

function getEagerWorkspaceIds({
  workspaces,
  activeWorkspaceId,
  activeWorkspaceIndex,
}: {
  workspaces: Array<{ id: string }>;
  activeWorkspaceId: string | null;
  activeWorkspaceIndex: number;
}) {
  if (!activeWorkspaceId) {
    return [];
  }

  if (activeWorkspaceIndex < 0) {
    return [];
  }

  const eagerWorkspaceIds = new Set<string>([activeWorkspaceId]);
  const previousWorkspace = workspaces[activeWorkspaceIndex - 1];
  const nextWorkspace = workspaces[activeWorkspaceIndex + 1];

  if (previousWorkspace) {
    eagerWorkspaceIds.add(previousWorkspace.id);
  }

  if (nextWorkspace) {
    eagerWorkspaceIds.add(nextWorkspace.id);
  }

  return [...eagerWorkspaceIds];
}
