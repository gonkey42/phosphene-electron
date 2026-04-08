import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useWorkspaceMounting } from "./use-workspace-mounting";

type Workspace = {
  id: string;
  name: string;
  icon: string;
  position: number;
};

type HookProps = {
  currentWorkspaces: Workspace[];
  currentActiveWorkspaceId: string | null;
};

const workspaces: Workspace[] = [
  { id: "workspace-1", name: "Home", icon: "🏠", position: 0 },
  { id: "workspace-2", name: "Research", icon: "🔎", position: 1 },
  { id: "workspace-3", name: "Build", icon: "🛠️", position: 2 },
  { id: "workspace-4", name: "Review", icon: "✅", position: 3 },
  { id: "workspace-5", name: "Archive", icon: "📦", position: 4 },
];

describe("useWorkspaceMounting", () => {
  it("mounts the active workspace and its immediate neighbors", () => {
    const { result } = renderHook(() => useWorkspaceMounting(workspaces, "workspace-3"));

    expect(result.current.mountedWorkspaceIds).toEqual([
      "workspace-3",
      "workspace-2",
      "workspace-4",
    ]);
    expect(result.current.mountedWorkspaces.map((workspace) => workspace.id)).toEqual([
      "workspace-2",
      "workspace-3",
      "workspace-4",
    ]);
  });

  it("reports the active workspace index and rendered active workspace id", () => {
    const { result } = renderHook(() => useWorkspaceMounting(workspaces, "workspace-3"));

    expect(result.current.activeWorkspaceIndex).toBe(2);
    expect(result.current.previousActiveWorkspaceId).toBeNull();
    expect(result.current.renderedActiveWorkspaceId).toBe("workspace-3");
    expect(result.current.renderedActiveWorkspaceIndex).toBe(2);
    expect(result.current.direction).toBe(0);
  });

  it("returns empty mounting state when there is no active workspace", () => {
    const { result } = renderHook(() => useWorkspaceMounting(workspaces, null));

    expect(result.current.activeWorkspaceIndex).toBe(-1);
    expect(result.current.previousActiveWorkspaceId).toBeNull();
    expect(result.current.renderedActiveWorkspaceId).toBeNull();
    expect(result.current.renderedActiveWorkspaceIndex).toBe(-1);
    expect(result.current.mountedWorkspaceIds).toEqual([]);
    expect(result.current.mountedWorkspaces).toEqual([]);
    expect(result.current.direction).toBe(0);
  });

  it("clears mounted workspaces when the active workspace becomes null", () => {
    const initialProps: HookProps = {
      currentWorkspaces: workspaces,
      currentActiveWorkspaceId: "workspace-3",
    };

    const { result, rerender } = renderHook(
      ({ currentWorkspaces, currentActiveWorkspaceId }: HookProps) =>
        useWorkspaceMounting(currentWorkspaces, currentActiveWorkspaceId),
      { initialProps },
    );

    expect(result.current.mountedWorkspaceIds).toEqual([
      "workspace-3",
      "workspace-2",
      "workspace-4",
    ]);

    act(() => {
      rerender({
        currentWorkspaces: workspaces,
        currentActiveWorkspaceId: null,
      });
    });

    expect(result.current.activeWorkspaceIndex).toBe(-1);
    expect(result.current.previousActiveWorkspaceId).toBe("workspace-3");
    expect(result.current.renderedActiveWorkspaceId).toBeNull();
    expect(result.current.renderedActiveWorkspaceIndex).toBe(-1);
    expect(result.current.mountedWorkspaceIds).toEqual([]);
    expect(result.current.mountedWorkspaces).toEqual([]);
    expect(result.current.direction).toBe(0);
  });

  it("keeps mounted workspaces when the active workspace id is unresolved", () => {
    const initialProps: HookProps = {
      currentWorkspaces: workspaces,
      currentActiveWorkspaceId: "workspace-3",
    };

    const { result, rerender } = renderHook(
      ({ currentWorkspaces, currentActiveWorkspaceId }: HookProps) =>
        useWorkspaceMounting(currentWorkspaces, currentActiveWorkspaceId),
      { initialProps },
    );

    act(() => {
      rerender({
        currentWorkspaces: workspaces,
        currentActiveWorkspaceId: "workspace-6",
      });
    });

    expect(result.current.activeWorkspaceIndex).toBe(-1);
    expect(result.current.previousActiveWorkspaceId).toBe("workspace-3");
    expect(result.current.renderedActiveWorkspaceId).toBe("workspace-3");
    expect(result.current.renderedActiveWorkspaceIndex).toBe(2);
    expect(result.current.mountedWorkspaceIds).toEqual([
      "workspace-3",
      "workspace-2",
      "workspace-4",
    ]);
    expect(result.current.mountedWorkspaces.map((workspace) => workspace.id)).toEqual([
      "workspace-2",
      "workspace-3",
      "workspace-4",
    ]);
    expect(result.current.direction).toBe(0);
  });

  it("keeps previously mounted workspaces sticky after they fall out of range", () => {
    const initialProps: HookProps = {
      currentWorkspaces: workspaces,
      currentActiveWorkspaceId: "workspace-3",
    };

    const { result, rerender } = renderHook(
      ({ currentWorkspaces, currentActiveWorkspaceId }: HookProps) =>
        useWorkspaceMounting(currentWorkspaces, currentActiveWorkspaceId),
      { initialProps },
    );

    act(() => {
      rerender({
        currentWorkspaces: workspaces,
        currentActiveWorkspaceId: "workspace-5",
      });
    });

    expect(result.current.mountedWorkspaceIds).toEqual([
      "workspace-3",
      "workspace-2",
      "workspace-4",
      "workspace-5",
    ]);
    expect(result.current.mountedWorkspaces.map((workspace) => workspace.id)).toEqual([
      "workspace-2",
      "workspace-3",
      "workspace-4",
      "workspace-5",
    ]);

    act(() => {
      rerender({
        currentWorkspaces: workspaces,
        currentActiveWorkspaceId: "workspace-2",
      });
    });

    expect(result.current.mountedWorkspaceIds).toEqual([
      "workspace-3",
      "workspace-2",
      "workspace-4",
      "workspace-5",
      "workspace-1",
    ]);
    expect(result.current.mountedWorkspaces.map((workspace) => workspace.id)).toEqual([
      "workspace-1",
      "workspace-2",
      "workspace-3",
      "workspace-4",
      "workspace-5",
    ]);
  });

  it("tracks direction from workspace index changes", () => {
    const initialProps: HookProps = {
      currentWorkspaces: workspaces,
      currentActiveWorkspaceId: "workspace-3",
    };

    const { result, rerender } = renderHook(
      ({ currentWorkspaces, currentActiveWorkspaceId }: HookProps) =>
        useWorkspaceMounting(currentWorkspaces, currentActiveWorkspaceId),
      { initialProps },
    );

    expect(result.current.direction).toBe(0);

    act(() => {
      rerender({
        currentWorkspaces: workspaces,
        currentActiveWorkspaceId: "workspace-4",
      });
    });

    expect(result.current.direction).toBe(1);

    act(() => {
      rerender({
        currentWorkspaces: workspaces,
        currentActiveWorkspaceId: "workspace-2",
      });
    });

    expect(result.current.direction).toBe(-1);
  });
});
