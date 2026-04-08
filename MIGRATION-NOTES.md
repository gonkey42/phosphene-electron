# Migration Notes

## Electron Migration

- The app now runs on Electron instead of Tauri.
- The Electron main process preserves the legacy macOS data directory at
  `~/Library/Application Support/app.phosphene.desktop`, so the existing
  `phosphene.db`, `images/`, `captures/`, and `backups/` continue to work in place.
- Drag-and-drop now relies on Chromium's native handling rather than the old
  Tauri/WebKit workaround. In manual testing, Finder image drops rendered and
  reloaded successfully after restart.
