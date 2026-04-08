// @ts-nocheck
// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("vite test config", () => {
  it("excludes local worktree directories while preserving vitest defaults", () => {
    const configSource = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");

    expect(configSource).toContain("...configDefaults.exclude");
    expect(configSource).toContain('"**/.worktrees/**"');
    expect(configSource).toContain('"**/.codex-review-worktrees/**"');
  });
});
