import { describe, expect, it } from "vitest";
import { createWorkspaceSourceFingerprint } from "./source-fingerprint";

describe("createWorkspaceSourceFingerprint", () => {
  it("changes when board metadata changes", () => {
    const base = createWorkspaceSourceFingerprint({
      workspace: { id: "w1", name: "Trip", updatedAt: "2026-06-24T01:00:00Z" },
      boards: [{ id: "b1", name: "Day 1", position: 0, updatedAt: "2026-06-24T01:00:00Z" }],
    });
    const changed = createWorkspaceSourceFingerprint({
      workspace: { id: "w1", name: "Trip", updatedAt: "2026-06-24T01:00:00Z" },
      boards: [{ id: "b1", name: "Day One", position: 0, updatedAt: "2026-06-24T01:00:00Z" }],
    });

    expect(changed).not.toBe(base);
  });

  it("is stable for equivalent ordered input", () => {
    const input = {
      workspace: { id: "w1", name: "Trip", updatedAt: "2026-06-24T01:00:00Z" },
      boards: [{ id: "b1", name: "Day 1", position: 0, updatedAt: "2026-06-24T01:00:00Z" }],
    };

    expect(createWorkspaceSourceFingerprint(input)).toBe(createWorkspaceSourceFingerprint(input));
  });
});
