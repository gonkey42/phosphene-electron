# Web Publish Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Inline execution is not allowed unless the user explicitly overrides this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the generated Phosphene Web Publish site and board snapshots match the app dark-mode visual language.

**Architecture:** Keep Web Publish static and manual. Mirror the existing `src/App.css` `.theme-dark` token values into small Web Publish theme modules on the Electron-main and renderer sides, guard those mirrors with tests that parse `src/App.css`, then use the mirrored variables in generated HTML and Excalidraw snapshot export. The generated website is always dark for this feature; it does not follow viewer OS settings or the current app `Light` / `System` / `Dark` menu state.

**Tech Stack:** Electron 41, React 19, TypeScript, Vite, Vitest, Excalidraw export helpers, Node filesystem APIs, Cloudflare Pages static output.

---

## Mandatory Execution Workflow

The build agent must use `superpowers:subagent-driven-development`.

Required controller behavior:

- Use one fresh implementer subagent per major numbered task.
- Provide the implementer subagent the full text for the task it is implementing, plus the spec path `docs/superpowers/specs/2026-06-24-web-publish-dark-mode-design.md`.
- After each major numbered task, dispatch a fresh spec-review subagent.
- After spec review is clean, dispatch a fresh code-quality-review subagent.
- Require fresh spec-review and code-quality-review subagents after each major task; do not reuse reviewers from prior tasks.
- Fix every reviewer finding before moving on, including blocking, important, minor, nice-to-have, low-severity, and lower-severity comments.
- Re-run the relevant reviewer after fixes. A finding is not closed until that reviewer approves it or the user explicitly rejects that finding.
- Commit after each major task only after targeted tests pass and both reviewers are clean.
- For this plan, override any generic implementer template that says to commit before review: implementer subagents must implement, run the task's targeted tests, self-review, and report back without committing. The controller commits only after fresh spec-review and code-quality-review subagents are clean and targeted tests have been re-run.
- After each major task commit, close, clear, or forget all implementer and reviewer subagents before starting the next major task, because only 6 subagents can be open at once.
- Do not dispatch implementation subagents in parallel.
- Do not cut a release or deploy to Cloudflare unless the user explicitly approves that later.

## File Structure

Create:

- `electron/web-publish/site-theme.ts` - Electron-main Web Publish dark token mirror and generated CSS helper.
- `electron/web-publish/site-theme.test.ts` - verifies the Electron-main token mirror matches `src/App.css`.
- `src/lib/web-publish/publish-theme.ts` - renderer-side dark snapshot constants.
- `src/lib/web-publish/publish-theme.test.ts` - verifies renderer snapshot constants match `src/App.css`.

Modify:

- `electron/web-publish/site-generator.ts` - replace hardcoded light page shell styles with app dark token CSS.
- `electron/web-publish/site-generator.test.ts` - assert dark generated index/workspace/zero-workspace empty-state/zero-board workspace empty-state output.
- `src/lib/web-publish/export-board-snapshot.ts` - export snapshots with Excalidraw dark theme state and dark default board background.
- `src/lib/web-publish/export-board-snapshot.test.ts` - cover dark snapshot state, dark defaults, explicit background preservation, and image hydration.
- `docs/phosphene-web-publish.md` - document that generated Web Publish pages use Phosphene dark mode and do not follow viewer OS settings.

No release notes, version bump, deployment script, or release automation changes belong in this implementation.

## Task 1: Add Web Publish Dark Theme Token Mirrors

**Files:**

- Create: `electron/web-publish/site-theme.ts`
- Create: `electron/web-publish/site-theme.test.ts`
- Create: `src/lib/web-publish/publish-theme.ts`
- Create: `src/lib/web-publish/publish-theme.test.ts`

- [ ] **Step 1: Write failing Electron-main token tests**

Create `electron/web-publish/site-theme.test.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  WEB_PUBLISH_DARK_THEME_TOKENS,
  WEB_PUBLISH_THEME_CLASS,
  renderWebPublishDarkThemeCss,
} from "./site-theme";

const DARK_THEME_BLOCK_PATTERN = /\.theme-dark\s*\{(?<body>[\s\S]*?)\}/;
const CUSTOM_PROPERTY_PATTERN = /(?<name>--app-[\w-]+):\s*(?<value>[^;]+);/g;

async function readAppDarkTokens(): Promise<Record<string, string>> {
  const appCss = await fs.readFile(path.resolve("src/App.css"), "utf8");
  const block = appCss.match(DARK_THEME_BLOCK_PATTERN)?.groups?.body;
  expect(block).toBeTruthy();

  return Object.fromEntries(
    [...block!.matchAll(CUSTOM_PROPERTY_PATTERN)].map((match) => [
      match.groups!.name,
      match.groups!.value.trim(),
    ]),
  );
}

describe("web publish dark theme tokens", () => {
  it("matches the renderer app dark theme variables", async () => {
    await expect(readAppDarkTokens()).resolves.toEqual(WEB_PUBLISH_DARK_THEME_TOKENS);
  });

  it("renders a dark theme class with all app variables", () => {
    const css = renderWebPublishDarkThemeCss();

    expect(WEB_PUBLISH_THEME_CLASS).toBe("theme-dark");
    expect(css).toContain(".theme-dark");
    expect(css).toContain("--app-background: #08111f;");
    expect(css).toContain("--app-shadow: 0 24px 60px rgba(2, 6, 23, 0.5);");
  });
});
```

- [ ] **Step 2: Write failing renderer snapshot token tests**

This test must parse `src/App.css`, read the `.theme-dark` `--app-background` value, and compare `WEB_PUBLISH_DARK_BOARD_BACKGROUND` to that token. Do not only assert the literal `#08111f`; the point is to catch future drift from `src/App.css`.

Create `src/lib/web-publish/publish-theme.test.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  WEB_PUBLISH_DARK_BOARD_BACKGROUND,
  WEB_PUBLISH_SNAPSHOT_THEME,
} from "./publish-theme";

const DARK_THEME_BLOCK_PATTERN = /\.theme-dark\s*\{(?<body>[\s\S]*?)\}/;
const CUSTOM_PROPERTY_PATTERN = /(?<name>--app-[\w-]+):\s*(?<value>[^;]+);/g;

async function readAppDarkTokens(): Promise<Record<string, string>> {
  const appCss = await fs.readFile(path.resolve("src/App.css"), "utf8");
  const block = appCss.match(DARK_THEME_BLOCK_PATTERN)?.groups?.body;
  expect(block).toBeTruthy();

  return Object.fromEntries(
    [...block!.matchAll(CUSTOM_PROPERTY_PATTERN)].map((match) => [
      match.groups!.name,
      match.groups!.value.trim(),
    ]),
  );
}

describe("web publish snapshot theme", () => {
  it("uses the app dark theme background as the default board background", async () => {
    const tokens = await readAppDarkTokens();

    expect(WEB_PUBLISH_SNAPSHOT_THEME).toBe("dark");
    expect(WEB_PUBLISH_DARK_BOARD_BACKGROUND).toBe(tokens["--app-background"]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm run test:node -- electron/web-publish/site-theme.test.ts src/lib/web-publish/publish-theme.test.ts
```

Expected: fail because `electron/web-publish/site-theme.ts` and `src/lib/web-publish/publish-theme.ts` do not exist.

- [ ] **Step 4: Implement Electron-main Web Publish theme constants**

Create `electron/web-publish/site-theme.ts`:

```ts
export const WEB_PUBLISH_THEME_CLASS = "theme-dark";

export const WEB_PUBLISH_DARK_THEME_TOKENS = {
  "--app-background": "#08111f",
  "--app-surface": "#0f1b2d",
  "--app-surface-muted": "#12233a",
  "--app-text": "#e2e8f0",
  "--app-text-muted": "#94a3b8",
  "--app-border": "#243448",
  "--app-shadow": "0 24px 60px rgba(2, 6, 23, 0.5)",
} as const;

export function renderWebPublishDarkThemeCss(): string {
  const variables = Object.entries(WEB_PUBLISH_DARK_THEME_TOKENS)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");

  return `.${WEB_PUBLISH_THEME_CLASS} {\n${variables}\n}`;
}
```

- [ ] **Step 5: Implement renderer snapshot theme constants**

Create `src/lib/web-publish/publish-theme.ts`:

```ts
export const WEB_PUBLISH_SNAPSHOT_THEME = "dark";
export const WEB_PUBLISH_DARK_BOARD_BACKGROUND = "#08111f";
```

- [ ] **Step 6: Run targeted token tests**

Run:

```bash
npm run test:node -- electron/web-publish/site-theme.test.ts src/lib/web-publish/publish-theme.test.ts
```

Expected: pass.

- [ ] **Step 7: Run task reviews, fix findings, then commit Task 1**

Dispatch a fresh spec-review subagent for Task 1. Fix every finding, including minor or nice-to-have findings, and re-run spec review until it is clean. Then dispatch a fresh code-quality-review subagent for Task 1. Fix every finding, including minor or nice-to-have findings, and re-run code-quality review until it is clean.

After both reviewers are clean, re-run:

```bash
npm run test:node -- electron/web-publish/site-theme.test.ts src/lib/web-publish/publish-theme.test.ts
```

Expected: pass.

Then commit:

Run:

```bash
git add electron/web-publish/site-theme.ts electron/web-publish/site-theme.test.ts src/lib/web-publish/publish-theme.ts src/lib/web-publish/publish-theme.test.ts
git commit -m "feat: add web publish dark theme tokens"
```

After the commit, close all Task 1 implementer and reviewer subagents before Task 2.

## Task 2: Apply Dark Theme To Generated Web Publish HTML

**Files:**

- Modify: `electron/web-publish/site-generator.ts`
- Modify: `electron/web-publish/site-generator.test.ts`

- [ ] **Step 1: Add failing generated-site dark theme assertions**

In `electron/web-publish/site-generator.test.ts`, extend `generates an index and workspace page for published snapshots` after reading the generated files:

```ts
const indexHtml = await fs.readFile(path.join(outputDir, "index.html"), "utf8");
const workspaceHtml = await fs.readFile(
  path.join(outputDir, "workspaces", "trip", "index.html"),
  "utf8",
);

expect(indexHtml).toContain('<body class="theme-dark">');
expect(indexHtml).toContain("--app-background: #08111f;");
expect(indexHtml).toContain("--app-surface: #0f1b2d;");
expect(indexHtml).toContain("class=\"workspace-link\"");
expect(indexHtml).not.toContain("prefers-color-scheme");
expect(indexHtml).not.toContain("background: white");
expect(indexHtml).not.toContain("#f7f8fb");

expect(workspaceHtml).toContain('<body class="theme-dark">');
expect(workspaceHtml).toContain("class=\"board\"");
expect(workspaceHtml).toContain("class=\"board-image-link\"");
expect(workspaceHtml).not.toContain("background: white");
expect(workspaceHtml).not.toContain("#f7f8fb");
```

Add a new empty-state test:

```ts
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
```

Add a new zero-board workspace empty-state test:

```ts
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
```

- [ ] **Step 2: Run site-generator tests to verify they fail**

Run:

```bash
npm run test:node -- electron/web-publish/site-generator.test.ts
```

Expected: fail because generated pages still use light inline CSS and no `theme-dark` body class.

- [ ] **Step 3: Replace the generated page shell with dark token CSS**

Modify `electron/web-publish/site-generator.ts`:

```ts
import {
  WEB_PUBLISH_THEME_CLASS,
  renderWebPublishDarkThemeCss,
} from "./site-theme";
```

Replace `pageShell()` with:

```ts
function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    ${renderWebPublishDarkThemeCss()}
    :root { color-scheme: dark; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      color: var(--app-text);
      background:
        radial-gradient(circle at top, color-mix(in srgb, var(--app-surface) 88%, transparent), transparent 55%),
        linear-gradient(180deg, var(--app-surface-muted), var(--app-background));
      min-height: 100vh;
    }
    main { max-width: 1080px; margin: 0 auto; padding: 32px 20px 56px; }
    h1 { font-size: clamp(2rem, 5vw, 3.25rem); line-height: 1.05; margin: 0 0 24px; }
    h2 { font-size: 1rem; line-height: 1.25; margin: 0 0 12px; }
    a { color: var(--app-text); text-decoration-color: color-mix(in srgb, var(--app-text-muted) 75%, transparent); text-underline-offset: 0.18em; }
    a:hover { color: color-mix(in srgb, var(--app-text) 88%, white); }
    .workspace-list { display: grid; gap: 12px; list-style: none; padding: 0; }
    .workspace-link {
      display: block;
      padding: 16px;
      border: 1px solid var(--app-border);
      border-radius: 8px;
      background: color-mix(in srgb, var(--app-surface) 92%, transparent);
      box-shadow: var(--app-shadow);
      color: var(--app-text);
      text-decoration: none;
    }
    .workspace-link:hover {
      background: color-mix(in srgb, var(--app-surface) 82%, var(--app-background));
      border-color: color-mix(in srgb, var(--app-border) 70%, var(--app-text-muted));
    }
    .empty-state { color: var(--app-text-muted); margin: 0; }
    .back-link { color: var(--app-text-muted); display: inline-block; margin-bottom: 18px; }
    .board-list { display: grid; gap: 24px; }
    .board {
      border: 1px solid var(--app-border);
      border-radius: 8px;
      background: color-mix(in srgb, var(--app-surface) 94%, transparent);
      box-shadow: var(--app-shadow);
      padding: 16px;
    }
    .board-image-link { display: block; }
    .board img {
      display: block;
      width: 100%;
      height: auto;
      border: 1px solid var(--app-border);
      border-radius: 6px;
      background: var(--app-background);
    }
  </style>
</head>
<body class="${WEB_PUBLISH_THEME_CLASS}">
  <main>${body}</main>
</body>
</html>
`;
}
```

Update `writeIndex()` empty state markup:

```ts
const emptyState = '<p class="empty-state">No workspaces are published yet.</p>';
```

Update `writeWorkspacePage()` body markup so the back link and image link have stable classes:

```ts
return `<article class="board"><h2>${escapeHtml(board.name)}</h2><a class="board-image-link" href="${escapeHtml(boardImagePath)}"><img src="${escapeHtml(boardImagePath)}" alt="${escapeHtml(board.name)}"></a></article>`;
```

Add a zero-board workspace empty state before writing the workspace page:

```ts
const boardList = boardHtml
  ? `<div class="board-list">${boardHtml}</div>`
  : '<p class="empty-state">No boards are published in this workspace yet.</p>';
```

```ts
`<p><a class="back-link" href="../../">Back to workspaces</a></p><h1>${escapeHtml(entry.name)}</h1>${boardList}`
```

- [ ] **Step 4: Run targeted generated-site tests**

Run:

```bash
npm run test:node -- electron/web-publish/site-theme.test.ts electron/web-publish/site-generator.test.ts
```

Expected: pass.

- [ ] **Step 5: Run task reviews, fix findings, then commit Task 2**

Dispatch a fresh spec-review subagent for Task 2. Fix every finding, including minor or nice-to-have findings, and re-run spec review until it is clean. Then dispatch a fresh code-quality-review subagent for Task 2. Fix every finding, including minor or nice-to-have findings, and re-run code-quality review until it is clean.

After both reviewers are clean, re-run:

```bash
npm run test:node -- electron/web-publish/site-theme.test.ts electron/web-publish/site-generator.test.ts
```

Expected: pass.

Then commit:

Run:

```bash
git add electron/web-publish/site-generator.ts electron/web-publish/site-generator.test.ts
git commit -m "feat: theme web publish pages dark"
```

After the commit, close all Task 2 implementer and reviewer subagents before Task 3.

## Task 3: Export Board Snapshots With Dark Publish Rendering

**Files:**

- Modify: `src/lib/web-publish/export-board-snapshot.ts`
- Modify: `src/lib/web-publish/export-board-snapshot.test.ts`

- [ ] **Step 1: Add failing dark snapshot export assertions**

Extend `src/lib/web-publish/export-board-snapshot.test.ts`.

Update the first test's expectation:

This first test intentionally passes `appState: { viewBackgroundColor: "#ffffff" }`; the assertion verifies that an explicit stored white canvas remains white in dark publish mode. Only a missing or undefined `viewBackgroundColor` should use the dark default.

```ts
expect(exportToBlob).toHaveBeenCalledWith(
  expect.objectContaining({
    mimeType: "image/png",
    appState: expect.objectContaining({
      exportBackground: true,
      theme: "dark",
      viewBackgroundColor: "#ffffff",
    }),
    files: expect.objectContaining({
      image1: files.image1,
      hydrated: expect.objectContaining({
        id: "hydrated",
        dataURL: "data:image/png;base64,AAAA",
      }),
    }),
  }),
);
```

Add a new test for missing background:

```ts
it("uses the app dark background when a board has no explicit background", async () => {
  exportToBlob.mockResolvedValue(new Blob([new Uint8Array([4, 5, 6])], { type: "image/png" }));

  await exportWorkspaceBoardSnapshot({
    elements: [],
    appState: {},
    files: {},
  });

  expect(exportToBlob).toHaveBeenCalledWith(
    expect.objectContaining({
      appState: expect.objectContaining({
        exportBackground: true,
        theme: "dark",
        viewBackgroundColor: "#08111f",
      }),
    }),
  );
});
```

Add a new test for explicit background preservation:

```ts
it("preserves an explicit board background color", async () => {
  exportToBlob.mockResolvedValue(new Blob([new Uint8Array([7, 8, 9])], { type: "image/png" }));

  await exportWorkspaceBoardSnapshot({
    elements: [],
    appState: { viewBackgroundColor: "#123456" },
    files: {},
  });

  expect(exportToBlob).toHaveBeenCalledWith(
    expect.objectContaining({
      appState: expect.objectContaining({
        theme: "dark",
        viewBackgroundColor: "#123456",
      }),
    }),
  );
});
```

- [ ] **Step 2: Run snapshot tests to verify they fail**

Run:

```bash
npm run test:node -- src/lib/web-publish/export-board-snapshot.test.ts
```

Expected: fail because snapshot export still defaults missing backgrounds to `#ffffff` and does not force Excalidraw `theme: "dark"`.

- [ ] **Step 3: Apply dark publish snapshot state**

Modify `src/lib/web-publish/export-board-snapshot.ts`:

```ts
import { exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { injectImagesFromFilesystem } from "../image-extraction";
import {
  WEB_PUBLISH_DARK_BOARD_BACKGROUND,
  WEB_PUBLISH_SNAPSHOT_THEME,
} from "./publish-theme";
```

Replace the `appState` passed to `exportToBlob`:

```ts
    appState: {
      ...(input.appState ?? {}),
      exportBackground: true,
      theme: WEB_PUBLISH_SNAPSHOT_THEME,
      viewBackgroundColor:
        input.appState?.viewBackgroundColor ?? WEB_PUBLISH_DARK_BOARD_BACKGROUND,
    },
```

- [ ] **Step 4: Run targeted renderer publish tests**

Run:

```bash
npm run test:node -- src/lib/web-publish/publish-theme.test.ts src/lib/web-publish/export-board-snapshot.test.ts src/lib/web-publish/workspace-publish.test.ts
```

Expected: pass.

- [ ] **Step 5: Run task reviews, fix findings, then commit Task 3**

Dispatch a fresh spec-review subagent for Task 3. Fix every finding, including minor or nice-to-have findings, and re-run spec review until it is clean. Then dispatch a fresh code-quality-review subagent for Task 3. Fix every finding, including minor or nice-to-have findings, and re-run code-quality review until it is clean.

After both reviewers are clean, re-run:

```bash
npm run test:node -- src/lib/web-publish/publish-theme.test.ts src/lib/web-publish/export-board-snapshot.test.ts src/lib/web-publish/workspace-publish.test.ts
```

Expected: pass.

Then commit:

Run:

```bash
git add src/lib/web-publish/export-board-snapshot.ts src/lib/web-publish/export-board-snapshot.test.ts
git commit -m "feat: export web publish snapshots dark"
```

After the commit, close all Task 3 implementer and reviewer subagents before Task 4.

## Task 4: Document Dark Web Publish Behavior And Verify Preview

**Files:**

- Modify: `docs/phosphene-web-publish.md`

- [ ] **Step 1: Update the Web Publish docs**

Add this section after `## Publish Behavior` in `docs/phosphene-web-publish.md`:

```md
## Generated Site Appearance

Generated Web Publish pages always use Phosphene's app dark-mode styling, regardless of whether the app's current `View > Theme` setting is `Light`, `System`, or `Dark` when publishing. They do not follow the viewer's operating-system appearance setting and do not expose a website theme toggle.

Board snapshots are exported for dark viewing. Boards with explicit canvas background colors keep those colors, including explicit white backgrounds; boards without an explicit background use the app dark background.
```

- [ ] **Step 2: Run targeted documentation-adjacent tests**

Run:

```bash
npm run test:node -- electron/web-publish/site-theme.test.ts electron/web-publish/site-generator.test.ts src/lib/web-publish/publish-theme.test.ts src/lib/web-publish/export-board-snapshot.test.ts src/lib/web-publish/workspace-publish.test.ts electron/ipc/web-publish.test.ts
```

Expected: pass.

- [ ] **Step 3: Build main output for a local generated-site preview**

Run:

```bash
npm run build:main
```

Expected: TypeScript main/preload build succeeds and writes `dist-electron/web-publish/site-generator.js`.

- [ ] **Step 4: Generate a local preview without deploying**

Run:

```bash
PREVIEW_ROOT="$(mktemp -d)"
export PREVIEW_ROOT
node <<'NODE'
const fs = require("node:fs/promises");
const path = require("node:path");
const { generateWebPublishSite } = require("./dist-electron/web-publish/site-generator.js");

const root = process.env.PREVIEW_ROOT;
const snapshotRoot = path.join(root, "snapshots");
const outputDir = path.join(root, "site");
const workspaceId = "workspace-preview";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

(async () => {
  await fs.mkdir(path.join(snapshotRoot, workspaceId, "boards"), { recursive: true });
  await fs.writeFile(
    path.join(snapshotRoot, workspaceId, "workspace.json"),
    JSON.stringify({
      workspace: { id: workspaceId, name: "Dark Preview", slug: "dark-preview" },
      boards: [{ id: "board-preview", name: "Board Preview", position: 0, imageFile: "board-preview.png" }],
    }),
  );
  await fs.writeFile(path.join(snapshotRoot, workspaceId, "boards", "board-preview.png"), png);
  await generateWebPublishSite({
    manifest: {
      schemaVersion: 1,
      projectName: "phosphene",
      hostname: "phosphene.gonkey.org",
      workspaces: {
        [workspaceId]: {
          workspaceId,
          slug: "dark-preview",
          name: "Dark Preview",
          sourceFingerprint: "preview",
          publishedAt: "2026-06-24T00:00:00.000Z",
          lastDeploymentUrl: null,
          lastError: null,
        },
      },
      failedWorkspaces: {},
    },
    snapshotRoot,
    outputDir,
  });
  console.log(outputDir);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
NODE
open "$PREVIEW_ROOT/site/index.html"
```

Expected: the local browser opens a dark Web Publish index. Click `Dark Preview`; the workspace page should also be dark, with a dark board card and dark image frame. The generated CSS must be dark regardless of the local app theme menu state. Do not run `wrangler`, `Publish to Web`, `Republish`, `npm run release`, or any deployment command during this check.

- [ ] **Step 5: Run task reviews, fix findings, then commit Task 4**

Dispatch a fresh spec-review subagent for Task 4. Fix every finding, including minor or nice-to-have findings, and re-run spec review until it is clean. Then dispatch a fresh code-quality-review subagent for Task 4. Fix every finding, including minor or nice-to-have findings, and re-run code-quality review until it is clean.

After both reviewers are clean, re-run:

```bash
npm run test:node -- electron/web-publish/site-theme.test.ts electron/web-publish/site-generator.test.ts src/lib/web-publish/publish-theme.test.ts src/lib/web-publish/export-board-snapshot.test.ts src/lib/web-publish/workspace-publish.test.ts electron/ipc/web-publish.test.ts
```

Expected: pass.

Then commit:

Run:

```bash
git add docs/phosphene-web-publish.md
git commit -m "docs: document dark web publish appearance"
```

After the commit, close all Task 4 implementer and reviewer subagents before final verification.

## Final Verification

After all major tasks and reviews are complete, run these commands in order:

```bash
npm run test:node -- electron/web-publish/site-theme.test.ts electron/web-publish/site-generator.test.ts src/lib/web-publish/publish-theme.test.ts src/lib/web-publish/export-board-snapshot.test.ts src/lib/web-publish/workspace-publish.test.ts electron/ipc/web-publish.test.ts
npm test
npm run lint
npm run build
npm run build:main
```

Repeat the generated-site/manual preview check from Task 4 after the final build. Confirm:

- the generated index page is dark
- the generated workspace page is dark
- workspace cards, board cards, image frames, text, links, zero-workspace empty states, and zero-board workspace empty states are readable
- no generated page uses `prefers-color-scheme`
- no generated page contains the previous light-only `background: white` or `#f7f8fb` styling
- no release was cut
- no Cloudflare deploy was run

Do not cut a release or deploy to `https://phosphene.gonkey.org` unless the user explicitly approves that later.
