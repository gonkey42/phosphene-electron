import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeleteEligibility, DeleteTarget } from "../stores/app-store";
import { useAppStore } from "../stores/app-store";

import { useSafeDelete } from "./use-safe-delete";

const workspaceTarget: DeleteTarget = {
  kind: "workspace",
  id: "workspace-1",
  label: "Home",
};

const boardTarget: DeleteTarget = {
  kind: "board",
  id: "board-1",
  workspaceId: "workspace-1",
  label: "Sketches",
};

function createDeferred<T = void>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function SafeDeleteButton({
  target = workspaceTarget,
  eligibility,
  onConfirm = vi.fn(),
}: {
  target?: DeleteTarget;
  eligibility?: DeleteEligibility;
  onConfirm?: (target: DeleteTarget, token: string) => Promise<unknown> | unknown;
}) {
  const safeDelete = useSafeDelete({ target, eligibility, onConfirm });

  return (
    <button type="button" data-testid={`${target.kind}-${target.id}`} {...safeDelete.buttonProps}>
      {safeDelete.isPending ? "Deleting..." : safeDelete.isArmed ? "Delete?" : "Delete"}
    </button>
  );
}

function resetDeleteState() {
  useAppStore.setState({
    armedDeleteTarget: null,
    armedDeleteToken: null,
    deletePendingToken: null,
    deleteAnnouncement: null,
    deleteEligibility: { state: "allowed" },
    workspaces: [],
    activeWorkspaceId: null,
    boards: [],
    activeBoardId: null,
    activeBoardPerWorkspace: {},
    boardListRefresh: { workspaceId: null, nonce: 0 },
    focus: "global",
    initialized: true,
    status: "ready",
    initializationError: null,
  });
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("useSafeDelete", () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetDeleteState();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetDeleteState();
  });

  it("arms a target on first activation and confirms on a later deliberate activation", async () => {
    const pendingDelete = createDeferred();
    const onConfirm = vi.fn(() => pendingDelete.promise);

    render(<SafeDeleteButton onConfirm={onConfirm} />);

    const button = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(button, { detail: 1 });

    const armedToken = useAppStore.getState().armedDeleteToken;
    expect(armedToken).toEqual(expect.any(String));
    expect(button).toHaveTextContent("Delete?");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(useAppStore.getState().isDeleteArmed(workspaceTarget)).toBe(true);

    fireEvent.click(button, { detail: 1 });

    expect(onConfirm).toHaveBeenCalledWith(workspaceTarget, armedToken);
    expect(useAppStore.getState().deletePendingToken).toBe(armedToken);
    expect(button).toHaveTextContent("Deleting...");

    await act(async () => {
      pendingDelete.resolve();
      await pendingDelete.promise;
    });

    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: null,
      armedDeleteToken: null,
      deletePendingToken: null,
      deleteAnnouncement: null,
    });
    expect(button).toHaveTextContent("Delete");
  });

  it("keeps a confirmed delete pending beyond the original arm timeout until settlement", async () => {
    vi.useFakeTimers();
    const pendingDelete = createDeferred();
    const onConfirm = vi.fn(() => pendingDelete.promise);

    render(<SafeDeleteButton onConfirm={onConfirm} />);

    const button = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(button, { detail: 1 });

    act(() => {
      vi.advanceTimersByTime(4_000);
    });

    const token = useAppStore.getState().armedDeleteToken;
    fireEvent.click(button, { detail: 1 });

    expect(onConfirm).toHaveBeenCalledWith(workspaceTarget, token);
    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: workspaceTarget,
      armedDeleteToken: token,
      deletePendingToken: token,
    });
    expect(button).toHaveTextContent("Deleting...");

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: workspaceTarget,
      armedDeleteToken: token,
      deletePendingToken: token,
    });
    expect(button).toHaveTextContent("Deleting...");

    await act(async () => {
      pendingDelete.resolve();
      await pendingDelete.promise;
    });

    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: null,
      armedDeleteToken: null,
      deletePendingToken: null,
      deleteAnnouncement: null,
    });
    expect(button).toHaveTextContent("Delete");
  });

  it("expires an armed target after exactly five seconds", () => {
    vi.useFakeTimers();
    render(<SafeDeleteButton />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }), { detail: 1 });
    const token = useAppStore.getState().armedDeleteToken;

    act(() => {
      vi.advanceTimersByTime(4_999);
    });

    expect(useAppStore.getState().armedDeleteToken).toBe(token);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: null,
      armedDeleteToken: null,
      deleteAnnouncement: null,
    });
  });

  it("does not reset or extend the timeout on hover or focus", () => {
    vi.useFakeTimers();
    render(<SafeDeleteButton />);

    const button = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(button, { detail: 1 });

    act(() => {
      vi.advanceTimersByTime(4_000);
    });

    fireEvent.mouseEnter(button);
    fireEvent.focus(button);

    act(() => {
      vi.advanceTimersByTime(999);
    });

    expect(useAppStore.getState().isDeleteArmed(workspaceTarget)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(useAppStore.getState().armedDeleteTarget).toBeNull();
  });

  it("requires a fresh first activation after expiration before confirming", async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<SafeDeleteButton onConfirm={onConfirm} />);

    const button = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(button, { detail: 1 });

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    fireEvent.click(button, { detail: 1 });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(useAppStore.getState().isDeleteArmed(workspaceTarget)).toBe(true);

    fireEvent.click(button, { detail: 1 });
    await flushPromises();

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels the armed target on Escape", () => {
    render(<SafeDeleteButton />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }), { detail: 1 });
    fireEvent.keyDown(window, { key: "Escape", bubbles: true });

    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: null,
      armedDeleteToken: null,
      deleteAnnouncement: null,
    });
  });

  it("keeps a confirmed delete pending when Escape is pressed before settlement", async () => {
    const pendingDelete = createDeferred();
    const onConfirm = vi.fn(() => pendingDelete.promise);

    render(<SafeDeleteButton onConfirm={onConfirm} />);

    const button = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(button, { detail: 1 });
    fireEvent.click(button, { detail: 1 });

    const token = useAppStore.getState().deletePendingToken;

    fireEvent.keyDown(window, { key: "Escape", bubbles: true });

    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: workspaceTarget,
      armedDeleteToken: token,
      deletePendingToken: token,
    });
    expect(button).toHaveTextContent("Deleting...");

    await act(async () => {
      pendingDelete.resolve();
      await pendingDelete.promise;
    });

    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: null,
      armedDeleteToken: null,
      deletePendingToken: null,
    });
    expect(button).toHaveTextContent("Delete");
  });

  it("ignores stale timeouts from a previously armed target", () => {
    vi.useFakeTimers();
    render(
      <>
        <SafeDeleteButton target={workspaceTarget} />
        <SafeDeleteButton target={boardTarget} />
      </>,
    );

    fireEvent.click(screen.getByTestId("workspace-workspace-1"), { detail: 1 });

    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    fireEvent.click(screen.getByTestId("board-board-1"), { detail: 1 });

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(useAppStore.getState().isDeleteArmed(boardTarget)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(useAppStore.getState().armedDeleteTarget).toBeNull();
  });

  it("does not let stale pending settlement clear a newer armed target", async () => {
    const pendingDelete = createDeferred();
    const onConfirm = vi.fn(() => pendingDelete.promise);

    render(
      <>
        <SafeDeleteButton target={workspaceTarget} onConfirm={onConfirm} />
        <SafeDeleteButton target={boardTarget} />
      </>,
    );

    const workspaceButton = screen.getByTestId("workspace-workspace-1");
    fireEvent.click(workspaceButton, { detail: 1 });
    fireEvent.click(workspaceButton, { detail: 1 });

    const oldToken = useAppStore.getState().deletePendingToken;

    act(() => {
      useAppStore.getState().armDeleteTarget(boardTarget);
    });

    await act(async () => {
      pendingDelete.resolve();
      await pendingDelete.promise;
    });

    expect(oldToken).not.toBeNull();
    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: boardTarget,
      deletePendingToken: null,
    });
    expect(useAppStore.getState().isDeleteArmed(boardTarget)).toBe(true);
  });

  it("ignores duplicate confirmations while the matching token is pending", () => {
    const pendingDelete = createDeferred();
    const onConfirm = vi.fn(() => pendingDelete.promise);

    render(<SafeDeleteButton onConfirm={onConfirm} />);

    const button = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(button, { detail: 1 });
    fireEvent.click(button, { detail: 1 });
    fireEvent.click(button, { detail: 1 });
    fireEvent.keyDown(button, { key: "Enter", bubbles: true });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("ignores repeat keyboard events instead of confirming", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(<SafeDeleteButton onConfirm={onConfirm} />);

    const button = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(button, { detail: 1 });
    fireEvent.keyDown(button, { key: "Enter", repeat: true, bubbles: true });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(useAppStore.getState().isDeleteArmed(workspaceTarget)).toBe(true);

    fireEvent.keyDown(button, { key: "Enter", repeat: false, bubbles: true });
    await flushPromises();

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("ignores pointer double-clicks from the same browser sequence", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(<SafeDeleteButton onConfirm={onConfirm} />);

    const button = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(button, { detail: 1 });
    fireEvent.click(button, { detail: 2 });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(useAppStore.getState().isDeleteArmed(workspaceTarget)).toBe(true);

    fireEvent.click(button, { detail: 1 });
    await flushPromises();

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels on blur away from the armed control", () => {
    render(
      <>
        <SafeDeleteButton />
        <button type="button" data-testid="outside">
          Outside
        </button>
      </>,
    );

    const button = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(button, { detail: 1 });
    fireEvent.blur(button, { relatedTarget: screen.getByTestId("outside") });

    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: null,
      armedDeleteToken: null,
      deleteAnnouncement: null,
    });
  });

  it("keeps a confirmed delete pending when the armed control blurs before settlement", async () => {
    const pendingDelete = createDeferred();
    const onConfirm = vi.fn(() => pendingDelete.promise);

    render(
      <>
        <SafeDeleteButton onConfirm={onConfirm} />
        <button type="button" data-testid="outside">
          Outside
        </button>
      </>,
    );

    const button = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(button, { detail: 1 });
    fireEvent.click(button, { detail: 1 });

    const token = useAppStore.getState().deletePendingToken;

    fireEvent.blur(button, { relatedTarget: screen.getByTestId("outside") });

    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: workspaceTarget,
      armedDeleteToken: token,
      deletePendingToken: token,
    });
    expect(button).toHaveTextContent("Deleting...");

    await act(async () => {
      pendingDelete.resolve();
      await pendingDelete.promise;
    });

    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: null,
      armedDeleteToken: null,
      deletePendingToken: null,
    });
    expect(button).toHaveTextContent("Delete");
  });

  it("keeps a confirmed delete pending when the matching control unmounts before settlement", async () => {
    const pendingDelete = createDeferred();
    const onConfirm = vi.fn(() => pendingDelete.promise);

    const { unmount } = render(<SafeDeleteButton onConfirm={onConfirm} />);

    const button = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(button, { detail: 1 });
    fireEvent.click(button, { detail: 1 });

    const token = useAppStore.getState().deletePendingToken;

    unmount();

    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: workspaceTarget,
      armedDeleteToken: token,
      deletePendingToken: token,
    });

    await act(async () => {
      pendingDelete.resolve();
      await pendingDelete.promise;
    });

    expect(useAppStore.getState()).toMatchObject({
      armedDeleteTarget: null,
      armedDeleteToken: null,
      deletePendingToken: null,
    });
  });

  it("blocks activation when eligibility is not allowed and cancels when armed eligibility changes", () => {
    const onConfirm = vi.fn();
    const blocked: DeleteEligibility = {
      state: "blocked",
      reason: "Cannot delete the last workspace",
    };
    const { rerender } = render(
      <SafeDeleteButton eligibility={blocked} onConfirm={onConfirm} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }), { detail: 1 });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(useAppStore.getState().armedDeleteTarget).toBeNull();

    rerender(<SafeDeleteButton eligibility={{ state: "allowed" }} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }), { detail: 1 });
    expect(useAppStore.getState().isDeleteArmed(workspaceTarget)).toBe(true);

    rerender(<SafeDeleteButton eligibility={blocked} onConfirm={onConfirm} />);

    expect(useAppStore.getState().armedDeleteTarget).toBeNull();
    expect(useAppStore.getState().deleteAnnouncement).toContain(
      "Cannot delete the last workspace",
    );
  });

  it("clears pending and armed state after delete failure", async () => {
    const onConfirm = vi.fn(() => Promise.reject(new Error("delete failed")));
    render(<SafeDeleteButton onConfirm={onConfirm} />);

    const button = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(button, { detail: 1 });
    fireEvent.click(button, { detail: 1 });

    await waitFor(() => {
      expect(useAppStore.getState()).toMatchObject({
        armedDeleteTarget: null,
        armedDeleteToken: null,
        deletePendingToken: null,
        deleteAnnouncement: null,
      });
    });
  });
});
