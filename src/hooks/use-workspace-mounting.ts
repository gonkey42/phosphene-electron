import { useEffect, useMemo, useRef, useState } from "react";

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

  const eagerWorkspaceIds = useMemo(
    () =>
      getEagerWorkspaceIds({
        workspaces,
        activeWorkspaceId,
        activeWorkspaceIndex,
      }),
    [activeWorkspaceId, activeWorkspaceIndex, workspaces],
  );

  const [mountedWorkspaceIds, setMountedWorkspaceIds] = useState<string[]>(eagerWorkspaceIds);

  const mountedWorkspaceIdSet = useMemo(
    () => new Set([...mountedWorkspaceIds, ...eagerWorkspaceIds]),
    [eagerWorkspaceIds, mountedWorkspaceIds],
  );

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
    if (activeWorkspaceId === null) {
      setMountedWorkspaceIds([]);
      return;
    }

    setMountedWorkspaceIds((current) => mergeWorkspaceIds(current, eagerWorkspaceIds));
  }, [activeWorkspaceId, eagerWorkspaceIds]);

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

function mergeWorkspaceIds(currentIds: string[], nextIds: string[]) {
  const mergedIds = [...currentIds];
  let changed = false;

  for (const id of nextIds) {
    if (!mergedIds.includes(id)) {
      mergedIds.push(id);
      changed = true;
    }
  }

  return changed ? mergedIds : currentIds;
}
