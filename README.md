# Phosphene

Phosphene is an Electron desktop canvas workspace built on Excalidraw. It keeps boards, workspaces,
images, and backups on disk with SQLite-backed persistence, and it is set up to preserve the existing
macOS application data directory used during the migration to Electron.

## Highlights

- Multiple workspaces with independent board state
- Excalidraw canvas persistence across restarts
- Finder image drag-and-drop with filesystem-backed image storage
- Daily SQLite backups
- Packaged macOS app output via `electron-builder`

## Local Data

Phosphene stores its desktop data in:

`~/Library/Application Support/app.phosphene.desktop`

That directory contains:

- `phosphene.db`
- `images/`
- `captures/`
- `backups/`

## Development

Install dependencies:

```bash
npm install
```

Run the app in development mode:

```bash
npm run dev
```

## Verification

Run the test suite:

```bash
npm test
```

This command always rebuilds `better-sqlite3` for the current Node runtime
before running Vitest, so it is safe to run after Electron-targeted commands.

Run a type check:

```bash
npx tsc --noEmit
```

Build the renderer:

```bash
npm run build
```

Build the Electron main and preload bundles:

```bash
npm run build:main
```

Build the packaged desktop app:

```bash
npm run build:electron
```

## Native Module Rebuild Scripts

Phosphene depends on `better-sqlite3`, a native module that must be compiled
against the correct ABI for the runtime that will load it: Node.js for Vitest
and other tooling, Electron for `dev`, `test:e2e`, and packaging. The two
ABIs are incompatible, so switching between test modes and packaging mode
requires rebuilding the binding.

The command contract is:

- `npm test` rebuilds `better-sqlite3` for Node and then runs Vitest.
- `npm run test:e2e` rebuilds `better-sqlite3` for Electron before launching
  the Electron smoke suite.
- `npm run rebuild:node` and `npm run rebuild:electron` remain available as
  low-level helpers when you need to target a runtime directly.

Two helper rebuild scripts still exist underneath that contract:

- `npm run rebuild:electron` — removes `node_modules/better-sqlite3/build` and
  rebuilds the native module against the current Electron version using
  `electron-rebuild`. Run this before packaging or running Electron. It is
  chained automatically from `build:electron` and `test:e2e`.
- `npm run rebuild:node` — removes the build dir and rebuilds against the
  system Node via `npm rebuild better-sqlite3`. `npm test` already calls this
  automatically.

### Why the explicit clean step?

`@electron/rebuild` (invoked by `electron-builder` under the hood) skips the
build when `build/Release/better_sqlite3.node` already exists, even if that
binary was compiled against the wrong ABI. Passing `-f` (force) to
`electron-rebuild` is not sufficient on its own — when the existing `.node`
file was compiled for a different ABI, the stale `build/` directory must be
removed so the native toolchain recompiles from source. Removing the build
directory first forces a clean rebuild. This was the root cause of the broken
v0.2.2 DMG, which shipped a Node-ABI binding instead of an Electron-ABI one.

`npm run build:electron` chains `rebuild:electron` → `build` → `build:main` →
`electron-builder` and emits the DMG to `release/`.

## Release Artifacts

Packaged outputs are written to:

- `release/mac-arm64/Phosphene.app`
- `release/Phosphene-0.1.0-arm64.dmg`
- `release/Phosphene-0.1.0-arm64-mac.zip`

## Project Notes

- The renderer talks to native capabilities through the Electron preload bridge in `window.desktop`.
- SQLite access and filesystem operations live in the Electron main process.
- Migration details are captured in `MIGRATION-NOTES.md`.
