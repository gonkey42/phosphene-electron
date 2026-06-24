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

    const indexHtml = await fs.readFile(path.join(outputDir, "index.html"), "utf8");
    const workspaceHtml = await fs.readFile(
      path.join(outputDir, "workspaces", "trip", "index.html"),
      "utf8",
    );

    expect(indexHtml).toContain("Trip &lt;Fun&gt;");
    expect(indexHtml).toContain('<body class="theme-dark">');
    expect(indexHtml).toContain("--app-background: #08111f;");
    expect(indexHtml).toContain("--app-surface: #0f1b2d;");
    expect(indexHtml).toContain("background-color: var(--app-background);");
    expect(indexHtml).toContain('class="workspace-link"');
    expect(indexHtml).not.toContain("prefers-color-scheme");
    expect(indexHtml).not.toContain("background: white");
    expect(indexHtml).not.toContain("#f7f8fb");

    expect(workspaceHtml).toContain("Day &amp; Night");
    expect(workspaceHtml).toContain('<body class="theme-dark">');
    expect(workspaceHtml).toContain('class="back-link"');
    expect(workspaceHtml).toContain('class="board"');
    expect(workspaceHtml).toContain('class="board-image-link"');
    expect(workspaceHtml).not.toContain("prefers-color-scheme");
    expect(workspaceHtml).not.toContain("background: white");
    expect(workspaceHtml).not.toContain("#f7f8fb");
    await expect(
      fs.readFile(path.join(outputDir, "assets", "workspace_1", "board_1.png"), "utf8"),
    ).resolves.toBe("png");
  });

  it("generates a dark empty-state landing page", async () => {
    const root = await tempDir();
    const snapshotRoot = path.join(root, "snapshots");
    const outputDir = path.join(root, "site");
    const manifest: WebPublishManifest = {
      schemaVersion: 1,
      projectName: "phosphene",
      hostname: "phosphene.gonkey.org",
      workspaces: {},
      failedWorkspaces: {},
    };

    await generateWebPublishSite({ manifest, snapshotRoot, outputDir });

    const indexHtml = await fs.readFile(path.join(outputDir, "index.html"), "utf8");
    expect(indexHtml).toContain('<body class="theme-dark">');
    expect(indexHtml).toContain('class="empty-state"');
    expect(indexHtml).toContain("No workspaces are published yet.");
    expect(indexHtml).toContain("--app-text-muted: #94a3b8;");
    expect(indexHtml).not.toContain("background: white");
  });

  it("generates a dark empty-state workspace page when a workspace has no boards", async () => {
    const root = await tempDir();
    const snapshotRoot = path.join(root, "snapshots");
    const outputDir = path.join(root, "site");
    await fs.mkdir(path.join(snapshotRoot, "workspace_1"), { recursive: true });
    await fs.writeFile(
      path.join(snapshotRoot, "workspace_1", "workspace.json"),
      JSON.stringify({
        workspace: { id: "workspace_1", name: "Empty Workspace", slug: "empty-workspace" },
        boards: [],
      }),
    );
    const manifest: WebPublishManifest = {
      schemaVersion: 1,
      projectName: "phosphene",
      hostname: "phosphene.gonkey.org",
      workspaces: {
        workspace_1: {
          workspaceId: "workspace_1",
          slug: "empty-workspace",
          name: "Empty Workspace",
          sourceFingerprint: "abc",
          publishedAt: "2026-06-24T01:00:00.000Z",
          lastDeploymentUrl: null,
          lastError: null,
        },
      },
      failedWorkspaces: {},
    };

    await generateWebPublishSite({ manifest, snapshotRoot, outputDir });

    const workspaceHtml = await fs.readFile(
      path.join(outputDir, "workspaces", "empty-workspace", "index.html"),
      "utf8",
    );
    expect(workspaceHtml).toContain('<body class="theme-dark">');
    expect(workspaceHtml).toContain('class="empty-state"');
    expect(workspaceHtml).toContain("No boards are published in this workspace yet.");
    expect(workspaceHtml).toContain("--app-text-muted: #94a3b8;");
    expect(workspaceHtml).not.toContain("background: white");
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

  it("rejects traversal-shaped workspace and board artifact paths", async () => {
    const root = await tempDir();
    const snapshotRoot = path.join(root, "snapshots");
    const outputDir = path.join(root, "site");
    await fs.mkdir(path.join(snapshotRoot, "workspace_1", "boards"), { recursive: true });
    await fs.writeFile(
      path.join(snapshotRoot, "workspace_1", "workspace.json"),
      JSON.stringify({
        workspace: { id: "workspace_1", name: "Trip", slug: "trip" },
        boards: [
          { id: "../board-outside", name: "Board", position: 0, imageFile: "../outside.png" },
        ],
      }),
    );
    const manifest: WebPublishManifest = {
      schemaVersion: 1,
      projectName: "phosphene",
      hostname: "phosphene.gonkey.org",
      workspaces: {
        "../workspace-outside": {
          workspaceId: "../workspace-outside",
          slug: "trip",
          name: "Trip",
          sourceFingerprint: "abc",
          publishedAt: "2026-06-24T01:00:00.000Z",
          lastDeploymentUrl: null,
          lastError: null,
        },
      },
    };

    await expect(generateWebPublishSite({ manifest, snapshotRoot, outputDir })).rejects.toThrow(
      "Unsafe web publish path segment",
    );
    await expect(
      fs
        .readFile(path.join(root, "outside.png"), "utf8")
        .catch((error: unknown) => (error as NodeJS.ErrnoException).code),
    ).resolves.toBe("ENOENT");
  });
});
