# Electron Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Phosphene from Tauri to Electron while preserving the existing React/Excalidraw UI, SQLite data, image persistence, backup behavior, and canvas workflows — including the current macOS app-data directory so the existing local database and extracted assets continue working without a manual data migration.

**Architecture:** The React/Vite frontend stays intact. All 6 files that import `@tauri-apps/*` get rewritten to call a thin `window.desktop` API exposed via Electron's `contextBridge`. The Electron main process owns SQLite access (via `better-sqlite3`), filesystem/path IPC, and overrides Electron's default `userData` path to the legacy Tauri directory `~/Library/Application Support/app.phosphene.desktop` before `ready` so the current `phosphene.db`, `images/`, and `backups/` continue to work in place. Drag-and-drop is tested natively first — Electron's Chromium should eliminate the current Tauri webview workaround.

**Tech Stack:** React 18, Vite 7, TypeScript, Electron, `better-sqlite3`, Node.js `fs/promises` + `path`, `electron-builder`, Vitest, Testing Library

**Context for the executing agent:** This plan is written for a dedicated Electron migration workspace. The user wants to preserve the current Tauri repo untouched, use a fresh repo copy as described in Task 1. The app is called Phosphene — a canvas workspace built on Excalidraw with SQLite persistence, image extraction to filesystem, daily database backups, and drag-drop image insertion.

**Important codebase conventions:**
- Plain CSS files (not CSS modules). Import as `import './Component.css'`.
- Single Zustand store at `src/stores/app-store.ts` exported as `useAppStore`.
- Database operations in `src/lib/` modules, not in the store.
- File naming uses kebab-case (e.g., `board-operations.ts`).
- Tests use Vitest + Testing Library with `vi.mock()` at module level and `vi.hoisted()` for shared factories.
- SQLite uses `$1`, `$2` positional parameter placeholders.

---

## File Map

### New Files To Create

- `electron/main.ts`
  Purpose: Electron app entry — creates BrowserWindow, registers all IPC handlers, loads the Vite dev URL or production build.

- `electron/preload.ts`
  Purpose: Exposes `window.desktop` API via `contextBridge` with typed IPC channels for database, filesystem, and path operations.

- `electron/ipc/database.ts`
  Purpose: Main-process SQLite handler using `better-sqlite3`. Opens `phosphene.db` in the preserved Tauri app-data directory, translates `$1`, `$2`, ... positional parameters to `?`, and exposes `execute` and `select` over IPC.

- `electron/ipc/filesystem.ts`
  Purpose: Main-process filesystem handler. Wraps Node.js `fs/promises` operations (exists, mkdir, readFile, writeFile, copyFile, readDir, remove) and path resolution over IPC.

- `electron/package.json`
  Purpose: Marks `dist-electron/*.js` as CommonJS so the Electron main/preload build can coexist with the root package's `"type": "module"`.

- `src/platform/desktop-api.ts`
  Purpose: Renderer-side typed wrapper around `window.desktop`. Single import point for all platform calls. Throws a clear error if preload is missing; tests mock this module directly.

- `src/types/desktop.d.ts`
  Purpose: TypeScript declaration for `window.desktop` shape injected by preload.

- `electron/tsconfig.json`
  Purpose: Separate TypeScript config for the Electron main process (targets Node.js, not browser).

### Existing Files To Modify

- `package.json` — Replace Tauri deps/scripts with Electron equivalents.
- `vite.config.ts` — Remove Tauri-specific config (TAURI_DEV_HOST, port 1420 lock, src-tauri watch ignore).
- `tsconfig.json` — Add `src/types/desktop.d.ts` to includes if needed.
- `src/lib/database.ts` — Replace `@tauri-apps/plugin-sql` with `desktop-api` calls.
- `src/lib/file-storage.ts` — Replace `@tauri-apps/api/path` and `@tauri-apps/plugin-fs` with `desktop-api` calls.
- `src/lib/image-extraction.ts` — Replace `@tauri-apps/api/path` and `@tauri-apps/plugin-fs` with `desktop-api` calls.
- `src/lib/backup.ts` — Replace `@tauri-apps/plugin-fs` and `@tauri-apps/api/path` with `desktop-api` calls.
- `src/lib/drop-handler.ts` — Replace `@tauri-apps/plugin-fs` readFile with `desktop-api` call.
- `src/components/canvas/ExcalidrawCanvas.tsx` — Remove the Tauri webview drag-drop bridge and reevaluate the canvas under Electron's native HTML5 drop behavior before deciding whether any follow-up bridge is needed.
- `src/test/setup.ts` — Keep the shared Vitest setup minimal; the migrated tests mock `desktop-api` at the module boundary instead of stubbing a global.
- All `*.test.ts` files that mock `@tauri-apps/*` — Update to mock `desktop-api` instead.

### Files/Directories To Delete (Final Task)

- `src-tauri/` — Entire Rust backend directory.
- `src/lib/tauri-capabilities.test.ts` — Tests Tauri-specific permissions.
- `src-tauri/capabilities/default.test.ts` — Tests Tauri capability JSON.

---

## Guardrails

- Preserve the SQLite filename `phosphene.db` and subdirectory layout (`images/`, `captures/`, `backups/`).
- Preserve the current Tauri macOS app-data path `~/Library/Application Support/app.phosphene.desktop` during the migration; do not silently switch to Electron's default `userData` directory in this plan.
- Do not change the database schema or Excalidraw canvas JSON format.
- Keep the renderer free of Node.js integration — all native access goes through preload + IPC.
- `contextIsolation: true`, `nodeIntegration: false` in all Electron windows.
- Do not redesign state management, component structure, or styling during this migration.
- Delete Tauri code only after Electron parity is confirmed via tests + manual verification.

---

## Task 1: Create The Fresh Repo Copy

**Files:**
- New repo directory (`~/Phosphene-Electron/`)

This task was performed manually by the user before agentic execution began.

- [ ] **Step 1: Copy the repo**

```bash
cp -r ~/Phosphene ~/Phosphene-Electron
cd ~/Phosphene-Electron
rm -rf node_modules .git src-tauri/target
git init
git add -A
git commit -m "initial: copy from Tauri codebase"
```

- [ ] **Step 2: Verify the copy builds**

Run: `npm install && npm run build && npm test`
Expected: All 30 tests pass, Vite build succeeds.

---

## Task 2: Install Electron Dependencies And Update package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Electron runtime and build dependencies**

```bash
npm install --save better-sqlite3
npm install --save-dev electron electron-builder concurrently wait-on @types/better-sqlite3
```

- [ ] **Step 2: Remove Tauri dependencies from package.json**

Remove from `dependencies`:
```
@tauri-apps/api
@tauri-apps/plugin-clipboard-manager
@tauri-apps/plugin-fs
@tauri-apps/plugin-http
@tauri-apps/plugin-shell
@tauri-apps/plugin-sql
@tauri-apps/plugin-updater
```

Remove from `devDependencies`:
```
@tauri-apps/cli
```

- [ ] **Step 3: Replace scripts in package.json**

Replace the `scripts` section with:

```json
{
  "dev": "concurrently -k \"npm run dev:renderer\" \"npm run dev:electron\"",
  "dev:renderer": "vite",
  "dev:electron": "npm run build:main && wait-on http://localhost:5173 file:dist-electron/main.js file:dist-electron/preload.js && electron dist-electron/main.js",
  "build": "tsc && vite build",
  "build:main": "tsc -p electron/tsconfig.json && cp electron/package.json dist-electron/package.json",
  "build:electron": "npm run build && npm run build:main && electron-builder",
  "postinstall": "electron-builder install-app-deps",
  "lint": "eslint src/",
  "lint:fix": "eslint src/ --fix",
  "format": "prettier --write src/",
  "format:check": "prettier --check src/",
  "preview": "vite preview",
  "test": "vitest run"
}
```

- [ ] **Step 4: Add electron-builder config to package.json**

Add top-level `"main"` and `"build"` fields:

```json
{
  "main": "dist-electron/main.js",
  "build": {
    "appId": "app.phosphene.desktop",
    "productName": "Phosphene",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "dist-electron/**/*"
    ],
    "mac": {
      "icon": "icons/icon.icns",
      "category": "public.app-category.productivity"
    },
    "win": {
      "icon": "icons/icon.ico"
    }
  }
}
```

- [ ] **Step 5: Copy icon assets out of src-tauri**

```bash
cp -r src-tauri/icons ./icons
```

- [ ] **Step 6: Add dist-electron and release to .gitignore**

Append to `.gitignore`:
```
dist-electron/
release/
```

- [ ] **Step 7: Run npm install to verify dependency resolution**

Run: `npm install`
Expected: No resolution errors. `node_modules/electron` and `node_modules/better-sqlite3` exist.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json icons/ .gitignore
git commit -m "chore: replace Tauri dependencies with Electron"
```

---

## Task 3: Simplify Vite Config For Electron

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Rewrite vite.config.ts**

Replace the entire file with:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { configDefaults } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    exclude: [
      ...configDefaults.exclude,
      "**/.worktrees/**",
      "**/.codex-review-worktrees/**",
    ],
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
  },
});
```

- [ ] **Step 2: Verify Vite still starts**

Run: `npx vite --host localhost &` then `curl -s http://localhost:5173 | head -5` then kill the process.
Expected: HTML response from Vite dev server.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "chore: simplify Vite config for Electron"
```

---

## Task 4: Define The Desktop API Types And Renderer Adapter

**Files:**
- Create: `src/types/desktop.d.ts`
- Create: `src/platform/desktop-api.ts`

- [ ] **Step 1: Create the TypeScript declaration for window.desktop**

Create `src/types/desktop.d.ts`:

```typescript
interface DesktopDatabase {
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }>;
  select<T = unknown>(sql: string, params?: unknown[]): Promise<T>;
}

interface DesktopFilesystem {
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  copyFile(src: string, dest: string): Promise<void>;
  readDir(path: string): Promise<Array<{ name: string }>>;
  remove(path: string): Promise<void>;
}

interface DesktopPaths {
  appDataDir(): Promise<string>;
  join(...parts: string[]): Promise<string>;
}

interface DesktopAPI {
  db: DesktopDatabase;
  fs: DesktopFilesystem;
  paths: DesktopPaths;
}

interface Window {
  desktop: DesktopAPI;
}
```

- [ ] **Step 2: Create the renderer adapter**

Create `src/platform/desktop-api.ts`:

```typescript
function getDesktop(): DesktopAPI {
  if (!window.desktop) {
    throw new Error("Desktop API not available — is the preload script loaded?");
  }
  return window.desktop;
}

export const db = {
  execute(sql: string, params?: unknown[]) {
    return getDesktop().db.execute(sql, params);
  },
  select<T = unknown>(sql: string, params?: unknown[]): Promise<T> {
    return getDesktop().db.select<T>(sql, params);
  },
};

export const fs = {
  exists(path: string) {
    return getDesktop().fs.exists(path);
  },
  mkdir(path: string) {
    return getDesktop().fs.mkdir(path);
  },
  readFile(path: string) {
    return getDesktop().fs.readFile(path);
  },
  writeFile(path: string, data: Uint8Array) {
    return getDesktop().fs.writeFile(path, data);
  },
  copyFile(src: string, dest: string) {
    return getDesktop().fs.copyFile(src, dest);
  },
  readDir(path: string) {
    return getDesktop().fs.readDir(path);
  },
  remove(path: string) {
    return getDesktop().fs.remove(path);
  },
};

export const paths = {
  appDataDir() {
    return getDesktop().paths.appDataDir();
  },
  join(...parts: string[]) {
    return getDesktop().paths.join(...parts);
  },
};
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No type errors (the declaration extends `Window` globally).

- [ ] **Step 4: Commit**

```bash
git add src/types/desktop.d.ts src/platform/desktop-api.ts
git commit -m "feat: add desktop API types and renderer adapter"
```

---

## Task 5: Migrate Renderer Modules To Desktop API

**Files:**
- Modify: `src/lib/database.ts`
- Modify: `src/lib/file-storage.ts`
- Modify: `src/lib/image-extraction.ts`
- Modify: `src/lib/backup.ts`
- Modify: `src/lib/drop-handler.ts`
- Modify: `src/components/canvas/ExcalidrawCanvas.tsx`

This is the core migration task. Each file drops its `@tauri-apps/*` imports and uses `src/platform/desktop-api` instead.

- [ ] **Step 1: Migrate database.ts**

Replace `src/lib/database.ts` with:

```typescript
import { db } from "../platform/desktop-api";
import { generateId } from "./uuid";

type DatabaseLike = {
  execute: (sql: string, params?: unknown[]) => Promise<{ rowsAffected: number }>;
  select: <T>(sql: string, params?: unknown[]) => Promise<T>;
};

let dbPromise: Promise<DatabaseLike> | null = null;

export async function getDb(): Promise<DatabaseLike> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = db as DatabaseLike;
      await initializeSchema(database);
      return database;
    })().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }

  return dbPromise;
}

async function initializeSchema(database: DatabaseLike): Promise<void> {
  await database.execute("PRAGMA journal_mode=WAL");
  await database.execute("PRAGMA foreign_keys=ON");

  await database.execute(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      layout_config TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
      deleted_at TEXT,
      device_id TEXT
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      canvas_data TEXT,
      thumbnail TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
      deleted_at TEXT,
      device_id TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      board_id TEXT,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
      deleted_at TEXT,
      device_id TEXT,
      FOREIGN KEY (board_id) REFERENCES boards(id)
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS captures (
      id TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      content TEXT NOT NULL,
      source_url TEXT,
      board_id TEXT,
      processed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
      deleted_at TEXT,
      device_id TEXT,
      FOREIGN KEY (board_id) REFERENCES boards(id)
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','utc'))
    )
  `);

  for (const table of ["workspaces", "boards", "files", "captures"]) {
    await database.execute(`
      CREATE TRIGGER IF NOT EXISTS ${table}_updated_at
      AFTER UPDATE ON ${table}
      FOR EACH ROW
      BEGIN
        UPDATE ${table}
        SET updated_at = datetime('now','utc')
        WHERE id = NEW.id;
      END
    `);
  }

  const workspaces = await database.select<Array<{ count: number }>>(
    "SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL",
  );

  if (workspaces[0]?.count === 0) {
    await database.execute(
      "INSERT INTO workspaces (id, name, icon, position) VALUES ($1, $2, $3, $4)",
      [generateId(), "Home", "\u{1F3E0}", 0],
    );
  }
}
```

**Backward compatibility:** `getDb()` remains async and returns an object with `.execute()` and `.select()` methods — matching the Tauri version's API. Existing callers like `const database = await getDb(); database.execute(...)` work unchanged. The cached promise also prevents duplicate schema bootstrapping if multiple modules request the database during startup.

- [ ] **Step 2: Migrate file-storage.ts**

Replace `src/lib/file-storage.ts` with:

```typescript
import { paths, fs } from "../platform/desktop-api";

export async function ensureStorageDirectories(): Promise<void> {
  const appData = await paths.appDataDir();
  const imagesDir = await paths.join(appData, "images");
  const capturesDir = await paths.join(appData, "captures");

  if (!(await fs.exists(imagesDir))) {
    await fs.mkdir(imagesDir);
  }

  if (!(await fs.exists(capturesDir))) {
    await fs.mkdir(capturesDir);
  }
}

export async function getImagesDir(): Promise<string> {
  const appData = await paths.appDataDir();
  return paths.join(appData, "images");
}

export async function getCapturesDir(): Promise<string> {
  const appData = await paths.appDataDir();
  return paths.join(appData, "captures");
}
```

- [ ] **Step 3: Migrate image-extraction.ts**

Replace `src/lib/image-extraction.ts` with:

```typescript
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { fs, paths } from "../platform/desktop-api";

const FILE_REF_PREFIX = "phosphene-file://";
const IMAGES_DIR = "images";

type ExcalidrawFiles = NonNullable<ExcalidrawInitialDataState["files"]>;
type ExcalidrawFile = ExcalidrawFiles[string];

function asDataURL(value: string): ExcalidrawFile["dataURL"] {
  return value as ExcalidrawFile["dataURL"];
}

export async function extractImagesToFilesystem(
  boardId: string,
  files: ExcalidrawFiles,
): Promise<ExcalidrawFiles> {
  const extractedFiles: ExcalidrawFiles = {};
  const appData = await paths.appDataDir();

  for (const [fileId, fileData] of Object.entries(files)) {
    if (!fileData.dataURL.startsWith("data:")) {
      extractedFiles[fileId] = fileData;
      continue;
    }

    try {
      const [, base64Data] = fileData.dataURL.split(",", 2);

      if (!base64Data) {
        extractedFiles[fileId] = fileData;
        continue;
      }

      const relativePath = getImagePath(boardId, fileId, fileData.mimeType);
      const absolutePath = await paths.join(appData, relativePath);
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);

      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      await fs.writeFile(absolutePath, bytes);

      extractedFiles[fileId] = {
        ...fileData,
        dataURL: asDataURL(`${FILE_REF_PREFIX}${relativePath}`),
      };
    } catch (error) {
      console.error(`Failed to extract image ${fileId}:`, error);
      extractedFiles[fileId] = fileData;
    }
  }

  return extractedFiles;
}

export async function injectImagesFromFilesystem(files: ExcalidrawFiles): Promise<ExcalidrawFiles> {
  const injectedFiles: ExcalidrawFiles = {};
  const appData = await paths.appDataDir();

  for (const [fileId, fileData] of Object.entries(files)) {
    if (!fileData.dataURL.startsWith(FILE_REF_PREFIX)) {
      injectedFiles[fileId] = fileData;
      continue;
    }

    try {
      const relativePath = fileData.dataURL.slice(FILE_REF_PREFIX.length);
      const absolutePath = await paths.join(appData, relativePath);

      if (!(await fs.exists(absolutePath))) {
        console.warn(`Image file not found: ${relativePath}`);
        injectedFiles[fileId] = fileData;
        continue;
      }

      const bytes = await fs.readFile(absolutePath);
      let binary = "";

      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }

      injectedFiles[fileId] = {
        ...fileData,
        dataURL: asDataURL(`data:${fileData.mimeType};base64,${btoa(binary)}`),
      };
    } catch (error) {
      console.error(`Failed to inject image ${fileId}:`, error);
      injectedFiles[fileId] = fileData;
    }
  }

  return injectedFiles;
}

function getImagePath(boardId: string, fileId: string, mimeType: string): string {
  return `${IMAGES_DIR}/${boardId}_${fileId}.${getExtensionFromMime(mimeType)}`;
}

function getExtensionFromMime(mimeType: string): string {
  const extensionMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/svg+xml": "svg",
    "image/gif": "gif",
    "image/webp": "webp",
  };

  return extensionMap[mimeType] ?? "png";
}
```

**Key change:** The Tauri version used `BaseDirectory.AppData` as a base-dir option so file paths were relative. The Electron version resolves absolute paths via `paths.join(appData, relativePath)`. The `phosphene-file://` references still store relative paths for portability.

- [ ] **Step 4: Migrate backup.ts**

Replace `src/lib/backup.ts` with:

```typescript
import { fs, paths } from "../platform/desktop-api";

const MAX_BACKUPS = 7;

export async function runDailyBackup(): Promise<void> {
  try {
    const appData = await paths.appDataDir();
    const backupsDir = await paths.join(appData, "backups");
    const dbPath = await paths.join(appData, "phosphene.db");

    if (!(await fs.exists(backupsDir))) {
      await fs.mkdir(backupsDir);
    }

    const today = new Date().toISOString().split("T")[0];
    const todayBackup = await paths.join(backupsDir, `phosphene-${today}.db`);

    if (await fs.exists(todayBackup)) {
      return;
    }

    if (!(await fs.exists(dbPath))) {
      return;
    }

    await fs.copyFile(dbPath, todayBackup);
    await cleanOldBackups(backupsDir);
  } catch (error) {
    console.error("Failed to create database backup:", error);
  }
}

export async function cleanOldBackups(backupsDir: string): Promise<void> {
  try {
    const entries = await fs.readDir(backupsDir);
    const backupFiles = entries
      .filter((entry) => entry.name?.startsWith("phosphene-") && entry.name?.endsWith(".db"))
      .sort((a, b) => (b.name || "").localeCompare(a.name || ""));

    for (let index = MAX_BACKUPS; index < backupFiles.length; index += 1) {
      const filePath = await paths.join(backupsDir, backupFiles[index].name || "");
      await fs.remove(filePath);
    }
  } catch (error) {
    console.error("Failed to clean old backups:", error);
  }
}
```

- [ ] **Step 5: Migrate drop-handler.ts**

Replace `src/lib/drop-handler.ts` with:

```typescript
import { fs } from "../platform/desktop-api";

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function isSupportedImageFile(file: File): boolean {
  return ["image/png", "image/jpeg", "image/gif", "image/svg+xml", "image/webp"].includes(
    file.type,
  );
}

export function isSupportedImagePath(path: string): boolean {
  return getMimeTypeFromPath(path) !== null;
}

export async function readImagePathAsFile(path: string): Promise<File> {
  const mimeType = getMimeTypeFromPath(path);

  if (!mimeType) {
    throw new Error(`Unsupported dropped image path: ${path}`);
  }

  const bytes = await fs.readFile(path);
  return new File([bytes], getFileName(path), { type: mimeType });
}

function getFileName(path: string): string {
  return path.split(/[/\\]/).pop() ?? "image";
}

function getMimeTypeFromPath(path: string): string | null {
  const extension = path.split(".").pop()?.toLowerCase();
  const mimeTypeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
  };

  return extension ? (mimeTypeMap[extension] ?? null) : null;
}
```

- [ ] **Step 6: Migrate ExcalidrawCanvas.tsx — remove Tauri drag-drop bridge**

In `src/components/canvas/ExcalidrawCanvas.tsx`:

1. Remove the import: `import { getCurrentWebview } from "@tauri-apps/api/webview";`
2. Remove the `hasTauriInternals()` function.
3. Remove the entire `useEffect` block (lines 63-126) that sets up the Tauri drag-drop listener.
4. Keep all other code (Excalidraw props, view mode, reactivation, pointer handling) unchanged.
5. Keep the helper functions `isPointInsideRect`, `getDropTarget`, `createSyntheticDropEvent`, `createDataTransfer` — they may be needed if Electron's HTML5 drag-drop needs a bridge (evaluated in Task 8).

The resulting file should have zero `@tauri-apps` imports.

- [ ] **Step 7: Verify no @tauri-apps imports remain in src/**

Run: `grep -r "@tauri-apps\|__TAURI__" src/`
Expected: Zero matches.

- [ ] **Step 8: Commit**

```bash
git add src/lib/database.ts src/lib/file-storage.ts src/lib/image-extraction.ts \
  src/lib/backup.ts src/lib/drop-handler.ts src/components/canvas/ExcalidrawCanvas.tsx
git commit -m "refactor: migrate all renderer modules from Tauri APIs to desktop adapter"
```

---

## Task 6: Update Tests To Mock Desktop API

**Files:**
- Modify: `src/test/setup.ts`
- Modify: `src/lib/database.test.ts`
- Modify: `src/lib/file-storage.test.ts`
- Modify: `src/lib/backup.test.ts`
- Modify: `src/lib/image-extraction.test.ts`
- Modify: `src/lib/drop-handler.test.ts`
- Modify: `src/components/canvas/ExcalidrawCanvas.test.tsx`
- Delete: `src/lib/tauri-capabilities.test.ts`
- Delete: `src-tauri/capabilities/default.test.ts`

- [ ] **Step 1: Create desktop API mock in test setup**

Replace `src/test/setup.ts` with:

```typescript
import "@testing-library/jest-dom/vitest";
```

No global mock needed here — each test file mocks `../platform/desktop-api` or `../../platform/desktop-api` at module level, matching the existing pattern of mocking at the import boundary.

- [ ] **Step 2: Update database.test.ts**

Replace `src/lib/database.test.ts` with:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.fn();
const selectMock = vi.fn();

vi.mock("../platform/desktop-api", () => ({
  db: {
    execute: executeMock,
    select: selectMock,
  },
}));

describe("getDb", () => {
  beforeEach(() => {
    executeMock.mockReset().mockResolvedValue({ rowsAffected: 0 });
    selectMock.mockReset();
    vi.resetModules();
  });

  it("initializes the schema and seeds a default workspace", async () => {
    selectMock.mockResolvedValue([{ count: 0 }]);

    const { getDb } = await import("./database");
    const db = await getDb();

    expect(db).toBeDefined();
    expect(executeMock).toHaveBeenCalledWith("PRAGMA journal_mode=WAL");
    expect(executeMock).toHaveBeenCalledWith("PRAGMA foreign_keys=ON");
    expect(
      executeMock.mock.calls.some(([sql]: [string]) =>
        String(sql).includes("CREATE TABLE IF NOT EXISTS workspaces"),
      ),
    ).toBe(true);
    expect(selectMock).toHaveBeenCalledWith(
      "SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL",
    );
    expect(executeMock).toHaveBeenCalledWith(
      "INSERT INTO workspaces (id, name, icon, position) VALUES ($1, $2, $3, $4)",
      expect.arrayContaining([expect.any(String), "Home", "\u{1F3E0}", 0]),
    );
  });

  it("reuses an existing connection after the first load", async () => {
    selectMock.mockResolvedValue([{ count: 1 }]);

    const { getDb } = await import("./database");
    const first = await getDb();
    const second = await getDb();

    expect(first).toBe(second);
  });
});
```

- [ ] **Step 3: Update file-storage.test.ts**

Replace `src/lib/file-storage.test.ts` with:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const existsMock = vi.fn();
const mkdirMock = vi.fn();
const appDataDirMock = vi.fn();
const joinMock = vi.fn();

vi.mock("../platform/desktop-api", () => ({
  fs: {
    exists: existsMock,
    mkdir: mkdirMock,
  },
  paths: {
    appDataDir: appDataDirMock,
    join: joinMock,
  },
}));

describe("file storage helpers", () => {
  beforeEach(() => {
    existsMock.mockReset();
    mkdirMock.mockReset();
    appDataDirMock.mockReset();
    joinMock.mockReset();
  });

  it("creates images and captures directories when they are missing", async () => {
    appDataDirMock.mockResolvedValue("/app/data");
    joinMock.mockResolvedValueOnce("/app/data/images").mockResolvedValueOnce("/app/data/captures");
    existsMock.mockResolvedValue(false);

    const { ensureStorageDirectories } = await import("./file-storage");
    await ensureStorageDirectories();

    expect(mkdirMock).toHaveBeenCalledWith("/app/data/images");
    expect(mkdirMock).toHaveBeenCalledWith("/app/data/captures");
  });

  it("returns the expected application storage locations", async () => {
    appDataDirMock.mockResolvedValue("/app/data");
    joinMock.mockResolvedValueOnce("/app/data/images").mockResolvedValueOnce("/app/data/captures");

    const { getImagesDir, getCapturesDir } = await import("./file-storage");

    await expect(getImagesDir()).resolves.toBe("/app/data/images");
    await expect(getCapturesDir()).resolves.toBe("/app/data/captures");
  });
});
```

- [ ] **Step 4: Update backup.test.ts**

Replace `src/lib/backup.test.ts` with:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const existsMock = vi.fn();
const mkdirMock = vi.fn();
const readDirMock = vi.fn();
const copyFileMock = vi.fn();
const removeMock = vi.fn();
const appDataDirMock = vi.fn();
const joinMock = vi.fn();

vi.mock("../platform/desktop-api", () => ({
  fs: {
    exists: existsMock,
    mkdir: mkdirMock,
    readDir: readDirMock,
    copyFile: copyFileMock,
    remove: removeMock,
  },
  paths: {
    appDataDir: appDataDirMock,
    join: joinMock,
  },
}));

describe("runDailyBackup", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-30T12:00:00.000Z"));
    existsMock.mockReset();
    mkdirMock.mockReset();
    readDirMock.mockReset();
    copyFileMock.mockReset();
    removeMock.mockReset();
    appDataDirMock.mockReset();
    joinMock.mockReset();

    appDataDirMock.mockResolvedValue("/app/data");
    joinMock.mockImplementation(async (...parts: string[]) => parts.join("/"));
    readDirMock.mockResolvedValue([]);
  });

  it("creates a dated backup when today's backup does not exist yet", async () => {
    existsMock.mockImplementation(async (path: string) => {
      if (path === "/app/data/backups") return false;
      if (path === "/app/data/backups/phosphene-2026-03-30.db") return false;
      if (path === "/app/data/phosphene.db") return true;
      return false;
    });

    const { runDailyBackup } = await import("./backup");
    await runDailyBackup();

    expect(mkdirMock).toHaveBeenCalledWith("/app/data/backups");
    expect(copyFileMock).toHaveBeenCalledWith(
      "/app/data/phosphene.db",
      "/app/data/backups/phosphene-2026-03-30.db",
    );
  });

  it("skips copying when today's backup already exists", async () => {
    existsMock.mockImplementation(async (path: string) => {
      if (path === "/app/data/backups") return true;
      if (path === "/app/data/backups/phosphene-2026-03-30.db") return true;
      if (path === "/app/data/phosphene.db") return true;
      return false;
    });

    const { runDailyBackup } = await import("./backup");
    await runDailyBackup();

    expect(mkdirMock).not.toHaveBeenCalled();
    expect(copyFileMock).not.toHaveBeenCalled();
  });

  it("removes the oldest backup once more than seven dated backups exist", async () => {
    existsMock.mockImplementation(async (path: string) => {
      if (path === "/app/data/backups") return true;
      if (path === "/app/data/backups/phosphene-2026-03-30.db") return false;
      if (path === "/app/data/phosphene.db") return true;
      return false;
    });
    readDirMock.mockResolvedValue([
      { name: "phosphene-2026-03-30.db" },
      { name: "phosphene-2026-03-29.db" },
      { name: "phosphene-2026-03-28.db" },
      { name: "phosphene-2026-03-27.db" },
      { name: "phosphene-2026-03-26.db" },
      { name: "phosphene-2026-03-25.db" },
      { name: "phosphene-2026-03-24.db" },
      { name: "phosphene-2026-03-23.db" },
    ]);

    const { runDailyBackup } = await import("./backup");
    await runDailyBackup();

    expect(removeMock).toHaveBeenCalledWith("/app/data/backups/phosphene-2026-03-23.db");
  });
});
```

- [ ] **Step 5: Update image-extraction.test.ts**

Replace `src/lib/image-extraction.test.ts` with:

```typescript
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const writeFileMock = vi.fn();
const readFileMock = vi.fn();
const existsMock = vi.fn();
const appDataDirMock = vi.fn();
const joinMock = vi.fn();

vi.mock("../platform/desktop-api", () => ({
  fs: {
    writeFile: writeFileMock,
    readFile: readFileMock,
    exists: existsMock,
  },
  paths: {
    appDataDir: appDataDirMock,
    join: joinMock,
  },
}));

function toBase64(value: string): string {
  return btoa(value);
}

function toBytes(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

type TestFiles = NonNullable<ExcalidrawInitialDataState["files"]>;
type TestFile = TestFiles[string];

function createFile(dataURL: string): TestFile {
  return {
    id: "file-1" as TestFile["id"],
    mimeType: "image/png" as TestFile["mimeType"],
    dataURL: dataURL as TestFile["dataURL"],
    created: 100,
    lastRetrieved: 200,
  } as TestFile;
}

describe("image extraction", () => {
  beforeEach(() => {
    vi.resetModules();
    writeFileMock.mockReset();
    readFileMock.mockReset();
    existsMock.mockReset();
    appDataDirMock.mockReset().mockResolvedValue("/app/data");
    joinMock.mockReset().mockImplementation(async (...parts: string[]) => parts.join("/"));
  });

  it("extracts inline Excalidraw image data to the filesystem and rewrites the file reference", async () => {
    const base64Data = toBase64("png-bytes");

    const { extractImagesToFilesystem } = await import("./image-extraction");
    const extractedFiles = await extractImagesToFilesystem("board-1", {
      "file-1": createFile(`data:image/png;base64,${base64Data}`),
    });

    expect(writeFileMock).toHaveBeenCalledWith(
      "/app/data/images/board-1_file-1.png",
      toBytes("png-bytes"),
    );
    expect(extractedFiles).toEqual({
      "file-1": createFile("phosphene-file://images/board-1_file-1.png"),
    });
  });

  it("injects extracted filesystem images back into inline Excalidraw data URLs", async () => {
    existsMock.mockResolvedValue(true);
    readFileMock.mockResolvedValue(toBytes("png-bytes"));

    const { injectImagesFromFilesystem } = await import("./image-extraction");
    const injectedFiles = await injectImagesFromFilesystem({
      "file-1": createFile("phosphene-file://images/board-1_file-1.png"),
    });

    expect(existsMock).toHaveBeenCalledWith("/app/data/images/board-1_file-1.png");
    expect(readFileMock).toHaveBeenCalledWith("/app/data/images/board-1_file-1.png");
    expect(injectedFiles).toEqual({
      "file-1": createFile(`data:image/png;base64,${toBase64("png-bytes")}`),
    });
  });

  it("keeps the original inline data URL when extraction fails", async () => {
    const base64Data = toBase64("png-bytes");
    const originalFile = createFile(`data:image/png;base64,${base64Data}`);

    writeFileMock.mockRejectedValue(new Error("disk full"));

    const { extractImagesToFilesystem } = await import("./image-extraction");
    await expect(
      extractImagesToFilesystem("board-1", {
        "file-1": originalFile,
      }),
    ).resolves.toEqual({
      "file-1": originalFile,
    });
  });

  it("keeps the filesystem reference when image injection fails", async () => {
    const originalFile = createFile("phosphene-file://images/board-1_file-1.png");

    existsMock.mockResolvedValue(true);
    readFileMock.mockRejectedValue(new Error("permission denied"));

    const { injectImagesFromFilesystem } = await import("./image-extraction");
    await expect(
      injectImagesFromFilesystem({
        "file-1": originalFile,
      }),
    ).resolves.toEqual({
      "file-1": originalFile,
    });
  });
});
```

- [ ] **Step 6: Update drop-handler.test.ts**

Replace `src/lib/drop-handler.test.ts` with:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const readFileMock = vi.fn();

vi.mock("../platform/desktop-api", () => ({
  fs: {
    readFile: readFileMock,
  },
}));

describe("drop handler utilities", () => {
  beforeEach(() => {
    vi.resetModules();
    readFileMock.mockReset();
  });

  it("reads a dropped file as a data url", async () => {
    const readAsDataURL = vi.fn();

    class MockFileReader {
      public result: string | ArrayBuffer | null = null;
      public onload: (() => void) | null = null;
      public onerror: ((error: ProgressEvent<FileReader>) => void) | null = null;

      readAsDataURL(file: File) {
        readAsDataURL(file);
        this.result = "data:image/png;base64,cG5nLWJ5dGVz";
        this.onload?.();
      }
    }

    vi.stubGlobal("FileReader", MockFileReader);

    const { readFileAsDataURL } = await import("./drop-handler");
    const file = new File(["png-bytes"], "image.png", { type: "image/png" });

    await expect(readFileAsDataURL(file)).resolves.toBe("data:image/png;base64,cG5nLWJ5dGVz");
    expect(readAsDataURL).toHaveBeenCalledWith(file);
  });

  it("recognizes the supported image mime types", async () => {
    const { isSupportedImageFile } = await import("./drop-handler");

    expect(isSupportedImageFile(new File(["png"], "image.png", { type: "image/png" }))).toBe(true);
    expect(isSupportedImageFile(new File(["jpg"], "image.jpg", { type: "image/jpeg" }))).toBe(true);
    expect(isSupportedImageFile(new File(["gif"], "image.gif", { type: "image/gif" }))).toBe(true);
    expect(isSupportedImageFile(new File(["svg"], "image.svg", { type: "image/svg+xml" }))).toBe(
      true,
    );
    expect(isSupportedImageFile(new File(["webp"], "image.webp", { type: "image/webp" }))).toBe(
      true,
    );
    expect(isSupportedImageFile(new File(["txt"], "notes.txt", { type: "text/plain" }))).toBe(
      false,
    );
  });

  it("reads a dropped filesystem image path as a browser File", async () => {
    readFileMock.mockResolvedValue(Uint8Array.from([112, 110, 103]));

    const { readImagePathAsFile } = await import("./drop-handler");
    const file = await readImagePathAsFile("/Users/hal9000/Desktop/image.PNG");

    expect(readFileMock).toHaveBeenCalledWith("/Users/hal9000/Desktop/image.PNG");
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("image.PNG");
    expect(file.type).toBe("image/png");
    await expect(file.text()).resolves.toBe("png");
  });

  it("recognizes supported dropped image paths by extension", async () => {
    const { isSupportedImagePath } = await import("./drop-handler");

    expect(isSupportedImagePath("/Users/hal9000/Desktop/image.png")).toBe(true);
    expect(isSupportedImagePath("/Users/hal9000/Desktop/image.JPEG")).toBe(true);
    expect(isSupportedImagePath("/Users/hal9000/Desktop/image.webp")).toBe(true);
    expect(isSupportedImagePath("/Users/hal9000/Desktop/notes.txt")).toBe(false);
  });
});
```

- [ ] **Step 7: Update ExcalidrawCanvas.test.tsx**

Remove the Tauri-specific test cases and mocks from `src/components/canvas/ExcalidrawCanvas.test.tsx`:

1. Remove the `vi.mock("@tauri-apps/api/webview", ...)` block.
2. Remove `onDragDropEventMock`, `nativeDropUnlistenMock`, and `latestNativeDropHandler` declarations.
3. Remove `vi.stubGlobal("__TAURI_INTERNALS__", ...)` from `beforeEach`.
4. Remove `vi.unstubAllGlobals()` from `afterEach` (keep `vi.useRealTimers()`).
5. Remove these test cases:
   - `"bridges native Tauri image drops onto the inner Excalidraw surface"`
   - `"does not subscribe to native Tauri drag-drop when non-interactive"`
   - `"ignores native Tauri drops outside the canvas bounds"`
6. Keep all other test cases unchanged (mount suppression, interactivity, view mode, focus claiming).

- [ ] **Step 8: Delete Tauri-specific test files**

```bash
rm src/lib/tauri-capabilities.test.ts
rm src-tauri/capabilities/default.test.ts
```

- [ ] **Step 9: Run all tests**

Run: `npm test`
Expected: All remaining tests pass. The deleted Tauri-specific tests are gone. The migrated tests mock `../platform/desktop-api` instead of `@tauri-apps/*`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "test: update all tests to mock desktop adapter instead of Tauri APIs"
```

---

## Task 7: Create The Electron Main Process

**Files:**
- Create: `electron/tsconfig.json`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `electron/ipc/database.ts`
- Create: `electron/ipc/filesystem.ts`

- [ ] **Step 1: Create electron/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "../dist-electron",
    "rootDir": ".",
    "resolveJsonModule": true,
    "types": ["node"],
    "skipLibCheck": true
  },
  "include": ["./**/*.ts"]
}
```

- [ ] **Step 2: Create electron/package.json**

```json
{
  "type": "commonjs"
}
```

- [ ] **Step 3: Create electron/ipc/database.ts**

```typescript
import { ipcMain } from "electron";
import path from "node:path";
import Database from "better-sqlite3";

let db: Database.Database | null = null;

export function getDatabase(userDataPath: string): Database.Database {
  if (db) return db;

  const dbPath = path.join(userDataPath, "phosphene.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  return db;
}

/**
 * Translate `$1`, `$2`, ... positional placeholders to `?` anonymous placeholders.
 * The existing codebase uses Tauri's `$N` positional syntax, but `better-sqlite3`
 * treats `$N` as named parameters (expecting an object like `{ 1: val }`).
 * Anonymous `?` placeholders work with positional spread arguments.
 */
function translateParams(sql: string): string {
  return sql.replace(/\$\d+/g, "?");
}

export function registerDatabaseIPC(userDataPath: string): void {
  const database = getDatabase(userDataPath);

  ipcMain.handle("db:execute", (_event, sql: string, params?: unknown[]) => {
    const translated = translateParams(sql);
    const statement = database.prepare(translated);

    if (params && params.length > 0) {
      const result = statement.run(...params);
      return { rowsAffected: result.changes };
    }

    statement.run();
    return { rowsAffected: 0 };
  });

  ipcMain.handle("db:select", (_event, sql: string, params?: unknown[]) => {
    const translated = translateParams(sql);
    const statement = database.prepare(translated);

    if (params && params.length > 0) {
      return statement.all(...params);
    }

    return statement.all();
  });
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}
```

**Important:** `better-sqlite3` treats `$1`, `$2` as **named** parameters (expecting an object like `{ 1: val }`), not positional. The `translateParams()` function converts `$1`, `$2`, ... to anonymous `?` placeholders, which work correctly with `.run(...params)` spread arguments. This translation happens transparently in the IPC layer — no SQL changes needed in the renderer.

- [ ] **Step 4: Create electron/ipc/filesystem.ts**

```typescript
import { ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

export function registerFilesystemIPC(userDataPath: string): void {
  ipcMain.handle("paths:appDataDir", () => {
    return userDataPath;
  });

  ipcMain.handle("paths:join", (_event, ...parts: string[]) => {
    return path.join(...parts);
  });

  ipcMain.handle("fs:exists", async (_event, filePath: string) => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("fs:mkdir", async (_event, dirPath: string) => {
    await fs.mkdir(dirPath, { recursive: true });
  });

  ipcMain.handle("fs:readFile", async (_event, filePath: string) => {
    const buffer = await fs.readFile(filePath);
    return new Uint8Array(buffer);
  });

  ipcMain.handle("fs:writeFile", async (_event, filePath: string, data: Uint8Array) => {
    await fs.writeFile(filePath, data);
  });

  ipcMain.handle("fs:copyFile", async (_event, src: string, dest: string) => {
    await fs.copyFile(src, dest);
  });

  ipcMain.handle("fs:readDir", async (_event, dirPath: string) => {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map((entry) => ({ name: entry.name }));
  });

  ipcMain.handle("fs:remove", async (_event, filePath: string) => {
    await fs.unlink(filePath);
  });
}
```

- [ ] **Step 5: Create electron/preload.ts**

```typescript
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  db: {
    execute(sql: string, params?: unknown[]) {
      return ipcRenderer.invoke("db:execute", sql, params);
    },
    select(sql: string, params?: unknown[]) {
      return ipcRenderer.invoke("db:select", sql, params);
    },
  },
  fs: {
    exists(path: string) {
      return ipcRenderer.invoke("fs:exists", path);
    },
    mkdir(path: string) {
      return ipcRenderer.invoke("fs:mkdir", path);
    },
    readFile(path: string): Promise<Uint8Array> {
      return ipcRenderer.invoke("fs:readFile", path);
    },
    writeFile(path: string, data: Uint8Array) {
      return ipcRenderer.invoke("fs:writeFile", path, data);
    },
    copyFile(src: string, dest: string) {
      return ipcRenderer.invoke("fs:copyFile", src, dest);
    },
    readDir(path: string) {
      return ipcRenderer.invoke("fs:readDir", path);
    },
    remove(path: string) {
      return ipcRenderer.invoke("fs:remove", path);
    },
  },
  paths: {
    appDataDir() {
      return ipcRenderer.invoke("paths:appDataDir");
    },
    join(...parts: string[]) {
      return ipcRenderer.invoke("paths:join", ...parts);
    },
  },
});
```

- [ ] **Step 6: Create electron/main.ts**

```typescript
import { app, BrowserWindow } from "electron";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { registerDatabaseIPC, closeDatabase } from "./ipc/database";
import { registerFilesystemIPC } from "./ipc/filesystem";

const isDev = !app.isPackaged;
const legacyUserDataPath = path.join(app.getPath("appData"), "app.phosphene.desktop");

mkdirSync(legacyUserDataPath, { recursive: true });
app.setPath("userData", legacyUserDataPath);

function createWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, "preload.js");

  const win = new BrowserWindow({
    title: "Phosphene",
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  return win;
}

app.whenReady().then(() => {
  const userDataPath = app.getPath("userData");

  registerDatabaseIPC(userDataPath);
  registerFilesystemIPC(userDataPath);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  closeDatabase();
});
```

- [ ] **Step 7: Build the Electron main process**

Run: `npm run build:main`
Expected: `dist-electron/main.js`, `dist-electron/preload.js`, `dist-electron/ipc/database.js`, `dist-electron/ipc/filesystem.js`, and `dist-electron/package.json` are created. (The `build:main` script was added in Task 2.)

- [ ] **Step 8: Commit**

```bash
git add electron/ package.json
git commit -m "feat: add Electron main process with IPC handlers for database and filesystem"
```

---

## Task 8: First Boot — Verify Electron Launches

**Files:**
- No source changes expected (debugging only)

- [ ] **Step 1: Start the dev environment**

Run: `npm run dev`
Expected: Vite starts on port 5173, Electron compiles and opens a window showing the React app.

- [ ] **Step 2: Check the developer console for errors**

Open DevTools in the Electron window (Cmd+Option+I).
Expected: No `@tauri-apps` import errors. The app should initialize the database, create the default "Home" workspace, and render the workspace shell.

- [ ] **Step 3: Verify basic app functionality**

Manual checklist:
- Default workspace "Home" appears
- Can create a new board
- Can draw on the canvas
- Can close and reopen the app — data persists
- Check that `~/Library/Application Support/app.phosphene.desktop/phosphene.db` exists (macOS)
- Check that `~/Library/Application Support/app.phosphene.desktop/images/` directory exists
- Check that `~/Library/Application Support/app.phosphene.desktop/backups/` directory exists with today's backup

- [ ] **Step 4: Fix any issues found, commit fixes**

If issues arise, fix them and commit:
```bash
git add -A
git commit -m "fix: resolve Electron first-boot issues"
```

---

## Task 9: Evaluate Drag-And-Drop In Electron

**Files:**
- Possibly modify: `src/components/canvas/ExcalidrawCanvas.tsx`
- Possibly create: `electron/ipc/window.ts`

- [ ] **Step 1: Test native drag-drop in Electron**

Manual test:
- Drag a PNG from Finder onto the Excalidraw canvas
- Does Excalidraw receive it as a standard HTML5 drop event with `File` objects?

**If YES (likely):** Electron's Chromium handles drag-drop natively. The remaining helper functions (`createSyntheticDropEvent`, `createDataTransfer`, `isPointInsideRect`, `getDropTarget`) in ExcalidrawCanvas.tsx are now dead code.

- [ ] **Step 2a: If native drag-drop works — clean up dead code**

Remove from `src/components/canvas/ExcalidrawCanvas.tsx`:
- `isPointInsideRect` function
- `getDropTarget` function
- `createSyntheticDropEvent` function
- `createDataTransfer` function
- `isSupportedImagePath` and `readImagePathAsFile` imports from `drop-handler` (if no longer used)

- [ ] **Step 2b: If native drag-drop does NOT work — stop and write a focused follow-up spike**

Do **not** invent a main-process drag-drop bridge inside this migration task. If Chromium still does not give Excalidraw usable `File` objects on macOS, preserve the helper functions in `ExcalidrawCanvas.tsx`, capture the exact failing event behavior in notes, and write a narrow follow-up plan for the fallback. This keeps the core migration honest and avoids baking in an unverified Electron event bridge.

- [ ] **Step 3: Run canvas tests**

Run: `npm test -- src/components/canvas/ExcalidrawCanvas.test.tsx`
Expected: All retained tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: clean up drag-drop after Electron evaluation"
```

---

## Task 10: Delete Tauri Directory And Final Cleanup

**Files:**
- Delete: `src-tauri/`
- Modify: `package.json` (remove any lingering Tauri references)

- [ ] **Step 1: Search for any remaining Tauri references**

Run: `rg -n "tauri|@tauri-apps|__TAURI__" src electron package.json vite.config.ts README.md`
Expected: Zero matches (or only in this plan file / historical docs).

- [ ] **Step 2: Delete src-tauri/**

```bash
rm -rf src-tauri/
```

- [ ] **Step 3: Clean up package.json**

Remove any remaining Tauri-related config. Verify `"main"` points to `dist-electron/main.js`.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 5: Verify the Electron app still works**

Run: `npm run dev`
Manual checklist:
- App launches
- Existing data persists from previous sessions
- Canvas draw + save works
- Image drop works
- Backup file exists

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove Tauri backend and finalize Electron migration"
```

---

## Task 11: Package For macOS

**Files:**
- Modify: `package.json` (if electron-builder config needs tuning)

- [ ] **Step 1: Build the production package**

Run: `npm run build:electron`
Expected: A `.app` bundle appears in `release/mac-arm64/` (or `release/mac/`).

- [ ] **Step 2: Test the packaged app**

Launch the built `.app` directly.
Manual checklist:
- App opens without code-signing errors (may need to right-click > Open on first launch)
- Database creates/opens correctly
- Canvas persistence works
- Image extraction works
- Backup runs

- [ ] **Step 3: Note any packaging adjustments needed**

Common issues:
- `better-sqlite3` native module needs to be rebuilt for the Electron version — `electron-builder` usually handles this via `electron-rebuild`, but verify.
- If native module issues occur, add to `package.json`:

```json
{
  "build": {
    "npmRebuild": true
  }
}
```

- [ ] **Step 4: Commit any packaging fixes**

```bash
git add -A
git commit -m "chore: finalize Electron packaging for macOS"
```

---

## Task 12: Final Regression Pass

**Files:**
- No planned source changes unless regressions are found.

- [ ] **Step 1: Run full automated test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Run full manual regression checklist**

Checklist:
- [ ] First launch creates app data directories
- [ ] Default "Home" workspace exists
- [ ] Create a new workspace
- [ ] Create a new board
- [ ] Draw on canvas
- [ ] Close and relaunch — board content persisted
- [ ] Drop an image from Finder onto canvas
- [ ] Image reloads after restart
- [ ] Backup file exists in `~/Library/Application Support/app.phosphene.desktop/backups/`
- [ ] Multiple workspaces with separate boards work
- [ ] Keyboard shortcuts work (Cmd+1-9 for workspaces, etc.)
- [ ] Panel resizing works
- [ ] Board rename works
- [ ] Board delete works

- [ ] **Step 3: Document any behavioral deltas from the Tauri build**

Record in a `MIGRATION-NOTES.md` if anything behaves differently:
- Startup time
- Memory usage
- Rendering differences
- Drag-drop behavior changes

---

## Recommended Execution Order

1. Create fresh repo copy (manual)
2. Install Electron dependencies, update package.json
3. Simplify Vite config
4. Define desktop API types and renderer adapter
5. Migrate all renderer modules to desktop adapter
6. Update all tests to mock desktop adapter
7. Create Electron main process (main.ts, preload.ts, IPC handlers)
8. First boot verification
9. Evaluate and clean up drag-drop
10. Delete Tauri directory
11. Package for macOS
12. Final regression pass

## Risks To Watch

- **`better-sqlite3` native compilation:** Requires matching the Electron version's Node ABI. `electron-builder` handles this, but watch for build failures on first attempt.
- **Root `type: module` vs CommonJS Electron build:** The renderer repo is ESM, but the Electron main/preload build in this plan is CommonJS. The nested `electron/package.json` copied to `dist-electron/package.json` keeps that boundary explicit.
- **`$1` parameter syntax:** The existing SQL uses `$1`, `$2` positional placeholders. `better-sqlite3` treats these as named params, so the IPC handler translates them to `?` anonymous placeholders. The `translateParams()` function handles this — but verify complex queries with multiple params in Task 8.
- **Legacy Tauri app-data path preservation:** Electron would normally use `~/Library/Application Support/Phosphene`, but this plan overrides `userData` to `~/Library/Application Support/app.phosphene.desktop` so the current Tauri data continues to work in place. Verify the override before first boot.
- **Image path portability:** The Tauri version used `BaseDirectory.AppData` relative paths. The Electron version resolves absolute paths through the preserved `userData` directory but still stores `phosphene-file://images/...` relative references in board JSON, so existing databases should work without rewriting stored file references.
- **Drag-drop behavior:** Excalidraw may handle Chromium's native drop events differently than it handled Tauri's synthetic ones. Test thoroughly in Task 9.
- **Electron security:** `contextIsolation: true` and `nodeIntegration: false` are set, but verify that no renderer code accidentally bypasses the preload boundary.

## Decision Log

- **Desktop adapter pattern over direct imports:** All platform calls go through `src/platform/desktop-api.ts`. This makes future platform changes (or even a web version) trivial — swap the adapter, not 6 files.
- **Synchronous `better-sqlite3` over async alternatives:** `better-sqlite3` is the most battle-tested SQLite binding for Electron. It's synchronous in the main process but exposed async via IPC, matching the existing renderer API shape.
- **Preserve the legacy Tauri data directory:** The Electron build deliberately overrides `userData` to the current Tauri directory `app.phosphene.desktop` so the existing database, backups, and extracted images keep working without a one-off migration script.
- **Use a nested CommonJS package for Electron output:** The repo root stays ESM for Vite, while `dist-electron/package.json` marks the Electron build as CommonJS so `main.js` and `preload.js` launch cleanly under Electron.
- **Delete Tauri drag-drop first, evaluate second:** Rather than porting the Tauri webview workaround, remove it and test Electron's native behavior. The workaround existed because WebKit sandboxes drag-drop — Chromium doesn't.
- **No `electron-vite` or `vite-plugin-electron`:** These add complexity. A simple `concurrently` + `wait-on` dev setup and manual `tsc` build for the electron directory is simpler and more debuggable.
- **Separate repo, not a branch:** The Tauri and Electron versions will diverge immediately. A branch implies eventual merge. A separate repo is honest about the relationship.
