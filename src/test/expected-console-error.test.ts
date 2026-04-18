import { afterEach, describe, expect, it, vi } from "vitest";

import { suppressExpectedConsoleError } from "./expected-console-error";

describe("suppressExpectedConsoleError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("silences console.error until the spy is restored", () => {
    const originalConsoleError = console.error;
    const throwingConsoleError = vi.fn(() => {
      throw new Error("original console.error should stay silenced");
    });

    console.error = throwingConsoleError as typeof console.error;

    const consoleErrorSpy = suppressExpectedConsoleError();

    expect(() => console.error("expected test noise")).not.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith("expected test noise");

    consoleErrorSpy.mockRestore();
    expect(() => console.error("restored")).toThrow(
      "original console.error should stay silenced",
    );
    expect(throwingConsoleError).toHaveBeenCalledWith("restored");

    console.error = originalConsoleError;
  });
});
