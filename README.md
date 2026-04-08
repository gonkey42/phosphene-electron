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

## Release Artifacts

Packaged outputs are written to:

- `release/mac-arm64/Phosphene.app`
- `release/Phosphene-0.1.0-arm64.dmg`
- `release/Phosphene-0.1.0-arm64-mac.zip`

## Project Notes

- The renderer talks to native capabilities through the Electron preload bridge in `window.desktop`.
- SQLite access and filesystem operations live in the Electron main process.
- Migration details are captured in `MIGRATION-NOTES.md`.
