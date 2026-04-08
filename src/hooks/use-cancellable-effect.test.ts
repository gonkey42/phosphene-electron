import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCancellableEffect } from "./use-cancellable-effect";

describe("useCancellableEffect", () => {
  it("calls the effect function with a cancellation token", () => {
    const effect = vi.fn();

    renderHook(() => useCancellableEffect(effect, []));

    expect(effect).toHaveBeenCalledTimes(1);
    expect(effect).toHaveBeenCalledWith(expect.objectContaining({ cancelled: false }));
  });

  it("sets cancelled to true when the effect is cleaned up", () => {
    let capturedToken: { cancelled: boolean } | null = null;
    const effect = vi.fn((token: { cancelled: boolean }) => {
      capturedToken = token;
    });

    const { unmount } = renderHook(() => useCancellableEffect(effect, []));

    expect(capturedToken!.cancelled).toBe(false);

    unmount();

    expect(capturedToken!.cancelled).toBe(true);
  });

  it("cancels the previous effect when dependencies change", () => {
    let firstToken: { cancelled: boolean } | null = null;
    let callCount = 0;
    const effect = vi.fn((token: { cancelled: boolean }) => {
      if (callCount === 0) {
        firstToken = token;
      }
      callCount++;
    });

    const { rerender } = renderHook(({ dep }) => useCancellableEffect(effect, [dep]), {
      initialProps: { dep: 1 },
    });

    expect(firstToken!.cancelled).toBe(false);

    rerender({ dep: 2 });

    expect(firstToken!.cancelled).toBe(true);
    expect(effect).toHaveBeenCalledTimes(2);
  });

  it("runs the optional cleanup function on cancellation", () => {
    const cleanup = vi.fn();
    const effect = vi.fn(() => cleanup);

    const { unmount } = renderHook(() => useCancellableEffect(effect, []));

    unmount();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
