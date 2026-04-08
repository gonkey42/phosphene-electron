import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SaveIndicator } from "./SaveIndicator";

describe("SaveIndicator", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows a saved state and fades it out after three seconds", () => {
    vi.useFakeTimers();

    render(<SaveIndicator status="saved" />);

    const indicator = screen.getByText("Saved").closest("div");
    expect(indicator).not.toBeNull();
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(indicator).not.toHaveClass("fade-out");

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(indicator).toHaveClass("fade-out");
  });
});
