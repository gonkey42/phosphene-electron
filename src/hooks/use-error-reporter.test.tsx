import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useErrorReporter } from "./use-error-reporter";
import { clearSharedErrors, getSharedErrors } from "./shared-error-store";

describe("useErrorReporter", () => {
  beforeEach(() => {
    clearSharedErrors();
  });

  it("records reported errors in the shared store and logs once", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useErrorReporter());

    const error = new Error("test error");
    result.current("Failed to save", error, { boardId: "board-1" });

    expect(getSharedErrors()).toEqual([
      expect.objectContaining({
        message: "Failed to save",
        source: undefined,
        error,
        context: { boardId: "board-1" },
      }),
    ]);
    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to save", {
      error,
      context: { boardId: "board-1" },
      timestamp: expect.any(Number),
    });

    consoleErrorSpy.mockRestore();
  });

  it("returns a stable function reference across renders", () => {
    const { result, rerender } = renderHook(() => useErrorReporter());
    const firstRef = result.current;

    rerender();

    expect(result.current).toBe(firstRef);
  });

  it("includes a component context when provided", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useErrorReporter("BoardList"));

    const error = new Error("test error");
    result.current("Failed to save", error);

    expect(getSharedErrors()[0]).toEqual(
      expect.objectContaining({
      message: "Failed to save",
      source: "BoardList",
      error,
      context: undefined,
      }),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith("[BoardList] Failed to save", {
      error,
      context: undefined,
      timestamp: expect.any(Number),
    });

    consoleErrorSpy.mockRestore();
  });

  it("stores retryable errors in a shared channel", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    const { result } = renderHook(() => useErrorReporter("BoardList"));

    const error = new Error("reload failed");
    const entry = result.current(
      "Failed to reload boards",
      error,
      { workspaceId: "workspace-1" },
      {
        channel: "board-list:reload",
        retry: {
          label: "Retry",
          run: retry,
        },
      },
    );

    expect(entry).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        message: "Failed to reload boards",
        source: "BoardList",
        error,
        context: { workspaceId: "workspace-1" },
        channel: "board-list:reload",
        dismissible: true,
        retry: {
          label: "Retry",
          run: retry,
        },
      }),
    );
    expect(getSharedErrors()).toEqual([
      expect.objectContaining({
        message: "Failed to reload boards",
        source: "BoardList",
        error,
        context: { workspaceId: "workspace-1" },
        channel: "board-list:reload",
        dismissible: true,
        retry: {
          label: "Retry",
          run: retry,
        },
      }),
    ]);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[BoardList] Failed to reload boards", {
      error,
      context: { workspaceId: "workspace-1" },
      timestamp: expect.any(Number),
    });

    consoleErrorSpy.mockRestore();
  });
});
