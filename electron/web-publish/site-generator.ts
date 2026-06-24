import fs from "node:fs/promises";
import path from "node:path";
import type { WebPublishManifest, WebPublishWorkspaceManifestEntry } from "./types";
import { assertSafeWebPublishPathSegment, resolveInsideWebPublishRoot } from "./artifact-paths";

type PublishedWorkspaceSnapshot = {
  workspace: { id: string; name: string; slug: string };
  boards: Array<{ id: string; name: string; position: number; imageFile: string }>;
};

type PublishedWorkspaceSite = {
  entry: WebPublishWorkspaceManifestEntry;
  snapshot: PublishedWorkspaceSnapshot;
};

export type GenerateWebPublishSiteOptions = {
  manifest: WebPublishManifest;
  snapshotRoot: string;
  outputDir: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; color: #172033; background: #f7f8fb; }
    main { max-width: 1080px; margin: 0 auto; padding: 32px 20px 56px; }
    a { color: inherit; }
    .workspace-list { display: grid; gap: 12px; list-style: none; padding: 0; }
    .workspace-link { display: block; padding: 16px; border: 1px solid #d7dce6; border-radius: 8px; background: white; text-decoration: none; }
    .board-list { display: grid; gap: 24px; }
    .board { border: 1px solid #d7dce6; border-radius: 8px; background: white; padding: 16px; }
    .board img { display: block; width: 100%; height: auto; border: 1px solid #e4e7ef; border-radius: 6px; background: white; }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>
`;
}

async function readSnapshot(
  snapshotRoot: string,
  workspaceId: string,
): Promise<PublishedWorkspaceSnapshot> {
  const snapshotPath = resolveInsideWebPublishRoot(snapshotRoot, workspaceId, "workspace.json");
  return JSON.parse(await fs.readFile(snapshotPath, "utf8")) as PublishedWorkspaceSnapshot;
}

async function writeIndex(outputDir: string, workspaces: PublishedWorkspaceSite[]): Promise<void> {
  const items = workspaces
    .map(
      ({ entry }) =>
        `<li><a class="workspace-link" href="./workspaces/${escapeHtml(entry.slug)}/">${escapeHtml(entry.name)}</a></li>`,
    )
    .join("\n");
  const emptyState = "<p>No workspaces are published yet.</p>";
  await fs.writeFile(
    path.join(outputDir, "index.html"),
    pageShell(
      "Phosphene Workspaces",
      `<h1>Phosphene Workspaces</h1>${items ? `<ul class="workspace-list">${items}</ul>` : emptyState}`,
    ),
    "utf8",
  );
}

function relativeHtmlPath(fromDir: string, toPath: string): string {
  return path.relative(fromDir, toPath).split(path.sep).join("/");
}

async function writeWorkspacePage(
  outputDir: string,
  assetRoot: string,
  { entry, snapshot }: PublishedWorkspaceSite,
): Promise<void> {
  const workspaceDir = resolveInsideWebPublishRoot(outputDir, "workspaces", entry.slug);
  await fs.mkdir(workspaceDir, { recursive: true });
  const boards = [...snapshot.boards].sort((left, right) => left.position - right.position);
  const boardHtml = boards
    .map((board) => {
      assertSafeWebPublishPathSegment(board.imageFile);
      const boardImagePath = relativeHtmlPath(
        workspaceDir,
        resolveInsideWebPublishRoot(assetRoot, entry.workspaceId, board.imageFile),
      );
      return `<article class="board"><h2>${escapeHtml(board.name)}</h2><a href="${escapeHtml(boardImagePath)}"><img src="${escapeHtml(boardImagePath)}" alt="${escapeHtml(board.name)}"></a></article>`;
    })
    .join("\n");
  await fs.writeFile(
    path.join(workspaceDir, "index.html"),
    pageShell(
      entry.name,
      `<p><a href="../../">Back to workspaces</a></p><h1>${escapeHtml(entry.name)}</h1><div class="board-list">${boardHtml}</div>`,
    ),
    "utf8",
  );
}

async function copyWorkspaceAssets(
  snapshotRoot: string,
  outputDir: string,
  { entry, snapshot }: PublishedWorkspaceSite,
): Promise<void> {
  const sourceBoardDir = resolveInsideWebPublishRoot(snapshotRoot, entry.workspaceId, "boards");
  const outputAssetDir = resolveInsideWebPublishRoot(outputDir, "assets", entry.workspaceId);
  await fs.mkdir(outputAssetDir, { recursive: true });

  for (const board of snapshot.boards) {
    assertSafeWebPublishPathSegment(board.imageFile);
    await fs.copyFile(
      resolveInsideWebPublishRoot(sourceBoardDir, board.imageFile),
      resolveInsideWebPublishRoot(outputAssetDir, board.imageFile),
    );
  }
}

export async function generateWebPublishSite({
  manifest,
  snapshotRoot,
  outputDir,
}: GenerateWebPublishSiteOptions): Promise<void> {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  const workspaces = (
    await Promise.all(
      Object.values(manifest.workspaces).map(async (entry) => ({
        entry,
        snapshot: await readSnapshot(snapshotRoot, entry.workspaceId),
      })),
    )
  ).sort((left, right) => left.entry.name.localeCompare(right.entry.name));

  await writeIndex(outputDir, workspaces);

  for (const workspace of workspaces) {
    await copyWorkspaceAssets(snapshotRoot, outputDir, workspace);
    await writeWorkspacePage(outputDir, path.join(outputDir, "assets"), workspace);
  }
}
