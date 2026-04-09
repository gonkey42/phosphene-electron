# Electron Resilience Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Phosphene’s Electron startup, IPC, persistence, filesystem, shutdown, and user-facing recovery paths so failures are explicit, actionable, and do not incorrectly report success.

**Architecture:** Keep the current Electron shape: thin preload bridge, main-process `better-sqlite3`, renderer-side hooks and Zustand store. Implement this as a phased hardening pass: first make failures observable and writes truthful, then make shutdown/backup durable, then tighten IPC validation and user-facing recovery, and finally close transactional gaps.

**Tech Stack:** Electron, React 18, Zustand, TypeScript, `better-sqlite3`, Vitest, Testing Library

---

## Summary

- Deliver this as a phased implementation, not a broad rewrite.
- Keep SQL-over-IPC for this pass; harden it instead of replacing it.
- Add a small shared error UX for startup and operation failures, plus precise logging in the main process.
- Make renderer-side write helpers honor `rowsAffected`, so zero-row updates fail loudly instead of reporting success.
- Add explicit save-flush coordination for board and workspace layout persistence before quit/restart.
- Make backups WAL-safe from the main process.
- Add transactional IPC only where multi-step mutations currently race.

## Key interface and behavior changes

- Add a renderer-visible app initialization error state so the app can render a retryable failure screen instead of an infinite spinner.
- Add a small shared error channel in the renderer for transient and persistent errors:
  - transient banner/toast for reload/create/delete/rename failures
  - persistent startup screen for bootstrap/init failures
- Preserve DB mutation results through the renderer data layer:
  - single-record mutations must throw when `rowsAffected !== 1`
- Add a coordinated “flush pending saves” path available before unload/quit.
- Add new focused main-process IPC only where the current generic SQL bridge is insufficient:
  - save-flush coordination
  - WAL-safe backup
  - transactional multi-step board/workspace ordering mutations
- Keep existing preload namespaces (`db`, `fs`, `paths`) stable; add new capabilities under a new namespace such as `lifecycle` or `app` rather than overloading unrelated ones.

## Implementation tasks

### Task 1: Startup and bootstrap failure handling

**Files:**
- Modify: `electron/main.ts`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/stores/app-store.ts`
- Test: `src/components/AppShell.test.tsx`

- [ ] **Step 1: Add failing tests for startup failure rendering**
  
  Add tests that cover:
  - `getDb()` rejection during init
  - preload/desktop API init failure surfacing as a visible error state
  - retry action re-running init after a failure

  Use the existing `AppShell` test style and assert:
  - loading UI disappears on terminal init failure
  - an alert or failure panel is rendered
  - retry calls `getDb`, `ensureStorageDirectories`, and `listWorkspaces` again

- [ ] **Step 2: Introduce explicit app initialization state**
  
  Update the store so initialization has a small explicit state machine rather than a single boolean:
  - `status: "idle" | "loading" | "ready" | "error"`
  - `initializationError: { title: string; detail: string } | null`

  Keep existing consumers working by either:
  - replacing `initialized` cleanly, or
  - deriving it from `status === "ready"` during migration

- [ ] **Step 3: Refactor renderer init flow to surface retryable errors**
  
  In `AppShell`:
  - set init status to `loading` before work begins
  - on success set workspaces, active workspace, clear errors, mark `ready`
  - on failure set a structured error and mark `error`
  - render:
    - loading screen only while actively loading
    - failure panel with retry button on error
    - normal shell on ready

  The failure panel should include:
  - a short title
  - the failing message
  - a retry action
  - actionable copy such as “Check filesystem permissions or reinstall if the preload script is missing.”

- [ ] **Step 4: Harden main-process bootstrap**
  
  In `electron/main.ts`:
  - move user-data directory creation inside an `async bootstrap()`
  - wrap:
    - `mkdirSync` equivalent
    - `registerDatabaseIPC`
    - `registerFilesystemIPC`
    - window creation and page load
  - call `void app.whenReady().then(bootstrap).catch(...)`
  - make `createWindow()` async and await `loadURL` / `loadFile`
  - add `did-fail-load` logging with URL, error code, and description
  - add `render-process-gone` logging

  On startup failure:
  - log one normalized error with a clear phase tag
  - avoid silent exit or blank window behavior

- [ ] **Step 5: Run focused tests**
  
  Run:
  - `npm test -- src/components/AppShell.test.tsx`

  Expected:
  - new failure/retry tests pass
  - existing AppShell tests still pass

### Task 2: Truthful DB mutations and save-state correctness

**Files:**
- Modify: `src/lib/database.ts`
- Modify: `src/lib/board-operations.ts`
- Modify: `src/lib/workspace-operations.ts`
- Modify: `src/hooks/use-board-persistence.ts`
- Test: `src/hooks/use-board-persistence.test.tsx`
- Test: `src/lib/board-operations.test.ts`
- Test: `src/lib/workspace-operations.test.ts`

- [ ] **Step 1: Add failing tests for zero-row mutation handling**
  
  Add tests that prove:
  - `saveBoardCanvasData()` throws when `rowsAffected === 0`
  - `renameBoard()`, `deleteBoard()`, `saveWorkspaceLayout()`, `renameWorkspace()`, and `updateWorkspaceIcon()` do the same
  - `useBoardPersistence` stays `unsaved` when the save helper rejects due to zero affected rows

- [ ] **Step 2: Preserve mutation results through the renderer data layer**
  
  In the shared DB wrapper type, keep mutation return types explicit:
  - `execute()` already returns `{ rowsAffected: number }`
  - update write helpers to return or inspect that result instead of discarding it

  For single-record mutations:
  - throw an error like:
    - `Board save affected 0 rows`
    - `Workspace layout save affected 0 rows`
  - use board/workspace-specific wording so the UI can show actionable messages later

- [ ] **Step 3: Update board persistence to treat rejected saves as real failures**
  
  In `useBoardPersistence`:
  - keep `saveStatus` as `unsaved` on any rejected save
  - do not mark `saved` unless the mutation succeeded and matched the latest save token/session
  - preserve existing protection against stale in-flight saves overwriting newer state

- [ ] **Step 4: Keep stale-record failures visible**
  
  When a save helper throws because the board or workspace no longer exists:
  - log with context
  - route the error to the new shared error channel
  - keep the UI in a recoverable state rather than silently pretending save succeeded

- [ ] **Step 5: Run focused tests**
  
  Run:
  - `npm test -- src/hooks/use-board-persistence.test.tsx src/lib/board-operations.test.ts src/lib/workspace-operations.test.ts`

  Expected:
  - save-status tests cover both success and zero-row failure paths
  - existing debounce/session tests still pass

### Task 3: Durable pending-save flush on board switch, unmount, and app quit

**Files:**
- Modify: `src/lib/debounce.ts`
- Modify: `src/hooks/use-board-persistence.ts`
- Modify: `src/hooks/use-workspace-layout.ts`
- Modify: `electron/preload.ts`
- Modify: `src/platform/desktop-api.ts`
- Modify: `electron/main.ts`
- Add/Modify tests: `src/hooks/use-board-persistence.test.tsx`, `src/hooks/use-workspace-layout.test.tsx`

- [ ] **Step 1: Add failing tests for shutdown-time flush behavior**
  
  Add tests that prove:
  - pending workspace layout saves flush on unmount/workspace switch
  - board persistence exposes a real pending save promise rather than only fire-and-forget timing
  - latest change survives a forced flush path
  - stale in-flight completions still do not regress state

- [ ] **Step 2: Upgrade debounce to support `flush()` and `cancel()`**
  
  Replace the current simple debounce helper with one that returns:
  - callable debounced function
  - `flush()`
  - `cancel()`

  Keep the API small and synchronous where possible so hooks can use it without major refactors.

- [ ] **Step 3: Refactor workspace layout persistence to flush on cleanup**
  
  In `useWorkspaceLayout`:
  - use the upgraded debounce helper
  - flush pending saves on unmount and workspace change
  - preserve current optimistic local layout updates

- [ ] **Step 4: Refactor board persistence to track in-flight save promises**
  
  In `useBoardPersistence`:
  - replace fire-and-forget save dispatch with tracked promises
  - keep one authoritative pending save handle for the current board session
  - expose an internal `flushPendingSave(): Promise<void>` path that resolves when:
    - debounce timer is cleared
    - extraction and DB write finish
    - latest save token bookkeeping is applied

- [ ] **Step 5: Add quit-time coordination**
  
  Add a new preload/main bridge for lifecycle coordination, for example:
  - renderer side: `app.flushPendingWork()` or `lifecycle.flushPendingSaves()`
  - main side: quit waits briefly for renderer acknowledgment before closing the DB

  Implementation details:
  - register a `beforeunload` listener in the renderer that calls the flush path
  - in `electron/main.ts`, on quit:
    - ask all windows to flush
    - wait for completion or a short timeout
    - only then call `closeDatabase()`

  Do not block forever; use a bounded timeout and log timeout failures clearly.

- [ ] **Step 6: Run focused tests**
  
  Run:
  - `npm test -- src/hooks/use-board-persistence.test.tsx src/hooks/use-workspace-layout.test.tsx`

  Expected:
  - new flush tests pass
  - existing debounce and board-switch coverage still passes

### Task 4: WAL-safe backup and filesystem error classification

**Files:**
- Modify: `electron/ipc/database.ts`
- Modify: `electron/ipc/filesystem.ts`
- Modify: `src/lib/backup.ts`
- Modify: `src/lib/file-storage.ts`
- Modify: `src/lib/image-extraction.ts`
- Test: `electron/ipc/database.test.ts`
- Test: `src/lib/backup.test.ts`
- Add tests for filesystem classification where appropriate

- [ ] **Step 1: Add failing tests for WAL-safe backup path**
  
  Cover:
  - backup no longer relies on copying only `phosphene.db` while WAL is active
  - backup failures are surfaced with precise cause
  - old backups are still cleaned correctly

- [ ] **Step 2: Move backup correctness into the main process**
  
  Add a focused DB IPC handler for backup, instead of using generic filesystem copy from the renderer.

  Recommended behavior:
  - run a checkpoint before copying or use a SQLite-native backup strategy
  - if using copy-based backup, copy the DB-related files as a consistent set
  - return a structured result indicating created/skipped/failure

- [ ] **Step 3: Tighten `fs:exists` classification**
  
  In `electron/ipc/filesystem.ts`:
  - return `false` only for `ENOENT`/`ENOTDIR`
  - rethrow `EACCES`, `EPERM`, and other unexpected errors

- [ ] **Step 4: Update renderer callers to react correctly**
  
  In:
  - `ensureStorageDirectories`
  - `runDailyBackup`
  - `injectImagesFromFilesystem`

  distinguish:
  - missing path
  - inaccessible path
  - unexpected read/write failure

  Keep fallback behavior where appropriate, but stop mislabeling permission issues as “not found.”

- [ ] **Step 5: Run focused tests**
  
  Run:
  - `npm test -- electron/ipc/database.test.ts src/lib/backup.test.ts src/lib/file-storage.test.ts src/lib/image-extraction.test.ts`

  Expected:
  - backup tests enforce WAL-safe behavior
  - permission-classification tests prove non-ENOENT errors are not swallowed

### Task 5: IPC payload validation and renderer contract tightening

**Files:**
- Modify: `electron/ipc/database.ts`
- Modify: `electron/ipc/filesystem.ts`
- Modify: `electron/preload.ts`
- Modify: `src/platform/desktop-api.ts`
- Modify: `src/types/desktop.d.ts`
- Test: `electron/ipc/database.test.ts`
- Add tests for filesystem IPC validation

- [ ] **Step 1: Add failing tests for malformed IPC payloads**
  
  Cover:
  - non-string SQL
  - non-array params
  - non-string file paths
  - invalid binary payloads to `fs:writeFile`
  - normalized error messages are returned to the renderer

- [ ] **Step 2: Validate arguments at IPC boundaries**
  
  In each handler:
  - reject malformed payloads immediately
  - throw explicit contract errors with channel names included
  - avoid letting bad payloads fail later in `replace`, `prepare`, `run`, or `fs` internals

- [ ] **Step 3: Tighten renderer-side typings**
  
  Fix the desktop API types so they match actual usage:
  - keep mutation results explicit
  - make `select` return collection-shaped results where that is the real contract
  - avoid generic typings that imply unsafe shapes

- [ ] **Step 4: Run focused tests**
  
  Run:
  - `npm test -- electron/ipc/database.test.ts`

  Expected:
  - payload validation tests pass
  - existing parameter translation behavior still passes

### Task 6: Shared error UX for recoverable operations

**Files:**
- Modify: `src/hooks/use-error-reporter.ts`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/components/sidebar/BoardList.tsx`
- Modify: `src/components/workspace/WorkspaceTabBar.tsx`
- Modify: `src/hooks/use-keyboard-shortcuts.ts`
- Optionally add a small shared component/hook under `src/components` or `src/hooks`
- Add tests alongside the affected components/hooks

- [ ] **Step 1: Add failing tests for visible recovery messaging**
  
  Cover:
  - board/workspace reload failures show visible, dismissible feedback
  - keyboard shortcut create failures are visible to users
  - startup failure uses the persistent error panel from Task 1
  - canvas-load errors remain intact

- [ ] **Step 2: Replace console-only error reporting with a small shared channel**
  
  Implement a lightweight mechanism that supports:
  - persistent startup failure state
  - transient operation errors
  - optional retry callbacks for reload operations

  Keep it intentionally small for this pass; do not build a large notification framework.

- [ ] **Step 3: Route existing recoverable failures through the shared channel**
  
  Update:
  - `BoardList`
  - `WorkspaceTabBar`
  - `useKeyboardShortcuts`
  - `AppShell`

  so failures both log and surface visible UI.

- [ ] **Step 4: Preserve recoverability**
  
  For operation failures:
  - do not leave the app in a misleading success state
  - keep controls usable after the error
  - ensure reload actions can be retried without restarting

- [ ] **Step 5: Run focused tests**
  
  Run:
  - `npm test -- src/components/AppShell.test.tsx src/components/sidebar/BoardList.test.tsx src/components/workspace/WorkspaceTabBar.test.tsx`

  Expected:
  - visible error UX is covered
  - existing interaction flows still pass

### Task 7: Transactional multi-step mutations for ordering-sensitive operations

**Files:**
- Modify: `electron/ipc/database.ts` or add focused main-process mutation handlers near it
- Modify: `electron/preload.ts`
- Modify: `src/platform/desktop-api.ts`
- Modify: `src/lib/board-operations.ts`
- Modify: `src/lib/workspace-operations.ts`
- Test: `src/lib/board-operations.test.ts`
- Test: `src/lib/workspace-operations.test.ts`

- [ ] **Step 1: Add failing tests for transactional mutation units**
  
  Cover:
  - board creation computes and inserts position atomically
  - workspace creation computes and inserts position atomically
  - workspace reorder does not leave partial updates if one statement fails

- [ ] **Step 2: Add focused transactional handlers**
  
  Do not try to make the generic SQL channel magically transactional from the renderer. Instead add focused handlers for:
  - `createBoard`
  - `createWorkspace`
  - `reorderWorkspaces`

  Implement them in the main process using one SQLite transaction per logical unit.

- [ ] **Step 3: Route renderer operations through the focused handlers**
  
  Keep the existing higher-level `board-operations` and `workspace-operations` interfaces stable from the renderer point of view, but have them call the new focused IPC paths for these mutation units.

- [ ] **Step 4: Run focused tests**
  
  Run:
  - `npm test -- src/lib/board-operations.test.ts src/lib/workspace-operations.test.ts`

  Expected:
  - atomicity expectations are covered
  - existing creation/reorder behavior remains intact

### Task 8: Final regression pass and packaged-path verification checks

**Files:**
- No planned code changes unless regressions are found
- Reuse existing tests plus any new ones added above

- [ ] **Step 1: Run the full suite**
  
  Run:
  - `npm test`

  Expected:
  - all existing tests and new hardening tests pass

- [ ] **Step 2: Run build verification**
  
  Run:
  - `npm run build`
  - `npm run build:main`

  Expected:
  - both succeed with no type errors
  - preload and renderer contracts compile cleanly

- [ ] **Step 3: Perform manual packaged-readiness smoke checklist**
  
  From the built app shape, verify:
  - renderer still uses relative assets for `file://`
  - preload is still referenced correctly
  - startup failure paths have explicit logging
  - no new IPC namespace or type drift remains untested

## Test plan

- Startup/bootstrap:
  - init success
  - DB init failure
  - preload API missing
  - retry after failure
  - page-load failure logging path
- Persistence truthfulness:
  - zero-row board/workspace mutations throw
  - save indicator never flips to `saved` on failed writes
  - stale in-flight saves cannot override newer state
- Shutdown durability:
  - board pending save flush on board switch and unmount
  - layout pending save flush on cleanup
  - lifecycle flush resolves before DB close or times out cleanly
- Filesystem/backup:
  - permission errors are not reported as “not found”
  - backup path is WAL-safe
  - missing image path fallback still works
- IPC:
  - malformed payloads fail early with normalized messages
  - typed contracts match actual return shapes
- UX:
  - startup failure screen is visible and retryable
  - operation failures surface visible feedback without forcing restart
- Live App Testing:
  - User will do any live app testing you deem necessary; provide a step by step test plan for the user to follow

## Assumptions and defaults

- This plan uses the recommended defaults:
  - phased implementation
  - shared error UX included in this pass
- Keep the current overall Electron architecture; do not replace the generic SQL bridge wholesale in this work.
- Add focused IPC only where required for correctness: lifecycle flush, WAL-safe backup, and transactional multi-step mutations.
- Prefer minimal local changes over cross-cutting rewrites.
- Preserve current user-facing behavior unless it is directly misleading on failure.
