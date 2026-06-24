import { describe, expect, it } from "vitest";
import { createWorkspaceSlug, ensureUniqueWorkspaceSlug } from "./slug";

describe("createWorkspaceSlug", () => {
  it("normalizes names for URLs", () => {
    expect(createWorkspaceSlug("Trip Itinerary 2026!")).toBe("trip-itinerary-2026");
  });

  it("falls back when a name has no URL-safe characters", () => {
    expect(createWorkspaceSlug("!!!")).toBe("workspace");
  });

  it("keeps an existing slug stable", () => {
    expect(createWorkspaceSlug("New Name", "old-name")).toBe("old-name");
  });
});

describe("ensureUniqueWorkspaceSlug", () => {
  it("returns the base slug when unused", () => {
    expect(ensureUniqueWorkspaceSlug("trip", "abc123", new Set())).toBe("trip");
  });

  it("adds a stable workspace id suffix when the slug is already used", () => {
    expect(ensureUniqueWorkspaceSlug("trip", "abcdef123456", new Set(["trip"]))).toBe(
      "trip-abcdef",
    );
  });

  it("extends the workspace id suffix when the short suffix is already used", () => {
    expect(
      ensureUniqueWorkspaceSlug("trip", "abcdef123456", new Set(["trip", "trip-abcdef"])),
    ).toBe("trip-abcdef1");
  });
});
