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
