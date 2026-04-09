# Phosphene Electron Error-Handling and Resilience Review

Date: 2026-04-08

## Scope and verification

- Reviewed the Electron main process, preload bridge, renderer-side desktop API wrapper, persistence hooks, SQLite access helpers, filesystem/image/backup helpers, and packaging config.
- Verified current repo health with:
  - `npm test` -> pass (`31` files, `169` tests). The run prints intentional `Excalidraw crashed` errors from the render-boundary tests, but the suite passes.
  - `npm run build` -> pass.
  - `npm run build:main` -> pass.
- Packaged runtime behavior was not launched from a built installer/app bundle in this review, so production-only observations below are based on code-path analysis unless noted otherwise.

## Executive summary

The highest-risk resilience problems are:

1. Main-process bootstrap and window load failures are largely unhandled, so production failures can degrade into a blank window or a hard startup failure.
2. Renderer startup/preload failures leave the UI stuck on an infinite loading screen.
3. Renderer-side writes treat zero-row SQL updates as success, so failed saves can be reported as saved.
4. Debounced board/layout persistence is not coordinated with quit/restart, so the latest changes can be lost on shutdown.
5. The backup path is not SQLite WAL-safe, so backups can be stale or incomplete even when copy succeeds.

## Findings

### 1. Unhandled main-process bootstrap and page-load failures can crash startup or leave a blank app

- Importance: 9/10
- Locations:
  - `electron/main.ts:8-11`
  - `electron/main.ts:13-35`
  - `electron/main.ts:38-51`
  - `electron/ipc/database.ts:7-15`
- Failure mode:
  - `mkdirSync(legacyUserDataPath, { recursive: true })` runs at module load. A permission error here aborts startup before Electron can present any UI.
  - `registerDatabaseIPC(userDataPath)` eagerly opens SQLite via `getDatabase()`. If the database cannot open, the app never reaches `createWindow()`.
  - `win.loadURL()` and `win.loadFile()` are invoked but never awaited or observed. Missing `dist/index.html`, a broken dev server, or a preload path failure can degrade into a blank window with no explicit recovery path.
  - There is no `catch` on `app.whenReady().then(...)`, no `process.on("unhandledRejection")`, no `process.on("uncaughtException")`, and no `webContents` failure hooks.
- Why this matters:
  - These are exactly the failures that tend to appear only on user machines: bad permissions, missing packaged assets, corrupted local DBs, and first-run filesystem issues.
- Minimal remediation:
  - Replace the current `app.whenReady().then(...)` with an `async bootstrap()` and call `void app.whenReady().then(bootstrap).catch(...)`.
  - Move the user-data directory creation inside `bootstrap()` and wrap it in `try/catch`.
  - Make `createWindow()` `async` and `await win.loadURL(...)` / `await win.loadFile(...)`.
  - Add `win.webContents.on("did-fail-load", ...)` and `app.on("render-process-gone", ...)` handlers that either show a small error page or present a dialog with retry/relaunch instructions.
  - Log a normalized startup error once, with the failing phase (`userData`, `db-open`, `window-load`) so renderer-side debugging has something actionable.

### 2. Preload or renderer initialization failures leave the UI stuck on an infinite loading screen

- Importance: 8/10
- Locations:
  - `src/platform/desktop-api.ts:1-5`
  - `src/lib/database.ts:11-24`
  - `src/components/AppShell.tsx:24-45`
  - `src/components/AppShell.tsx:47-53`
- Failure mode:
  - If the preload script does not expose `window.desktop`, `getDesktop()` throws `Desktop API not available`.
  - `AppShell` catches initialization errors, but only logs them through `reportError("Failed to initialize app", error)`.
  - `initialized` is never set to `true` on failure, and there is no parallel `initializationError` state, so the app remains on `Loading Phosphene...` forever.
- Why this matters:
  - A preload mismatch, database init failure, or storage directory failure is converted into a dead-end spinner instead of a recoverable state.
- Minimal remediation:
  - Add an explicit `initializationError` state to the store or `AppShell`.
  - On init failure, render a dedicated failure panel with:
    - The phase that failed
    - A retry button that re-runs `init()`
    - A short actionable message (`Check filesystem permissions`, `Restart after reinstall`, etc.)
  - Keep the spinner only for active initialization, not terminal failure.

### 3. IPC handlers accept unvalidated payloads, so contract drift fails deep in the main process with low-fidelity errors

- Importance: 6/10
- Locations:
  - `electron/preload.ts:3-43`
  - `electron/ipc/database.ts:24-57`
  - `electron/ipc/filesystem.ts:5-47`
  - `src/types/desktop.d.ts:1-29`
- Failure mode:
  - `ipcRenderer.invoke()` sends raw values across the process boundary with no schema checks.
  - `db:execute` / `db:select` assume `sql` is a string and `params` is an array. A malformed call fails later in `sql.replace(...)` or `statement.run(...)`.
  - The filesystem channels assume string paths and a valid `Uint8Array`.
  - `DesktopDatabase.select<T>` is typed as `Promise<T>`, but the IPC contract actually returns row collections for current callers. That mismatch makes renderer/preload drift easier to miss in TypeScript.
- Why this matters:
  - Process-boundary bugs become generic promise rejections instead of explicit contract failures, which makes production debugging much harder.
- Minimal remediation:
  - Validate the IPC arguments at the top of each handler:
    - `typeof sql === "string"`
    - `params === undefined || Array.isArray(params)`
    - `typeof filePath === "string"`
    - `data instanceof Uint8Array || ArrayBuffer.isView(data)`
  - Throw normalized errors such as `new Error("Invalid db:execute payload: expected (string, array?)")`.
  - Tighten the renderer contract type so `select` returns `Promise<T[]>` where appropriate, or add distinct helpers for `selectOne` vs `selectMany`.

### 4. `fs:exists` swallows permission and path errors by returning `false`, which misclassifies real failures as “missing files”

- Importance: 7/10
- Locations:
  - `electron/ipc/filesystem.ts:14-20`
  - `src/lib/file-storage.ts:8-13`
  - `src/lib/backup.ts:11-23`
  - `src/lib/image-extraction.ts:73-76`
- Failure mode:
  - `fs:exists` catches every failure from `fs.access()` and returns `false`.
  - `EACCES`, `EPERM`, malformed paths, and transient filesystem errors are all reported as “does not exist”.
  - Callers then take the wrong branch:
    - `ensureStorageDirectories()` may try to create a directory that exists but is inaccessible.
    - `injectImagesFromFilesystem()` logs `Image file not found` when the file may actually be permission-blocked.
    - `runDailyBackup()` silently skips backing up an inaccessible DB as if it were absent.
- Minimal remediation:
  - Only collapse `ENOENT` / `ENOTDIR` into `false`.
  - Re-throw all other `NodeJS.ErrnoException` values.
  - Update callers to distinguish “not found” from “permission denied” in log/output text.

### 5. Zero-row SQL updates are treated as success, so failed saves can be reported as saved

- Importance: 9/10
- Locations:
  - `electron/ipc/database.ts:41-45`
  - `src/lib/database.ts:4-6`
  - `src/lib/board-operations.ts:92-122`
  - `src/lib/workspace-operations.ts:77-127`
  - `src/hooks/use-board-persistence.ts:321-345`
- Failure mode:
  - The main-process DB IPC already returns `{ rowsAffected }`.
  - Most renderer-side write helpers discard that value and return `void`.
  - `useBoardPersistence` marks a board `saved` as soon as `saveBoardCanvasData()` resolves, even if the underlying `UPDATE ... WHERE id = $1 AND deleted_at IS NULL` touched zero rows.
  - The same problem exists for rename/delete/layout persistence helpers.
- Why this matters:
  - This is a direct “failed save can incorrectly report success” path.
  - A stale `boardId`, deleted record, or workspace race can resolve “successfully” while persisting nothing.
- Minimal remediation:
  - Preserve the DB result shape in the write helpers:
    - `saveBoardCanvasData`
    - `renameBoard`
    - `deleteBoard`
    - `saveWorkspaceLayout`
    - `renameWorkspace`
    - `updateWorkspaceIcon`
  - Throw if `rowsAffected !== 1` for single-record mutations.
  - Use the thrown error to keep `saveStatus` as `unsaved` and show an actionable message (`Board no longer exists`, `Workspace was deleted`, etc.).

### 6. Debounced board saves are fire-and-forget during cleanup, so quit/restart can lose the most recent edit

- Importance: 9/10
- Locations:
  - `src/hooks/use-board-persistence.ts:177-187`
  - `src/hooks/use-board-persistence.ts:312-347`
  - `electron/main.ts:59-60`
- Failure mode:
  - Cleanup calls `flushPendingSave()`, but that just invokes `pendingSave?.flush()` without awaiting completion.
  - `flushSave()` starts an async IIFE and immediately returns.
  - On `will-quit`, the main process closes the DB immediately.
  - There is no renderer-to-main shutdown handshake, no “save in progress” barrier, and no last-chance flush before window destruction.
- Why this matters:
  - The latest board change can be lost if the app is quit during the debounce window or while the async image-extraction/DB write is in flight.
  - This is most likely during restart, crash recovery, or a user closing the app immediately after making a change.
- Minimal remediation:
  - Track pending save promises centrally instead of firing them with `void`.
  - Add a renderer-exposed `flushAllSaves()` path and call it from a `beforeunload` handler and/or an app quit flow.
  - In the main process, delay `closeDatabase()` until either:
    - The renderer acknowledges save completion, or
    - A short timeout expires and the UI has warned the user.
  - If a save is still pending during quit, present a “Saving changes…” blocker rather than closing immediately.

### 7. Workspace layout persistence has no flush/cancel path, so panel and board selection changes can be lost on fast switch or shutdown

- Importance: 7/10
- Locations:
  - `src/lib/debounce.ts:1-13`
  - `src/hooks/use-workspace-layout.ts:33-45`
  - `src/hooks/use-workspace-layout.ts:96-127`
- Failure mode:
  - The debounce helper only returns a callable wrapper. It cannot be flushed or canceled.
  - `useWorkspaceLayout` uses it for panel-size and active-board persistence.
  - Unlike `useBoardPersistence`, the hook has no cleanup that flushes pending layout writes.
- Why this matters:
  - Changing the active board or panel layout and then closing the app within `500ms` can silently drop the change.
- Minimal remediation:
  - Extend `debounce()` to return `flush()` and `cancel()` controls.
  - In `useWorkspaceLayout`, flush the pending layout save on unmount/workspace switch.
  - Consider reusing the same shutdown coordination path proposed for board saves so both persistence channels behave consistently.

### 8. The daily backup path is not WAL-safe and can produce stale or incomplete SQLite backups

- Importance: 8/10
- Locations:
  - `electron/ipc/database.ts:12`
  - `src/lib/backup.ts:5-30`
- Failure mode:
  - The database is explicitly forced into WAL mode.
  - `runDailyBackup()` copies only `phosphene.db`.
  - In WAL mode, recent committed changes may still live in `phosphene.db-wal`; copying only the base DB file does not guarantee a restorable point-in-time backup while the app is live.
- Why this matters:
  - Backup success can be reported even though the backup is missing the latest data or is not safely restorable.
- Minimal remediation:
  - Prefer a main-process backup implementation that uses SQLite itself:
    - `PRAGMA wal_checkpoint(TRUNCATE)` before copy, then copy the DB
    - Or `VACUUM INTO`
    - Or a `better-sqlite3` backup API if available in your version
  - If staying with file copies, checkpoint first and copy the `.db`, `.db-wal`, and `.db-shm` files as a set.

### 9. Multi-step database mutations are not transactional, so concurrent operations can race or leave partial state

- Importance: 6/10
- Locations:
  - `src/lib/board-operations.ts:72-89`
  - `src/lib/workspace-operations.ts:58-75`
  - `src/lib/workspace-operations.ts:111-120`
- Failure mode:
  - `createBoard()` and `createWorkspace()` compute `MAX(position) + 1` and then insert in separate statements.
  - `reorderWorkspaces()` updates each row in a loop.
  - With overlapping creates or multiple windows, positions can collide. If a reorder fails midway, the workspace order is partially updated.
- Why this matters:
  - The current app is single-window by default, but Electron can open additional windows, and keyboard/UI actions can overlap enough to expose this in practice.
- Minimal remediation:
  - Execute these units inside a single SQLite transaction.
  - If you want a minimal drop-in path, add dedicated main-process IPC handlers for `createBoard`, `createWorkspace`, and `reorderWorkspaces` so the transaction can live beside `better-sqlite3`.
  - Consider adding uniqueness constraints on position columns if ordering correctness matters strictly.

### 10. Most recoverable failures are only logged to the console, so the UI rarely offers retry or actionable recovery

- Importance: 7/10
- Locations:
  - `src/hooks/use-error-reporter.ts:3-10`
  - `src/components/AppShell.tsx:39-40`
  - `src/components/sidebar/BoardList.tsx:114-116`
  - `src/components/sidebar/BoardList.tsx:171-172`
  - `src/components/sidebar/BoardList.tsx:203-204`
  - `src/components/workspace/WorkspaceTabBar.tsx:83-87`
  - `src/components/workspace/WorkspaceTabBar.tsx:109-110`
  - `src/components/workspace/WorkspaceTabBar.tsx:127-128`
  - `src/components/workspace/WorkspaceTabBar.tsx:142-143`
  - `src/hooks/use-keyboard-shortcuts.ts:65-86`
  - `src/components/canvas/CanvasPanel.tsx:128-135`
- Failure mode:
  - `useErrorReporter()` is a thin `console.error()` wrapper.
  - Most load/create/delete/rename/layout failures stop there.
  - Only the canvas-load path renders a visible error state.
  - Some error paths also leave stale state behind:
    - `BoardList` initial-load failure clears the visible list but does not explicitly clear active board state.
    - Workspace and keyboard-shortcut failures do not tell the user what to do next.
- Minimal remediation:
  - Replace `useErrorReporter` with a small shared error channel:
    - toast/banner for transient failures
    - persistent alert for startup/load failures
    - optional retry callback for reload actions
  - Keep console logging, but always pair user-relevant failures with visible UI feedback.
  - Reuse the canvas error-card pattern for workspaces/boards/startup rather than leaving failures invisible.

## Packaged-app resilience notes

- Verified good:
  - `vite.config.ts:5-24` uses `base: "./"`, which is the right direction for `file://` packaged execution.
  - `package.json:15-18` includes both `dist/**/*` and `dist-electron/**/*` in the packaged files set.
  - `npm run build` and `npm run build:main` both succeed in this checkout.
- Production-only risk that remains:
  - `electron/main.ts:29-32` does not await or monitor `loadURL/loadFile`, so packaged asset mistakes still degrade badly at runtime.

## Unable to verify from code alone

### A. Packaged runtime smoke behavior across supported OS targets

- Status: Unable to verify in this review
- Why:
  - I did not build and launch a signed/notarized packaged artifact from `electron-builder`.
- Evidence that would prove it:
  - `npm run build:electron`
  - Launch the generated app bundle/installer on each supported target
  - Confirm first-run success for:
    - preload exposure
    - SQLite open/init
    - images/backups directory creation
    - file:// renderer asset loading

### B. Shutdown save durability under real window-close timing

- Status: Unable to verify at runtime; code strongly suggests risk
- Why:
  - There is no end-to-end test that edits a board, closes the app during the debounce window, reopens it, and checks persistence.
- Evidence that would prove or disprove it:
  - An integration test or manual smoke test that:
    - edits a board
    - closes the app within `< 500ms`
    - reopens the app
    - confirms whether the last edit survived

## Suggested fix order

1. Fix the false-success write paths by honoring `rowsAffected`.
2. Add startup/load failure handling in `electron/main.ts` and `AppShell.tsx`.
3. Add shutdown coordination for pending board/layout saves.
4. Make backups WAL-safe.
5. Tighten IPC payload validation and stop swallowing `fs:exists` permission errors.
6. Add transactional wrappers for multi-step ordering mutations.
