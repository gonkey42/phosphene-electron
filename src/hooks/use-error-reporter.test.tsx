import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useErrorReporter } from "./use-error-reporter";

describe("useErrorReporter", () => {
  it("logs the message and error to console.error", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useErrorReporter());

    const error = new Error("test error");
    result.current("Failed to save", error);

    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to save", error);

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

    expect(consoleErrorSpy).toHaveBeenCalledWith("[BoardList] Failed to save", error);

    consoleErrorSpy.mockRestore();
  });
});
