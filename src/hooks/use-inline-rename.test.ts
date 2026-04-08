import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useInlineRename } from "./use-inline-rename";

describe("useInlineRename", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts in an idle state", () => {
    const { result } = renderHook(() => useInlineRename());

    expect(result.current.editingId).toBeNull();
    expect(result.current.draftName).toBe("");
    expect(result.current.setDraftName).toEqual(expect.any(Function));
  });

  it("starts rename mode with the current name", () => {
    const { result } = renderHook(() => useInlineRename());

    act(() => {
      result.current.startRename("workspace-1", "Project Alpha");
    });

    expect(result.current.editingId).toBe("workspace-1");
    expect(result.current.draftName).toBe("Project Alpha");
  });

  it("cancels rename mode and clears the draft", () => {
    const { result } = renderHook(() => useInlineRename());

    act(() => {
      result.current.startRename("workspace-1", "Project Alpha");
    });

    act(() => {
      result.current.cancelRename();
    });

    expect(result.current.editingId).toBeNull();
    expect(result.current.draftName).toBe("");
  });

  it("clears state when commitRename is called without an onCommit handler", async () => {
    const { result } = renderHook(() => useInlineRename());

    act(() => {
      result.current.startRename("workspace-1", "Project Alpha");
      result.current.setDraftName("Renamed without callback");
    });

    await act(async () => {
      await result.current.commitRename("workspace-1");
    });

    expect(result.current.editingId).toBeNull();
    expect(result.current.draftName).toBe("");
  });

  it("commits a trimmed rename and resets state", async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useInlineRename(onCommit));

    act(() => {
      result.current.startRename("workspace-1", "Project Alpha");
      result.current.setDraftName("  Project Beta  ");
    });

    await act(async () => {
      await result.current.commitRename("workspace-1");
    });

    expect(onCommit).toHaveBeenCalledWith("workspace-1", "Project Beta");
    expect(result.current.editingId).toBeNull();
    expect(result.current.draftName).toBe("");
  });

  it("does not call onCommit for whitespace-only names", async () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useInlineRename(onCommit));

    act(() => {
      result.current.startRename("workspace-1", "Project Alpha");
      result.current.setDraftName("   ");
    });

    await act(async () => {
      await result.current.commitRename("workspace-1");
    });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("trims the draft name before calling onCommit", async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useInlineRename(onCommit));

    act(() => {
      result.current.startRename("workspace-1", "Project Alpha");
      result.current.setDraftName("  Project Gamma  ");
    });

    await act(async () => {
      await result.current.commitRename("workspace-1");
    });

    expect(onCommit).toHaveBeenCalledWith("workspace-1", "Project Gamma");
  });
});
