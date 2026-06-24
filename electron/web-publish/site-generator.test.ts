import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateWebPublishSite } from "./site-generator";
import type { WebPublishManifest } from "./types";

const tempDirs: string[] = [];

async function tempDir() {
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), "phosphene-site-"));
  tempDirs.push(dirPath);
  return dirPath;
}

describe("generateWebPublishSite", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
    );
  });

  it("generates an index and workspace page for published snapshots", async () => {
    const root = await tempDir();
    const snapshotRoot = path.join(root, "snapshots");
    const outputDir = path.join(root, "site");
    await fs.mkdir(path.join(snapshotRoot, "workspace_1", "boards"), { recursive: true });
    await fs.writeFile(
      path.join(snapshotRoot, "workspace_1", "workspace.json"),
      JSON.stringify({
        workspace: { id: "workspace_1", name: "Trip <Fun>", slug: "trip" },
        boards: [{ id: "board_1", name: "Day & Night", position: 0, imageFile: "board_1.png" }],
      }),
    );
    await fs.writeFile(path.join(snapshotRoot, "workspace_1", "boards", "board_1.png"), "png");
    const manifest: WebPublishManifest = {
      schemaVersion: 1,
      projectName: "phosphene",
      hostname: "phosphene.gonkey.org",
      workspaces: {
        workspace_1: {
          workspaceId: "workspace_1",
          slug: "trip",
          name: "Trip <Fun>",
          sourceFingerprint: "abc",
          publishedAt: "2026-06-24T01:00:00.000Z",
          lastDeploymentUrl: null,
          lastError: null,
        },
      },
    };

    await generateWebPublishSite({ manifest, snapshotRoot, outputDir });

    await expect(fs.readFile(path.join(outputDir, "index.html"), "utf8")).resolves.toContain(
      "Trip &lt;Fun&gt;",
    );
    await expect(
      fs.readFile(path.join(outputDir, "workspaces", "trip", "index.html"), "utf8"),
    ).resolves.toContain("Day &amp; Night");
    await expect(
      fs.readFile(path.join(outputDir, "assets", "workspace_1", "board_1.png"), "utf8"),
    ).resolves.toBe("png");
  });

  it("uses manifest workspace metadata when snapshot metadata has drifted", async () => {
    const root = await tempDir();
    const snapshotRoot = path.join(root, "snapshots");
    const outputDir = path.join(root, "site");
    await fs.mkdir(path.join(snapshotRoot, "workspace_1", "boards"), { recursive: true });
    await fs.writeFile(
      path.join(snapshotRoot, "workspace_1", "workspace.json"),
      JSON.stringify({
        workspace: { id: "stale_workspace", name: "Old Name", slug: "old-slug" },
        boards: [{ id: "board_1", name: "Board", position: 0, imageFile: "board_1.png" }],
      }),
    );
    await fs.writeFile(path.join(snapshotRoot, "workspace_1", "boards", "board_1.png"), "png");
    const manifest: WebPublishManifest = {
      schemaVersion: 1,
      projectName: "phosphene",
      hostname: "phosphene.gonkey.org",
      workspaces: {
        workspace_1: {
          workspaceId: "workspace_1",
          slug: "current-slug",
          name: "Current Name",
          sourceFingerprint: "abc",
          publishedAt: "2026-06-24T01:00:00.000Z",
          lastDeploymentUrl: null,
          lastError: null,
        },
      },
    };

    await generateWebPublishSite({ manifest, snapshotRoot, outputDir });

    await expect(fs.readFile(path.join(outputDir, "index.html"), "utf8")).resolves.toContain(
      "./workspaces/current-slug/",
    );
    await expect(fs.readFile(path.join(outputDir, "index.html"), "utf8")).resolves.toContain(
      "Current Name",
    );
    await expect(
      fs.readFile(path.join(outputDir, "workspaces", "current-slug", "index.html"), "utf8"),
    ).resolves.toContain("Current Name");
    await expect(
      fs.readFile(path.join(outputDir, "assets", "workspace_1", "board_1.png"), "utf8"),
    ).resolves.toBe("png");
    await expect(
      fs
        .readFile(path.join(outputDir, "workspaces", "old-slug", "index.html"), "utf8")
        .catch((error: unknown) => (error as NodeJS.ErrnoException).code),
    ).resolves.toBe("ENOENT");
  });
});
