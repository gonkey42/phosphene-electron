import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { collectReleaseArtifacts } from "./release-lib.mjs";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), "phosphene-release-lib-test-"));
  tempDirs.push(dirPath);
  return dirPath;
}

afterEach(() => {
  for (const dirPath of tempDirs.splice(0)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
});

describe("collectReleaseArtifacts", () => {
  it("only returns the expected version's archives and ignores stale files", () => {
    const releaseDir = createTempDir();

    for (const filename of [
      "Phosphene-0.2.3-arm64.dmg",
      "Phosphene-0.2.3-arm64-mac.zip",
      "Phosphene-0.2.3-arm64.dmg.blockmap",
      "Phosphene-0.2.2-arm64.dmg",
      "Phosphene-0.2.1-arm64-mac.zip",
      "codex-stale-artifact.dmg",
    ]) {
      fs.writeFileSync(path.join(releaseDir, filename), "");
    }

    expect(collectReleaseArtifacts(releaseDir, "0.2.3")).toEqual([
      path.join(releaseDir, "Phosphene-0.2.3-arm64-mac.zip"),
      path.join(releaseDir, "Phosphene-0.2.3-arm64.dmg"),
    ]);
  });

  it("throws when the expected version's archives are missing", () => {
    const releaseDir = createTempDir();
    fs.writeFileSync(path.join(releaseDir, "Phosphene-0.2.2-arm64.dmg"), "");

    expect(() => collectReleaseArtifacts(releaseDir, "0.2.3")).toThrow(
      "no .dmg or .zip artifacts found",
    );
  });
});
