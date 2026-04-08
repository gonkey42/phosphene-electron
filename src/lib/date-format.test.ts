import { describe, expect, it, vi } from "vitest";

import { formatRelativeUpdatedTime, parseUpdatedAt } from "./date-format";

describe("parseUpdatedAt", () => {
  it("parses SQLite UTC timestamps", () => {
    expect(parseUpdatedAt("2026-03-29 12:00:00")).toBe(Date.UTC(2026, 2, 29, 12, 0, 0));
  });

  it("parses ISO 8601 timestamps", () => {
    expect(parseUpdatedAt("2026-03-29T12:00:00Z")).toBe(Date.parse("2026-03-29T12:00:00Z"));
  });

  it("falls back to Date.now for invalid timestamps", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234567890);

    expect(parseUpdatedAt("not a timestamp")).toBe(1234567890);

    vi.restoreAllMocks();
  });
});

describe("formatRelativeUpdatedTime", () => {
  it("formats timestamps from the current moment as just now", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 2, 29, 12, 0, 0));

    expect(formatRelativeUpdatedTime("2026-03-29 12:00:00")).toBe("just now");

    vi.restoreAllMocks();
  });

  it("formats timestamps from five minutes ago", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 2, 29, 12, 5, 0));

    expect(formatRelativeUpdatedTime("2026-03-29 12:00:00")).toBe("5m ago");

    vi.restoreAllMocks();
  });

  it("formats timestamps from two hours ago", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 2, 29, 14, 0, 0));

    expect(formatRelativeUpdatedTime("2026-03-29 12:00:00")).toBe("2h ago");

    vi.restoreAllMocks();
  });

  it("formats timestamps from three days ago", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 3, 1, 12, 0, 0));

    expect(formatRelativeUpdatedTime("2026-03-29 12:00:00")).toBe("3d ago");

    vi.restoreAllMocks();
  });
});
