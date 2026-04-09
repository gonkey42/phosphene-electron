import { describe, expect, it, vi } from "vitest";

describe("debounce", () => {
  it("delays invocation until the wait time has passed", async () => {
    vi.useFakeTimers();

    const { debounce } = await import("./debounce");
    const handler = vi.fn();
    const debounced = debounce(handler, 200);

    debounced("first");
    debounced("second");

    expect(handler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(199);
    expect(handler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(handler).toHaveBeenCalledWith("second");

    vi.useRealTimers();
  });

  it("flushes the pending invocation immediately", async () => {
    vi.useFakeTimers();

    const { debounce } = await import("./debounce");
    const handler = vi.fn();
    const debounced = debounce(handler, 200);

    debounced("latest");
    debounced.flush();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("latest");

    vi.advanceTimersByTime(200);
    expect(handler).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("cancels a pending invocation", async () => {
    vi.useFakeTimers();

    const { debounce } = await import("./debounce");
    const handler = vi.fn();
    const debounced = debounce(handler, 200);

    debounced("latest");
    debounced.cancel();

    vi.advanceTimersByTime(200);
    expect(handler).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
