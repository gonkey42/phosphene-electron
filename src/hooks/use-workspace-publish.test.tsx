import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listStatesMock,
  publishWorkspaceToWebMock,
  unpublishWorkspaceFromWebMock,
} = vi.hoisted(() => ({
  listStatesMock: vi.fn(),
  publishWorkspaceToWebMock: vi.fn(),
  unpublishWorkspaceFromWebMock: vi.fn(),
}));

vi.mock("../platform/desktop-api", () => ({
  webPublish: {
    listStates: listStatesMock,
  },
}));

vi.mock("../lib/web-publish/workspace-publish", () => ({
  publishWorkspaceToWeb: publishWorkspaceToWebMock,
  unpublishWorkspaceFromWeb: unpublishWorkspaceFromWebMock,
}));

import { useAppStore } from "../stores/app-store";
import { useWorkspacePublish } from "./use-workspace-publish";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe("useWorkspacePublish", () => {
  beforeEach(() => {
    listStatesMock.mockReset();
    publishWorkspaceToWebMock.mockReset();
    unpublishWorkspaceFromWebMock.mockReset();
    listStatesMock.mockResolvedValue({});
    publishWorkspaceToWebMock.mockResolvedValue(undefined);
    unpublishWorkspaceFromWebMock.mockResolvedValue(undefined);
    useAppStore.setState({
      armedDeleteTarget: null,
      armedDeleteToken: null,
      deletePendingToken: null,
      deleteAnnouncement: null,
      deleteEligibility: { state: "allowed" },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads the current workspace publish state", async () => {
    listStatesMock.mockResolvedValue({
      workspace_1: {
        state: "changed-since-publish",
        hasPublishedSnapshot: true,
        lastError: null,
        lastDeploymentUrl: "https://phosphene.example/workspaces/workspace",
      },
    });

    const { result } = renderHook(() => useWorkspacePublish("workspace_1"));

    expect(result.current.status).toBe("not-online");

    await waitFor(() => {
      expect(result.current.status).toBe("changed-since-publish");
    });
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.hasPublishedSnapshot).toBe(true);
  });

  it("exposes loading and loaded view phases", async () => {
    const initialLoad = deferred<Record<string, DesktopWebPublishWorkspaceState>>();
    listStatesMock.mockReturnValue(initialLoad.promise);

    const { result } = renderHook(() => useWorkspacePublish("workspace_1"));

    expect(result.current.phase).toBe("loading");
    expect(result.current.viewState).toEqual({
      phase: "loading",
      status: "not-online",
      hasPublishedSnapshot: false,
      errorMessage: null,
    });

    await act(async () => {
      initialLoad.resolve({
        workspace_1: {
          state: "online",
          hasPublishedSnapshot: true,
          lastError: null,
          lastDeploymentUrl: "https://phosphene.example/workspaces/workspace",
        },
      });
      await initialLoad.promise;
    });

    expect(result.current.phase).toBe("loaded");
    expect(result.current.viewState).toEqual({
      phase: "loaded",
      status: "online",
      hasPublishedSnapshot: true,
      errorMessage: null,
    });
  });

  it("shares one state refresh across concurrent workspace hook instances", async () => {
    const initialLoad = deferred<Record<string, DesktopWebPublishWorkspaceState>>();
    listStatesMock.mockReturnValue(initialLoad.promise);

    const firstHook = renderHook(() => useWorkspacePublish("workspace_1"));
    const secondHook = renderHook(() => useWorkspacePublish("workspace_2"));

    expect(listStatesMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      initialLoad.resolve({
        workspace_1: {
          state: "online",
          hasPublishedSnapshot: true,
          lastError: null,
          lastDeploymentUrl: "https://phosphene.example/workspaces/workspace-1",
        },
        workspace_2: {
          state: "changed-since-publish",
          hasPublishedSnapshot: true,
          lastError: null,
          lastDeploymentUrl: "https://phosphene.example/workspaces/workspace-2",
        },
      });
      await initialLoad.promise;
    });

    expect(firstHook.result.current.status).toBe("online");
    expect(secondHook.result.current.status).toBe("changed-since-publish");
  });

  it("reports a refreshing phase during publish-triggered state refreshes", async () => {
    const publishRefresh = deferred<Record<string, DesktopWebPublishWorkspaceState>>();
    listStatesMock
      .mockResolvedValueOnce({
        workspace_1: {
          state: "changed-since-publish",
          hasPublishedSnapshot: true,
          lastError: null,
          lastDeploymentUrl: "https://phosphene.example/workspaces/workspace",
        },
      })
      .mockReturnValueOnce(publishRefresh.promise);

    const { result } = renderHook(() => useWorkspacePublish("workspace_1"));

    await waitFor(() => {
      expect(result.current.phase).toBe("loaded");
    });

    let publishPromise!: Promise<void>;
    act(() => {
      publishPromise = result.current.publish();
    });

    await waitFor(() => {
      expect(result.current.phase).toBe("refreshing");
    });
    expect(result.current.isBusy).toBe(true);
    expect(result.current.deleteEligibility.state).toBe("unknown");

    await act(async () => {
      publishRefresh.resolve({
        workspace_1: {
          state: "online",
          hasPublishedSnapshot: true,
          lastError: null,
          lastDeploymentUrl: "https://phosphene.example/workspaces/workspace",
        },
      });
      await publishPromise;
    });

    expect(result.current.phase).toBe("loaded");
    expect(result.current.isBusy).toBe(false);
  });

  it("reports an error phase when the shared state refresh fails", async () => {
    listStatesMock.mockRejectedValue(new Error("state unavailable"));

    const { result } = renderHook(() => useWorkspacePublish("workspace_1"));

    await waitFor(() => {
      expect(result.current.phase).toBe("error");
    });

    expect(result.current.viewState).toEqual({
      phase: "error",
      status: "not-online",
      hasPublishedSnapshot: false,
      errorMessage: "state unavailable",
    });
    expect(result.current.deleteEligibility).toEqual({
      state: "unknown",
      reason: "Workspace publish state could not be checked.",
    });
  });

  it("retries the shared state refresh after an error", async () => {
    listStatesMock
      .mockRejectedValueOnce(new Error("state unavailable"))
      .mockResolvedValueOnce({
        workspace_1: {
          state: "not-online",
          hasPublishedSnapshot: false,
          lastError: null,
          lastDeploymentUrl: null,
        },
      });

    const { result } = renderHook(() => useWorkspacePublish("workspace_1"));

    await waitFor(() => {
      expect(result.current.phase).toBe("error");
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(listStatesMock).toHaveBeenCalledTimes(2);
    expect(result.current.viewState).toEqual({
      phase: "loaded",
      status: "not-online",
      hasPublishedSnapshot: false,
      errorMessage: null,
    });
    expect(result.current.deleteEligibility).toEqual({ state: "allowed" });
  });

  it("handles a synchronous listStates throw and can recover on retry", async () => {
    listStatesMock
      .mockImplementationOnce(() => {
        throw new Error("desktop unavailable");
      })
      .mockResolvedValueOnce({
        workspace_1: {
          state: "not-online",
          hasPublishedSnapshot: false,
          lastError: null,
          lastDeploymentUrl: null,
        },
      });

    const { result } = renderHook(() => useWorkspacePublish("workspace_1"));

    await waitFor(() => {
      expect(result.current.phase).toBe("error");
    });
    expect(result.current.errorMessage).toBe("desktop unavailable");

    await act(async () => {
      await result.current.refresh();
    });

    expect(listStatesMock).toHaveBeenCalledTimes(2);
    expect(result.current.viewState).toEqual({
      phase: "loaded",
      status: "not-online",
      hasPublishedSnapshot: false,
      errorMessage: null,
    });
    expect(result.current.deleteEligibility).toEqual({ state: "allowed" });
  });

  it("maps delete eligibility from phase, busy state, and backend-equivalent publish state", async () => {
    const initialLoad = deferred<Record<string, DesktopWebPublishWorkspaceState>>();
    listStatesMock.mockReturnValueOnce(initialLoad.promise);

    const { result } = renderHook(() => useWorkspacePublish("workspace_1"));

    expect(result.current.deleteEligibility).toEqual({
      state: "unknown",
      reason: "Workspace publish state is still loading.",
    });

    await act(async () => {
      initialLoad.resolve({
        workspace_1: {
          state: "not-online",
          hasPublishedSnapshot: true,
          lastError: null,
          lastDeploymentUrl: "https://phosphene.example/workspaces/old-snapshot",
        },
      });
      await initialLoad.promise;
    });

    expect(result.current.deleteEligibility).toEqual({ state: "allowed" });

    cleanup();
    listStatesMock.mockResolvedValueOnce({
      workspace_1: {
        state: "publish-failed",
        hasPublishedSnapshot: true,
        lastError: "Wrangler deploy failed",
        lastDeploymentUrl: "https://phosphene.example/workspaces/workspace",
      },
    });

    const failedRepublishHook = renderHook(() => useWorkspacePublish("workspace_1"));

    await waitFor(() => {
      expect(failedRepublishHook.result.current.phase).toBe("loaded");
    });
    expect(failedRepublishHook.result.current.deleteEligibility).toEqual({
      state: "blocked",
      reason: "Workspace is published to the web; unpublish it before deleting.",
    });
  });

  it("does not report a published snapshot for a first-time publish failure", async () => {
    listStatesMock.mockResolvedValue({
      workspace_1: {
        state: "publish-failed",
        lastError: "deploy failed",
        lastDeploymentUrl: null,
        hasPublishedSnapshot: false,
      },
    });

    const { result } = renderHook(() => useWorkspacePublish("workspace_1"));

    await waitFor(() => {
      expect(result.current.status).toBe("publish-failed");
    });

    expect(result.current.errorMessage).toBe("deploy failed");
    expect(result.current.hasPublishedSnapshot).toBe(false);
  });

  it("reports a published snapshot for an online workspace with no deployment URL", async () => {
    listStatesMock.mockResolvedValue({
      workspace_1: {
        state: "online",
        lastError: null,
        lastDeploymentUrl: null,
        hasPublishedSnapshot: true,
      },
    });

    const { result } = renderHook(() => useWorkspacePublish("workspace_1"));

    await waitFor(() => {
      expect(result.current.status).toBe("online");
    });

    expect(result.current.hasPublishedSnapshot).toBe(true);
  });

  it("reports a published snapshot for a changed-since-publish workspace with no deployment URL", async () => {
    listStatesMock.mockResolvedValue({
      workspace_1: {
        state: "changed-since-publish",
        lastError: null,
        lastDeploymentUrl: null,
        hasPublishedSnapshot: true,
      },
    });

    const { result } = renderHook(() => useWorkspacePublish("workspace_1"));

    await waitFor(() => {
      expect(result.current.status).toBe("changed-since-publish");
    });

    expect(result.current.hasPublishedSnapshot).toBe(true);
  });

  it("publishes the workspace and refreshes state", async () => {
    listStatesMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        workspace_1: {
          state: "online",
          hasPublishedSnapshot: true,
          lastError: null,
          lastDeploymentUrl: "https://phosphene.example/workspaces/workspace",
        },
      });

    const { result } = renderHook(() => useWorkspacePublish("workspace_1"));

    await act(async () => {
      await result.current.publish();
    });

    expect(publishWorkspaceToWebMock).toHaveBeenCalledWith("workspace_1");
    expect(result.current.status).toBe("online");
    expect(result.current.isBusy).toBe(false);
    expect(result.current.hasPublishedSnapshot).toBe(true);
  });

  it("unpublishes the workspace and refreshes state", async () => {
    listStatesMock
      .mockResolvedValueOnce({
        workspace_1: {
          state: "online",
          hasPublishedSnapshot: true,
          lastError: null,
          lastDeploymentUrl: "https://phosphene.example/workspaces/workspace",
        },
      })
      .mockResolvedValueOnce({});

    const { result } = renderHook(() => useWorkspacePublish("workspace_1"));

    await waitFor(() => {
      expect(result.current.status).toBe("online");
    });

    await act(async () => {
      await result.current.unpublish();
    });

    expect(unpublishWorkspaceFromWebMock).toHaveBeenCalledWith("workspace_1");
    expect(result.current.status).toBe("not-online");
    expect(result.current.isBusy).toBe(false);
    expect(result.current.hasPublishedSnapshot).toBe(false);
  });

  it("cancels armed deletes before publishing or unpublishing", async () => {
    listStatesMock.mockResolvedValue({
      workspace_1: {
        state: "online",
        hasPublishedSnapshot: true,
        lastError: null,
        lastDeploymentUrl: "https://phosphene.example/workspaces/workspace",
      },
    });

    const { result } = renderHook(() => useWorkspacePublish("workspace_1"));

    await waitFor(() => {
      expect(result.current.phase).toBe("loaded");
    });

    act(() => {
      useAppStore.getState().armDeleteTarget({
        kind: "workspace",
        id: "workspace_1",
        label: "Home",
      });
    });

    await act(async () => {
      await result.current.publish();
    });

    expect(useAppStore.getState().armedDeleteTarget).toBeNull();

    act(() => {
      useAppStore.getState().armDeleteTarget({
        kind: "workspace",
        id: "workspace_1",
        label: "Home",
      });
    });

    await act(async () => {
      await result.current.unpublish();
    });

    expect(useAppStore.getState().armedDeleteTarget).toBeNull();
  });

  it("reports publish failures without losing the current state", async () => {
    const error = new Error("deploy failed");
    listStatesMock.mockResolvedValue({
      workspace_1: {
        state: "changed-since-publish",
        hasPublishedSnapshot: true,
        lastError: null,
        lastDeploymentUrl: "https://phosphene.example/workspaces/workspace",
      },
    });
    publishWorkspaceToWebMock.mockRejectedValue(error);

    const { result } = renderHook(() => useWorkspacePublish("workspace_1"));

    await waitFor(() => {
      expect(result.current.status).toBe("changed-since-publish");
    });

    await act(async () => {
      await result.current.publish();
    });

    expect(result.current.status).toBe("publish-failed");
    expect(result.current.errorMessage).toBe("deploy failed");
    expect(result.current.isBusy).toBe(false);
  });

  it("does not let an older state load overwrite a newer publish refresh", async () => {
    const initialLoad = deferred<Record<string, DesktopWebPublishWorkspaceState>>();
    const publishRefresh = deferred<Record<string, DesktopWebPublishWorkspaceState>>();
    listStatesMock.mockReturnValueOnce(initialLoad.promise).mockReturnValueOnce(publishRefresh.promise);

    const { result } = renderHook(() => useWorkspacePublish("workspace_1"));

    let publishPromise!: Promise<void>;
    act(() => {
      publishPromise = result.current.publish();
    });

    await act(async () => {
      publishRefresh.resolve({
        workspace_1: {
          state: "online",
          hasPublishedSnapshot: true,
          lastError: null,
          lastDeploymentUrl: "https://phosphene.example/workspaces/workspace",
        },
      });
      await publishPromise;
    });

    expect(result.current.status).toBe("online");

    await act(async () => {
      initialLoad.resolve({
        workspace_1: {
          state: "changed-since-publish",
          hasPublishedSnapshot: true,
          lastError: null,
          lastDeploymentUrl: "https://phosphene.example/workspaces/workspace",
        },
      });
      await initialLoad.promise;
      await Promise.resolve();
    });

    expect(result.current.status).toBe("online");
  });

  it("does not let an older rejected state load overwrite a newer publish refresh", async () => {
    const initialLoad = deferred<Record<string, DesktopWebPublishWorkspaceState>>();
    const publishRefresh = deferred<Record<string, DesktopWebPublishWorkspaceState>>();
    listStatesMock.mockReturnValueOnce(initialLoad.promise).mockReturnValueOnce(publishRefresh.promise);

    const { result } = renderHook(() => useWorkspacePublish("workspace_1"));

    let publishPromise!: Promise<void>;
    act(() => {
      publishPromise = result.current.publish();
    });

    await act(async () => {
      publishRefresh.resolve({
        workspace_1: {
          state: "online",
          hasPublishedSnapshot: true,
          lastError: null,
          lastDeploymentUrl: "https://phosphene.example/workspaces/workspace",
        },
      });
      await publishPromise;
    });

    expect(result.current.status).toBe("online");
    expect(result.current.hasPublishedSnapshot).toBe(true);

    await act(async () => {
      initialLoad.reject(new Error("initial list failed"));
      try {
        await initialLoad.promise;
      } catch {
        // ignore expected rejection
      }
      await Promise.resolve();
    });

    expect(result.current.status).toBe("online");
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.hasPublishedSnapshot).toBe(true);
  });
});
