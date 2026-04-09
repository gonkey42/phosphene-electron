# Phosphene Electron Design: Phase 1 Theme System and Phase 2 Browser Panel

Date: 2026-04-09

## Summary

This spec defines the next two product phases for the Electron version of Phosphene:

1. Phase 1 adds app-wide theming with system-follow behavior, a manual override, and Excalidraw theme synchronization.
2. Phase 2 replaces the secondary-panel placeholder with a focused embedded browser pane.

The goal is to improve day-to-day usability without importing unnecessary scope from the older Tauri plans. This spec intentionally excludes timers, recent boards, widget grids, tabs, history, markdown editing, and advanced clipping workflows.

## Product decisions already made

- The app should support dark mode.
- Theme behavior should default to following the system appearance.
- Users should be able to override system theme with a manual setting.
- The Excalidraw canvas should follow the same resolved theme as the rest of the app.
- The save/saving overlay should be removed entirely.
- The browser pane should ship as a minimal right-panel browser first.
- Dragging images or videos from the browser into the canvas is deferred to a later phase.
- Markdown editing/viewing is a possible later feature, not part of these phases.

## Why this order

Theme and chrome cleanup should land before the browser pane because the browser panel introduces new controls, surface area, and layout states. Establishing theming first avoids reworking browser UI styling immediately after implementation. Removing the save indicator in the same phase also resolves an existing UX annoyance and visual overlap with Excalidraw controls.

The previously identified code-review findings are not blockers for these phases:

- The duplicate schema bootstrap logic is maintainability debt, but it does not prevent either feature from being implemented safely.
- The board-load stale-state issue is worth addressing soon, but it is not required before theme work or the first browser panel slice.

## Phase 1: Theme system

### Goals

- Add a single theme system for the Electron app shell.
- Support three user-selectable modes:
  - `system`
  - `light`
  - `dark`
- Resolve the actual active theme from the user preference and the OS color scheme.
- Apply the resolved theme consistently to:
  - top-level app shell
  - sidebar and workspace chrome
  - secondary panel chrome
  - browser panel chrome when Phase 2 lands
  - Excalidraw canvas
- Remove the save/saving indicator UI completely.

### Non-goals

- No per-workspace theme setting.
- No custom theme editor.
- No multiple color palettes.
- No animation or toast replacement for save status.
- No changes to autosave behavior or persistence timing.

### User experience

The app should feel visually coherent in both light and dark appearances. On first launch, it should match the system theme automatically. Users should be able to explicitly choose light or dark mode and have that choice persist across restarts. If they later switch back to `system`, the app should resume following OS changes.

The theme control should live in an obvious but low-friction place in the app chrome. It does not need to be complex; a small menu, segmented control, or simple toggle affordance is sufficient as long as all three modes are reachable.

The Excalidraw canvas should switch themes with the shell instead of remaining visually disconnected.

The current `SaveIndicator` should be removed so the canvas area is less noisy and Excalidraw controls are no longer obscured.

### Architecture

Theme state should be modeled as two layers:

- `themePreference`: the user’s stored choice (`system | light | dark`)
- `resolvedTheme`: the active theme after combining preference with OS state (`light | dark`)

The source of truth should be the Zustand app store, since the rest of the shell already depends on it. A small theme controller hook should:

- read the current system preference via `window.matchMedia("(prefers-color-scheme: dark)")`
- subscribe to system changes
- compute `resolvedTheme`
- update the store when the OS theme changes while preference is `system`

Persistence should use existing local SQLite-backed app storage patterns if convenient, but for this phase the main requirement is persistence across launches. A small setting stored in the existing `settings` table is preferred because the app already has DB-backed initialization and a stable place for global preferences.

Top-level UI styling should move toward theme-driven app classes such as:

- `.theme-light`
- `.theme-dark`

These classes should be applied high in the tree, ideally around `AppShell`, so child CSS can key off them cleanly.

Excalidraw should receive the resolved theme explicitly through its supported API/props rather than relying on CSS inversion or browser-level tricks.

### Data model

Add a new global setting key:

- `theme_preference`

Stored values:

- `system`
- `light`
- `dark`

No schema migration is needed beyond using the existing `settings` table.

### Components and modules

Expected additions or changes:

- `src/stores/app-store.ts`
  - add theme preference and resolved theme state
  - add setters for theme preference and resolved theme
- new theme settings helper in `src/lib/` or `src/hooks/`
  - load persisted preference
  - save preference changes
  - bridge system theme changes
- `src/components/AppShell.tsx`
  - initialize theme state during app startup
  - apply top-level theme class
  - render theme control in shell chrome
- `src/components/canvas/ExcalidrawCanvas.tsx`
  - pass resolved theme into Excalidraw
- `src/components/canvas/CanvasPanel.tsx`
  - remove `SaveIndicator`
- `src/components/canvas/SaveIndicator.tsx`
  - remove component usage; file deletion is acceptable if nothing else imports it

### Error handling

Theme preference load/save failures should never block app startup.

- If loading the persisted theme fails, fall back to `system`.
- If saving the theme preference fails, keep the in-memory choice and report a recoverable shared error.
- If system theme detection is unavailable for any reason, fall back to `light` unless the user explicitly chose `dark`.

Removing the save indicator should not remove existing save-failure handling. Errors from persistence hooks should continue surfacing through the shared error channel.

### Testing

Add or update tests to cover:

- default theme preference is `system`
- resolved theme follows OS preference on startup
- resolved theme updates when OS theme changes while preference is `system`
- resolved theme does not change with OS updates when preference is `light` or `dark`
- persisted preference is loaded on startup
- changing preference writes the new setting
- `ExcalidrawCanvas` receives the correct theme prop
- `CanvasPanel` no longer renders the save indicator

## Phase 2: Minimal browser pane

### Goals

- Replace the right-side placeholder panel with a functional embedded browser pane.
- Keep the browser in the existing resizable secondary panel.
- Provide a focused first version with:
  - URL/search field
  - back button
  - forward button
  - reload button
  - embedded web content area
- Keep browser behavior simple and reliable enough for research/reference use beside the canvas.

### Non-goals

- No tabs.
- No bookmarks.
- No browsing history UI.
- No recent boards in the browser pane.
- No timer, widgets, or widget registry.
- No markdown panel in this phase.
- No drag-and-drop bridge from browser into canvas yet.
- No clipping pipeline or AI extraction work.

### User experience

The browser should feel like a practical sidecar, not a full standalone browser product. A user should be able to type a URL, paste a link, or enter a search query and use the web while keeping the canvas visible. The pane should preserve the existing resize behavior from the workspace layout.

The browser panel should visually match the active app theme. The controls can be compact and utilitarian. This first version is about reliable access, not feature richness.

### Architecture

Phase 2 should not use a plain React iframe as the primary browser implementation. The browser should be implemented through Electron-managed native web contents from the main process, using the project’s best-supported embedding option (`WebContentsView` if it fits cleanly in the current Electron version, otherwise `BrowserView`). The implementation choice should optimize for:

- correct navigation behavior
- keyboard and focus stability
- predictable resizing with the existing panel layout
- compatibility with future drag/drop or media capture features

The renderer should own browser UI state and intent:

- current address bar text
- current URL
- loading state
- navigation button enabled/disabled state
- resize measurements for the secondary panel host

The main process should own the native browser surface and navigation execution:

- create/attach browser view for the active window/workspace pane
- navigate to URL
- go back / forward / reload
- update bounds when the secondary panel resizes
- emit navigation state changes back to the renderer

This separation keeps native browser behavior in Electron where it belongs and keeps React responsible for layout and controls.

### Panel integration

The current workspace shell already reserves a secondary panel through `PanelLayout`. For this phase:

- replace the placeholder content in `WorkspaceContainer`
- render a dedicated `BrowserPanel` component in the secondary pane
- preserve existing panel sizing persistence via `primaryPanelSize`

No generalized panel registry is required yet. The secondary pane can remain a single-purpose browser host for now. If markdown or other side-pane modules are added later, we can introduce a registry or panel-mode switch then.

### Browser navigation behavior

Input handling should follow a simple rule set:

- if input parses as a valid URL with protocol, navigate directly
- if input looks like a hostname without protocol, coerce to `https://`
- otherwise perform a web search using a default search engine URL

The browser controls should reflect live state:

- disable back when no history is available
- disable forward when no forward history is available
- show loading state during navigation
- keep the address field in sync with the currently loaded page

### Workspace behavior

For the first version, browser state can be app-wide or per-window rather than per-workspace. The simplest option should be chosen unless preserving a separate browser page per workspace is nearly free. The priority is a stable browser panel, not workspace-specific browsing sessions.

Recommended choice:

- keep one browser session per app window for Phase 2

This avoids adding unnecessary persistence complexity before the browser feature proves itself useful. If users later want per-workspace browser state, that can be added in a follow-up.

### Data and persistence

No durable browser persistence is required for Phase 2 beyond whatever the embedded Electron browser surface provides by default for session/cookies.

Do not add database schema for browser history, tabs, or panel metadata in this phase.

### Components and modules

Expected additions or changes:

- new renderer component for browser controls and browser host placeholder
- new main-process browser management module under `electron/`
- preload bridge additions for browser commands/events
- `src/platform/desktop-api.ts`
  - expose browser control APIs
- `src/types/desktop.d.ts`
  - type the new browser bridge
- `src/components/workspace/WorkspaceContainer.tsx`
  - replace the secondary placeholder with the browser panel

### Focus and keyboard behavior

The browser pane must cooperate with the existing keyboard focus model. When the browser is active:

- app-level shortcuts should not unexpectedly hijack browser typing
- focus should be represented in the existing focus system as `browser`
- switching between canvas and browser should remain predictable

This matters because the current app already distinguishes `canvas`, `browser`, `widget`, and `global` focus targets.

### Error handling

Browser creation or navigation failures should not crash the shell.

- if browser view creation fails, render a visible fallback error card in the secondary panel
- if navigation fails, keep the browser controls available so the user can retry or navigate elsewhere
- preload/IPC errors should be surfaced through the shared error channel

### Testing

Add or update tests to cover:

- browser controls render in the secondary pane instead of the placeholder
- entering a URL dispatches the correct browser navigation call
- bare hostnames are normalized to `https://`
- search terms produce a search URL
- back/forward/reload controls dispatch expected bridge calls
- browser focus integrates with the keyboard focus model
- browser bounds/resizing logic updates when panel size changes
- browser-creation failure renders a fallback error state

## Sequencing

Implementation should happen in this order:

1. Theme state model and persistence
2. App-wide themed shell classes
3. Excalidraw theme synchronization
4. Save indicator removal
5. Browser bridge spike and technical choice confirmation for Electron embedding
6. Minimal browser controls and secondary-panel integration
7. Browser resizing and focus polish

## Future follow-ups explicitly deferred

- browser drag-and-drop into canvas
- image and video extraction from browser content
- markdown side panel
- workspace-specific browser sessions
- tabs/history/bookmarks
- generalized widget or panel registry
- schema ownership cleanup between renderer and main process
- board-load stale-state cleanup

## Success criteria

Phase 1 is successful when:

- the app launches in a theme that matches system preference by default
- users can switch between `system`, `light`, and `dark`
- the selection persists across restart
- Excalidraw switches with the shell theme
- the save indicator is gone

Phase 2 is successful when:

- the right pane contains a working embedded browser
- users can navigate via URL/search input plus back/forward/reload
- the browser resizes with the existing secondary panel
- the browser does not destabilize canvas interaction or shell startup
