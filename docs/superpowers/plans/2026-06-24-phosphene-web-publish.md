# Phosphene Web Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Inline execution is not allowed unless the user explicitly overrides this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add boring-simple manual publishing of selected Phosphene workspaces as private static snapshots on `phosphene.gonkey.org`.

**Architecture:** The renderer prepares board PNG snapshots because Excalidraw image export is browser-oriented and existing image rehydration already lives in renderer code. The Electron main process owns publish state, local filesystem artifacts, static site generation, and Wrangler deployment to a separate Cloudflare Pages project. Cloudflare Access protects the whole site with one email allowlist; Phosphene does not implement authentication.

**Tech Stack:** Electron 41, React 19, TypeScript, Vite, Vitest, better-sqlite3, Excalidraw export helpers, Node filesystem APIs, Wrangler CLI, Cloudflare Pages, Cloudflare Access.

---

## Mandatory Execution Workflow

The build agent must use `superpowers:subagent-driven-development`.

Required controller behavior:

- Dispatch exactly one fresh implementer subagent for each big numbered task.
- Provide that subagent the full text for the task it is implementing, plus the spec path `docs/superpowers/specs/2026-06-24-phosphene-web-publish-design.md`.
- After implementation, dispatch a fresh spec-compliance reviewer subagent.
- After spec compliance is approved, dispatch a fresh code-quality reviewer subagent.
- Fix every reviewer finding before moving on. This includes blocking issues, important comments, minor comments, and "nice-to-have" comments.
- Re-run the relevant reviewer after fixes. Do not treat a reviewer finding as fixed until the reviewer approves it or the user explicitly rejects that finding.
- Clear, close, or forget all implementer and reviewer subagents between big numbered tasks. Task 2 must not reuse Task 1's implementer or reviewers, and so on.
- Do not dispatch implementation subagents in parallel.
- Do not move to the next big numbered task while either review has open findings.
- Commit after each big numbered task only after tests pass and both reviews are fully clean.

## File Structure

Create:

- `electron/web-publish/types.ts` - shared main-process publish types.
- `electron/web-publish/slug.ts` - stable URL slug creation and collision handling.
- `electron/web-publish/manifest-store.ts` - filesystem-backed local publish manifest.
- `electron/web-publish/source-fingerprint.ts` - source fingerprint calculation from workspace and board metadata.
- `electron/web-publish/site-generator.ts` - static HTML and asset generation from published snapshots.
- `electron/web-publish/deployer.ts` - Wrangler deployment wrapper.
- `electron/ipc/web-publish.ts` - main-process IPC registration and payload validation.
- `src/lib/web-publish/export-board-snapshot.ts` - renderer-side Excalidraw PNG export.
- `src/lib/web-publish/workspace-publish.ts` - renderer orchestration for prepare, export, commit, and unpublish.
- `src/hooks/use-workspace-publish.ts` - hook for publish state and actions.
- `src/components/publish/WorkspacePublishControls.tsx` - compact publish controls for each workspace.
- `src/components/publish/WorkspacePublishControls.css` - styles for publish controls.
- Unit tests beside each new module.

Modify:

- `electron/main.ts` - register web publish IPC after database/filesystem setup.
- `electron/preload.ts` - expose `desktop.webPublish`.
- `src/types/desktop.d.ts` - add renderer-facing web publish API types.
- `src/platform/desktop-api.ts` - add typed web publish helper.
- `src/components/workspace/WorkspaceTabBar.tsx` - show publish controls/status per workspace.
- `src/components/workspace/WorkspaceTabBar.css` - fit publish controls without resizing tabs.
- `README.md` or `docs/phosphene-web-publish.md` - document one-time Cloudflare setup and publish behavior.

## Task 1: Publish Manifest, Slugs, And Fingerprints

**Files:**

- Create: `electron/web-publish/types.ts`
- Create: `electron/web-publish/slug.ts`
- Create: `electron/web-publish/slug.test.ts`
- Create: `electron/web-publish/manifest-store.ts`
- Create: `electron/web-publish/manifest-store.test.ts`
- Create: `electron/web-publish/source-fingerprint.ts`
- Create: `electron/web-publish/source-fingerprint.test.ts`

- [ ] **Step 1: Write failing slug tests**

Create `electron/web-publish/slug.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Write failing manifest tests**

Create `electron/web-publish/manifest-store.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_WEB_PUBLISH_MANIFEST,
  readWebPublishManifest,
  writeWebPublishManifest,
} from "./manifest-store";

const tempDirs: string[] = [];

async function createTempUserDataPath(): Promise<string> {
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), "phosphene-web-publish-"));
  tempDirs.push(dirPath);
  return dirPath;
}

describe("web publish manifest store", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
    );
  });

  it("returns the default manifest when none exists", async () => {
    const userDataPath = await createTempUserDataPath();
    await expect(readWebPublishManifest(userDataPath)).resolves.toEqual(
      DEFAULT_WEB_PUBLISH_MANIFEST,
    );
  });

  it("round-trips published workspace state", async () => {
    const userDataPath = await createTempUserDataPath();
    const manifest = {
      ...DEFAULT_WEB_PUBLISH_MANIFEST,
      workspaces: {
        workspace_1: {
          workspaceId: "workspace_1",
          slug: "trip",
          name: "Trip",
          sourceFingerprint: "fingerprint-1",
          publishedAt: "2026-06-24T01:00:00.000Z",
          lastDeploymentUrl: "https://phosphene.gonkey.org",
          lastError: null,
        },
      },
    };

    await writeWebPublishManifest(userDataPath, manifest);
    await expect(readWebPublishManifest(userDataPath)).resolves.toEqual(manifest);
  });
});
```

- [ ] **Step 3: Write failing fingerprint tests**

Create `electron/web-publish/source-fingerprint.test.ts`:

```ts
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
```

- [ ] **Step 4: Run tests and verify they fail**

Run:

```bash
npm run test:node -- electron/web-publish/slug.test.ts electron/web-publish/manifest-store.test.ts electron/web-publish/source-fingerprint.test.ts
```

Expected: fail because the implementation files do not exist.

- [ ] **Step 5: Implement publish types**

Create `electron/web-publish/types.ts`:

```ts
export const WEB_PUBLISH_PROJECT_NAME = "phosphene";
export const WEB_PUBLISH_HOSTNAME = "phosphene.gonkey.org";

export type WebPublishWorkspaceManifestEntry = {
  workspaceId: string;
  slug: string;
  name: string;
  sourceFingerprint: string;
  publishedAt: string;
  lastDeploymentUrl: string | null;
  lastError: string | null;
};

export type WebPublishManifest = {
  schemaVersion: 1;
  projectName: string;
  hostname: string;
  workspaces: Record<string, WebPublishWorkspaceManifestEntry>;
};

export type WebPublishBoardSource = {
  id: string;
  name: string;
  position: number;
  updatedAt: string;
};

export type WebPublishWorkspaceSource = {
  id: string;
  name: string;
  updatedAt: string;
};

export type WebPublishSourceFingerprintInput = {
  workspace: WebPublishWorkspaceSource;
  boards: WebPublishBoardSource[];
};
```

- [ ] **Step 6: Implement slug helpers**

Create `electron/web-publish/slug.ts`:

```ts
function normalizeSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function createWorkspaceSlug(name: string, existingSlug?: string | null): string {
  if (existingSlug) {
    return existingSlug;
  }

  return normalizeSlug(name) || "workspace";
}

export function ensureUniqueWorkspaceSlug(
  baseSlug: string,
  workspaceId: string,
  usedSlugs: Set<string>,
): string {
  if (!usedSlugs.has(baseSlug)) {
    return baseSlug;
  }

  return `${baseSlug}-${workspaceId.slice(0, 6)}`;
}
```

- [ ] **Step 7: Implement manifest store**

Create `electron/web-publish/manifest-store.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import {
  WEB_PUBLISH_HOSTNAME,
  WEB_PUBLISH_PROJECT_NAME,
  type WebPublishManifest,
} from "./types";

export const DEFAULT_WEB_PUBLISH_MANIFEST: WebPublishManifest = {
  schemaVersion: 1,
  projectName: WEB_PUBLISH_PROJECT_NAME,
  hostname: WEB_PUBLISH_HOSTNAME,
  workspaces: {},
};

export function getWebPublishRoot(userDataPath: string): string {
  return path.join(userDataPath, "web-publish");
}

export function getWebPublishManifestPath(userDataPath: string): string {
  return path.join(getWebPublishRoot(userDataPath), "manifest.json");
}

export async function readWebPublishManifest(userDataPath: string): Promise<WebPublishManifest> {
  try {
    const raw = await fs.readFile(getWebPublishManifestPath(userDataPath), "utf8");
    const parsed = JSON.parse(raw) as WebPublishManifest;

    if (parsed.schemaVersion !== 1 || typeof parsed.workspaces !== "object") {
      throw new Error("Unsupported web publish manifest format");
    }

    return parsed;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return DEFAULT_WEB_PUBLISH_MANIFEST;
    }

    throw error;
  }
}

export async function writeWebPublishManifest(
  userDataPath: string,
  manifest: WebPublishManifest,
): Promise<void> {
  const manifestPath = getWebPublishManifestPath(userDataPath);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
```

- [ ] **Step 8: Implement source fingerprinting**

Create `electron/web-publish/source-fingerprint.ts`:

```ts
import { createHash } from "node:crypto";
import type { WebPublishSourceFingerprintInput } from "./types";

export function createWorkspaceSourceFingerprint(input: WebPublishSourceFingerprintInput): string {
  const normalizedInput = {
    workspace: input.workspace,
    boards: [...input.boards].sort((left, right) => {
      if (left.position !== right.position) {
        return left.position - right.position;
      }

      return left.id.localeCompare(right.id);
    }),
  };

  return createHash("sha256").update(JSON.stringify(normalizedInput)).digest("hex");
}
```

- [ ] **Step 9: Run tests and verify they pass**

Run:

```bash
npm run test:node -- electron/web-publish/slug.test.ts electron/web-publish/manifest-store.test.ts electron/web-publish/source-fingerprint.test.ts
```

Expected: pass.

- [ ] **Step 10: Commit Task 1**

Run:

```bash
git add electron/web-publish
git commit -m "feat: add web publish manifest primitives"
```

## Task 2: Static Site Generator

**Files:**

- Create: `electron/web-publish/site-generator.ts`
- Create: `electron/web-publish/site-generator.test.ts`

- [ ] **Step 1: Write failing site generator tests**

Create `electron/web-publish/site-generator.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run the site generator test and verify it fails**

Run:

```bash
npm run test:node -- electron/web-publish/site-generator.test.ts
```

Expected: fail because `site-generator.ts` does not exist.

- [ ] **Step 3: Implement static site generation**

Create `electron/web-publish/site-generator.ts` with these exported types and functions:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import type { WebPublishManifest } from "./types";

type PublishedWorkspaceSnapshot = {
  workspace: { id: string; name: string; slug: string };
  boards: Array<{ id: string; name: string; position: number; imageFile: string }>;
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
```

Add these functions in the same file:

```ts
async function readSnapshot(snapshotRoot: string, workspaceId: string): Promise<PublishedWorkspaceSnapshot> {
  const snapshotPath = path.join(snapshotRoot, workspaceId, "workspace.json");
  return JSON.parse(await fs.readFile(snapshotPath, "utf8")) as PublishedWorkspaceSnapshot;
}

async function writeIndex(outputDir: string, snapshots: PublishedWorkspaceSnapshot[]): Promise<void> {
  const items = snapshots
    .map(
      (snapshot) =>
        `<li><a class="workspace-link" href="./workspaces/${escapeHtml(snapshot.workspace.slug)}/">${escapeHtml(snapshot.workspace.name)}</a></li>`,
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

async function writeWorkspacePage(
  outputDir: string,
  assetRoot: string,
  snapshot: PublishedWorkspaceSnapshot,
): Promise<void> {
  const workspaceDir = path.join(outputDir, "workspaces", snapshot.workspace.slug);
  await fs.mkdir(workspaceDir, { recursive: true });
  const boards = [...snapshot.boards].sort((left, right) => left.position - right.position);
  const boardHtml = boards
    .map(
      (board) =>
        `<article class="board"><h2>${escapeHtml(board.name)}</h2><a href="../../assets/${escapeHtml(snapshot.workspace.id)}/${escapeHtml(board.imageFile)}"><img src="../../assets/${escapeHtml(snapshot.workspace.id)}/${escapeHtml(board.imageFile)}" alt="${escapeHtml(board.name)}"></a></article>`,
    )
    .join("\n");
  await fs.writeFile(
    path.join(workspaceDir, "index.html"),
    pageShell(
      snapshot.workspace.name,
      `<p><a href="../../">Back to workspaces</a></p><h1>${escapeHtml(snapshot.workspace.name)}</h1><div class="board-list">${boardHtml}</div>`,
    ),
    "utf8",
  );
}

async function copyWorkspaceAssets(
  snapshotRoot: string,
  outputDir: string,
  snapshot: PublishedWorkspaceSnapshot,
): Promise<void> {
  const sourceBoardDir = path.join(snapshotRoot, snapshot.workspace.id, "boards");
  const outputAssetDir = path.join(outputDir, "assets", snapshot.workspace.id);
  await fs.mkdir(outputAssetDir, { recursive: true });

  for (const board of snapshot.boards) {
    await fs.copyFile(
      path.join(sourceBoardDir, board.imageFile),
      path.join(outputAssetDir, board.imageFile),
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

  const snapshots = (
    await Promise.all(
      Object.keys(manifest.workspaces).map((workspaceId) => readSnapshot(snapshotRoot, workspaceId)),
    )
  ).sort((left, right) => left.workspace.name.localeCompare(right.workspace.name));

  await writeIndex(outputDir, snapshots);

  for (const snapshot of snapshots) {
    await copyWorkspaceAssets(snapshotRoot, outputDir, snapshot);
    await writeWorkspacePage(outputDir, path.join(outputDir, "assets"), snapshot);
  }
}
```

- [ ] **Step 4: Run the site generator test and verify it passes**

Run:

```bash
npm run test:node -- electron/web-publish/site-generator.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add electron/web-publish/site-generator.ts electron/web-publish/site-generator.test.ts
git commit -m "feat: generate web publish static site"
```

## Task 3: Renderer Board Snapshot Export

**Files:**

- Create: `src/lib/web-publish/export-board-snapshot.ts`
- Create: `src/lib/web-publish/export-board-snapshot.test.ts`

- [ ] **Step 1: Write failing renderer export tests**

Create `src/lib/web-publish/export-board-snapshot.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportWorkspaceBoardSnapshot } from "./export-board-snapshot";

const exportToBlob = vi.fn();

vi.mock("@excalidraw/excalidraw", () => ({
  exportToBlob: (...args: unknown[]) => exportToBlob(...args),
}));

vi.mock("../image-extraction", () => ({
  injectImagesFromFilesystem: vi.fn(async (files) => ({
    ...files,
    hydrated: {
      id: "hydrated",
      dataURL: "data:image/png;base64,AAAA",
      mimeType: "image/png",
      created: 1,
    },
  })),
}));

describe("exportWorkspaceBoardSnapshot", () => {
  beforeEach(() => {
    exportToBlob.mockReset();
  });

  it("hydrates stored image references and returns PNG bytes", async () => {
    exportToBlob.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));

    const bytes = await exportWorkspaceBoardSnapshot({
      elements: [],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {
        image1: {
          id: "image1",
          dataURL: "phosphene-file://images/image1.png",
          mimeType: "image/png",
          created: 1,
        },
      },
    });

    expect([...bytes]).toEqual([1, 2, 3]);
    expect(exportToBlob).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: "image/png",
        appState: expect.objectContaining({ exportBackground: true }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run the renderer export test and verify it fails**

Run:

```bash
npm run test:node -- src/lib/web-publish/export-board-snapshot.test.ts
```

Expected: fail because `export-board-snapshot.ts` does not exist.

- [ ] **Step 3: Implement renderer export**

Create `src/lib/web-publish/export-board-snapshot.ts`:

```ts
import { exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { injectImagesFromFilesystem } from "../image-extraction";

export type WorkspaceBoardSnapshotInput = {
  elements: ExcalidrawInitialDataState["elements"];
  appState: ExcalidrawInitialDataState["appState"];
  files: ExcalidrawInitialDataState["files"];
};

export async function exportWorkspaceBoardSnapshot(
  input: WorkspaceBoardSnapshotInput,
): Promise<Uint8Array> {
  const hydratedFiles = input.files ? await injectImagesFromFilesystem(input.files) : {};
  const blob = await exportToBlob({
    elements: input.elements ?? [],
    appState: {
      ...(input.appState ?? {}),
      exportBackground: true,
      viewBackgroundColor: input.appState?.viewBackgroundColor ?? "#ffffff",
    },
    files: hydratedFiles,
    mimeType: "image/png",
    exportPadding: 32,
  });

  return new Uint8Array(await blob.arrayBuffer());
}
```

- [ ] **Step 4: Run the renderer export test and verify it passes**

Run:

```bash
npm run test:node -- src/lib/web-publish/export-board-snapshot.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add src/lib/web-publish
git commit -m "feat: export board snapshots for web publish"
```

## Task 4: Main Process Publish IPC And Wrangler Deployment

**Files:**

- Create: `electron/web-publish/deployer.ts`
- Create: `electron/web-publish/deployer.test.ts`
- Create: `electron/ipc/web-publish.ts`
- Create: `electron/ipc/web-publish.test.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/desktop.d.ts`
- Modify: `src/platform/desktop-api.ts`

- [ ] **Step 1: Write failing deployer tests**

Create `electron/web-publish/deployer.test.ts` with dependency-injected command execution. Cover:

```ts
import { describe, expect, it, vi } from "vitest";
import { deployWebPublishSite } from "./deployer";

describe("deployWebPublishSite", () => {
  it("runs wrangler pages deploy for the phosphene project", async () => {
    const run = vi.fn().mockResolvedValue({
      stdout: "Deployment complete! https://abc.phosphene.pages.dev",
      stderr: "",
    });

    await expect(
      deployWebPublishSite({
        outputDir: "/tmp/site",
        projectName: "phosphene",
        runCommand: run,
      }),
    ).resolves.toEqual({ deploymentUrl: "https://abc.phosphene.pages.dev" });

    expect(run).toHaveBeenCalledWith("npx", [
      "wrangler",
      "pages",
      "deploy",
      "/tmp/site",
      "--project-name",
      "phosphene",
      "--branch",
      "main",
    ]);
  });
});
```

- [ ] **Step 2: Write failing IPC tests**

Create `electron/ipc/web-publish.test.ts`. Use the existing IPC test patterns in `electron/ipc/*.test.ts`. Add these tests with concrete fixtures:

- `prepares a workspace publish payload with board canvas data`: create one workspace and two boards with saved `canvas_data`, call `web-publish:prepare-workspace`, and assert the response includes the workspace id, both board ids in position order, each board's canvas data, and a non-empty source fingerprint.
- `rejects commit payloads with a stale source fingerprint`: prepare a workspace, mutate one board name, call `web-publish:commit-workspace` with the old fingerprint, assert the call rejects with `Workspace changed during publish; prepare the publish again`, and assert the fake deployer was not called.
- `writes workspace snapshots and deploys the regenerated site`: prepare a workspace, call `web-publish:commit-workspace` with `Uint8Array` PNG data for every board, assert `web-publish/manifest.json`, `web-publish/snapshots/<workspace-id>/workspace.json`, `web-publish/site/index.html`, and copied board PNG files exist, and assert the fake deployer was called once.
- `unpublishes a workspace and deploys the regenerated site`: seed a manifest and snapshot, call `web-publish:unpublish-workspace`, assert the workspace is absent from the manifest and site output, and assert the fake deployer was called once.
- `rejects board image payloads that are not Uint8Array values`: call `web-publish:commit-workspace` with one board image set to a string, assert the call rejects with `expected board image data to be a Uint8Array`, and assert the fake deployer was not called.

- [ ] **Step 3: Run deployer and IPC tests and verify they fail**

Run:

```bash
npm run test:node -- electron/web-publish/deployer.test.ts electron/ipc/web-publish.test.ts
```

Expected: fail because the implementation files do not exist.

- [ ] **Step 4: Implement deployer**

Create `electron/web-publish/deployer.ts`:

```ts
import { spawn } from "node:child_process";

export type CommandResult = {
  stdout: string;
  stderr: string;
};

export type RunCommand = (command: string, args: string[]) => Promise<CommandResult>;

export type DeployWebPublishSiteOptions = {
  outputDir: string;
  projectName: string;
  runCommand?: RunCommand;
};

function defaultRunCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`Wrangler deploy failed with exit code ${code}: ${stderr || stdout}`));
    });
  });
}

export async function deployWebPublishSite({
  outputDir,
  projectName,
  runCommand = defaultRunCommand,
}: DeployWebPublishSiteOptions): Promise<{ deploymentUrl: string | null }> {
  const result = await runCommand("npx", [
    "wrangler",
    "pages",
    "deploy",
    outputDir,
    "--project-name",
    projectName,
    "--branch",
    "main",
  ]);
  const deploymentUrl = result.stdout.match(/https:\/\/\S+/)?.[0] ?? null;

  return { deploymentUrl };
}
```

- [ ] **Step 5: Implement IPC contract**

Create `electron/ipc/web-publish.ts` with these channels:

```ts
export const WEB_PUBLISH_CHANNELS = {
  listStates: "web-publish:list-states",
  prepareWorkspace: "web-publish:prepare-workspace",
  commitWorkspace: "web-publish:commit-workspace",
  unpublishWorkspace: "web-publish:unpublish-workspace",
} as const;
```

Required behavior:

- `prepareWorkspace(workspaceId)` reads the workspace and all boards in that workspace from SQLite.
- It returns workspace metadata, ordered board records with `canvasData`, and a source fingerprint.
- `commitWorkspace({ workspaceId, sourceFingerprint, boardImages })` validates that every image is a `Uint8Array`, rechecks the source fingerprint, writes snapshot files, updates `manifest.json`, regenerates the site, and deploys.
- `unpublishWorkspace(workspaceId)` removes the workspace snapshot, updates the manifest, regenerates the site, and deploys.
- `listStates()` compares manifest fingerprints with current SQLite fingerprints and returns `not-online`, `online`, `changed-since-publish`, or `publish-failed`.
- Renderer payloads are untrusted. The main process re-queries names, board order, and source fingerprints before writing or deploying.

- [ ] **Step 6: Register IPC and preload API**

Modify `electron/main.ts`:

```ts
import { registerWebPublishIPC } from "./ipc/web-publish";
```

Register it in the same bootstrap area as database, filesystem, browser, and board-pack IPC:

```ts
registerWebPublishIPC(app.getPath("userData"));
```

Modify `electron/preload.ts` to expose:

```ts
webPublish: {
  listStates() {
    return ipcRenderer.invoke("web-publish:list-states");
  },
  prepareWorkspace(workspaceId: string) {
    return ipcRenderer.invoke("web-publish:prepare-workspace", workspaceId);
  },
  commitWorkspace(payload: unknown) {
    return ipcRenderer.invoke("web-publish:commit-workspace", payload);
  },
  unpublishWorkspace(workspaceId: string) {
    return ipcRenderer.invoke("web-publish:unpublish-workspace", workspaceId);
  },
},
```

Add matching type definitions to `src/types/desktop.d.ts` and helpers to `src/platform/desktop-api.ts`.

- [ ] **Step 7: Run deployer and IPC tests and verify they pass**

Run:

```bash
npm run test:node -- electron/web-publish/deployer.test.ts electron/ipc/web-publish.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit Task 4**

Run:

```bash
git add electron/web-publish/deployer.ts electron/web-publish/deployer.test.ts electron/ipc/web-publish.ts electron/ipc/web-publish.test.ts electron/main.ts electron/preload.ts src/types/desktop.d.ts src/platform/desktop-api.ts
git commit -m "feat: add web publish IPC and deployment"
```

## Task 5: Renderer Publish Workflow And Workspace UI

**Files:**

- Create: `src/lib/web-publish/workspace-publish.ts`
- Create: `src/lib/web-publish/workspace-publish.test.ts`
- Create: `src/hooks/use-workspace-publish.ts`
- Create: `src/hooks/use-workspace-publish.test.tsx`
- Create: `src/components/publish/WorkspacePublishControls.tsx`
- Create: `src/components/publish/WorkspacePublishControls.css`
- Create: `src/components/publish/WorkspacePublishControls.test.tsx`
- Modify: `src/components/workspace/WorkspaceTabBar.tsx`
- Modify: `src/components/workspace/WorkspaceTabBar.css`

- [ ] **Step 1: Write failing workflow tests**

Create `src/lib/web-publish/workspace-publish.test.ts` using mocked `webPublish` and mocked `exportWorkspaceBoardSnapshot`. Add these tests with concrete fixtures:

- `prepares, exports every board, and commits the publish payload`: mock `prepareWorkspace` to return two boards with valid canvas JSON, mock `exportWorkspaceBoardSnapshot` to return different `Uint8Array` values, call `publishWorkspaceToWeb("workspace_1")`, and assert `commitWorkspace` receives both board ids and PNG bytes.
- `fails without committing when one board has invalid canvas JSON`: mock one board with `canvasData: "{"`, call `publishWorkspaceToWeb`, assert it rejects with `Board board_1 has invalid canvas data and cannot be published`, and assert `commitWorkspace` was not called.
- `passes the prepare source fingerprint through to commit`: mock `prepareWorkspace` with `sourceFingerprint: "fingerprint-123"`, publish, and assert `commitWorkspace` receives the same fingerprint.

- [ ] **Step 2: Write failing UI tests**

Create `src/components/publish/WorkspacePublishControls.test.tsx`. Mock `useWorkspacePublish` and add these tests:

- `shows Publish to Web for a not-online workspace`: return `status: "not-online"` from the hook and assert a `Publish to Web` button is visible and no `Unpublish` button is visible.
- `shows Republish for a changed-since-publish workspace`: return `status: "changed-since-publish"` and assert `Republish` is visible.
- `shows Unpublish when a workspace has a published snapshot`: return `status: "online"` and assert `Unpublish` is visible.
- `calls publish when the publish button is clicked`: return a `publish` spy, click `Publish to Web`, and assert the spy is called once.
- `calls unpublish when the unpublish button is clicked`: return an `unpublish` spy with `status: "online"`, click `Unpublish`, and assert the spy is called once.

- [ ] **Step 3: Run workflow and UI tests and verify they fail**

Run:

```bash
npm run test:node -- src/lib/web-publish/workspace-publish.test.ts src/components/publish/WorkspacePublishControls.test.tsx
```

Expected: fail because modules do not exist.

- [ ] **Step 4: Implement renderer publish workflow**

Create `src/lib/web-publish/workspace-publish.ts`:

```ts
import { webPublish } from "../../platform/desktop-api";
import { exportWorkspaceBoardSnapshot } from "./export-board-snapshot";

type StoredCanvasData = {
  elements?: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

function parseCanvasData(boardId: string, canvasData: string | null): StoredCanvasData {
  if (!canvasData) {
    return { elements: [], appState: {}, files: {} };
  }

  try {
    const parsed = JSON.parse(canvasData) as StoredCanvasData;
    return {
      elements: Array.isArray(parsed.elements) ? parsed.elements : [],
      appState: parsed.appState && typeof parsed.appState === "object" ? parsed.appState : {},
      files: parsed.files && typeof parsed.files === "object" ? parsed.files : {},
    };
  } catch {
    throw new Error(`Board ${boardId} has invalid canvas data and cannot be published`);
  }
}

export async function publishWorkspaceToWeb(workspaceId: string): Promise<void> {
  const prepared = await webPublish.prepareWorkspace(workspaceId);
  const boardImages = [];

  for (const board of prepared.boards) {
    const canvasData = parseCanvasData(board.id, board.canvasData);
    const pngData = await exportWorkspaceBoardSnapshot({
      elements: canvasData.elements as never,
      appState: canvasData.appState as never,
      files: canvasData.files as never,
    });
    boardImages.push({ boardId: board.id, pngData });
  }

  await webPublish.commitWorkspace({
    workspaceId,
    sourceFingerprint: prepared.sourceFingerprint,
    boardImages,
  });
}

export async function unpublishWorkspaceFromWeb(workspaceId: string): Promise<void> {
  await webPublish.unpublishWorkspace(workspaceId);
}
```

- [ ] **Step 5: Implement hook and controls**

Create `src/hooks/use-workspace-publish.ts` so it loads `webPublish.listStates()` on mount and exposes:

```ts
export type WorkspacePublishStatus =
  | "not-online"
  | "online"
  | "changed-since-publish"
  | "publish-failed";

export function useWorkspacePublish(workspaceId: string): {
  status: WorkspacePublishStatus;
  isBusy: boolean;
  errorMessage: string | null;
  publish: () => Promise<void>;
  unpublish: () => Promise<void>;
}
```

Create `src/components/publish/WorkspacePublishControls.tsx` with compact buttons:

```tsx
export function WorkspacePublishControls({ workspaceId }: { workspaceId: string }) {
  const { status, isBusy, errorMessage, publish, unpublish } = useWorkspacePublish(workspaceId);
  const publishLabel = status === "not-online" ? "Publish to Web" : "Republish";
  const hasPublishedSnapshot = status !== "not-online";

  return (
    <div className="workspace-publish-controls">
      <span className={`workspace-publish-controls__status workspace-publish-controls__status--${status}`}>
        {statusLabel[status]}
      </span>
      <button type="button" disabled={isBusy} onClick={() => void publish()}>
        {publishLabel}
      </button>
      {hasPublishedSnapshot ? (
        <button type="button" disabled={isBusy} onClick={() => void unpublish()}>
          Unpublish
        </button>
      ) : null}
      {errorMessage ? <span role="alert">{errorMessage}</span> : null}
    </div>
  );
}
```

Define `statusLabel` in the file:

```ts
const statusLabel: Record<WorkspacePublishStatus, string> = {
  "not-online": "Not Online",
  online: "Online",
  "changed-since-publish": "Changed",
  "publish-failed": "Publish Failed",
};
```

Keep button text from overflowing at desktop and narrow widths.

- [ ] **Step 6: Integrate controls into workspace tabs**

Modify `src/components/workspace/WorkspaceTabBar.tsx` to render `WorkspacePublishControls` inside each workspace tab row when the workspace is not being renamed.

Modify `src/components/workspace/WorkspaceTabBar.css` so the controls fit without changing tab height unexpectedly. Use fixed or constrained button dimensions and allow the status text to truncate.

- [ ] **Step 7: Run workflow and UI tests and verify they pass**

Run:

```bash
npm run test:node -- src/lib/web-publish/workspace-publish.test.ts src/hooks/use-workspace-publish.test.tsx src/components/publish/WorkspacePublishControls.test.tsx src/components/workspace/WorkspaceTabBar.test.tsx
```

Expected: pass.

- [ ] **Step 8: Commit Task 5**

Run:

```bash
git add src/lib/web-publish src/hooks/use-workspace-publish.ts src/hooks/use-workspace-publish.test.tsx src/components/publish src/components/workspace/WorkspaceTabBar.tsx src/components/workspace/WorkspaceTabBar.css
git commit -m "feat: add workspace publish controls"
```

## Task 6: Cloudflare Setup Documentation And End-To-End Verification

**Files:**

- Create: `docs/phosphene-web-publish.md`
- Modify: `README.md`
- Test additions required by reviewer findings during full verification.

- [ ] **Step 1: Write setup documentation**

Create `docs/phosphene-web-publish.md` with these sections:

```md
# Phosphene Web Publish

Phosphene can manually publish selected workspaces as static snapshots to a private Cloudflare Pages site at `https://phosphene.gonkey.org`.

## Privacy Model

Cloudflare Access protects the whole site. Phosphene does not store viewer accounts or passwords. Approved viewers sign in through Cloudflare's one-time PIN email flow.

## One-Time Cloudflare Setup

1. Confirm Wrangler is authenticated with `npx wrangler whoami`.
2. Create or verify a Cloudflare Pages project named `phosphene`.
3. Attach the custom domain `phosphene.gonkey.org`.
4. In Cloudflare Zero Trust, create an Access application for `phosphene.gonkey.org`.
5. Enable one-time PIN login.
6. Add approved viewer email addresses to the Access policy.

## Publish Behavior

Local edits do not appear online until `Publish to Web` or `Republish` is clicked. Publishing a workspace includes every board in that workspace. Unpublishing removes that workspace from the next deployment.

## Troubleshooting

- If Wrangler is not authenticated, run `npx wrangler login`.
- If deployment fails, the app keeps the last successful published state when possible.
- If a board cannot be rendered as a PNG, fix the board locally and retry.
```

- [ ] **Step 2: Link docs from README**

Add one sentence under the README "Board Packs" or "Development" area:

```md
Web workspace publishing is documented in [docs/phosphene-web-publish.md](docs/phosphene-web-publish.md).
```

- [ ] **Step 3: Run targeted tests**

Run:

```bash
npm run test:node -- electron/web-publish src/lib/web-publish src/components/publish
```

Expected: pass.

- [ ] **Step 4: Run type check**

Run:

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 5: Run lint**

Run:

```bash
npm run lint
```

Expected: exit 0.

- [ ] **Step 6: Run Electron build checks**

Run:

```bash
npm run build
npm run build:main
```

Expected: both exit 0.

- [ ] **Step 7: Manual Cloudflare deployment smoke test**

Only run this step after the user confirms the `phosphene` Pages project and Access application exist:

```bash
npx wrangler whoami
npx wrangler pages deploy "$HOME/Library/Application Support/app.phosphene.desktop/web-publish/site" --project-name phosphene --branch main
```

Expected: Wrangler reports a successful deployment URL. Then open `https://phosphene.gonkey.org` in a browser and verify Cloudflare Access prompts for login before showing the private site.

- [ ] **Step 8: Final review**

Dispatch a final code reviewer subagent over the full branch. Fix every finding, including "nice-to-have" comments, before presenting the branch as complete.

- [ ] **Step 9: Commit Task 6**

Run:

```bash
git add docs/phosphene-web-publish.md README.md
git commit -m "docs: document Phosphene web publishing"
```

## Final Verification

After all tasks and all reviewer findings are resolved, run:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run build:main
```

Expected: every command exits 0.

Do not claim the implementation is complete until these commands pass and the final full-branch reviewer has no open findings.
