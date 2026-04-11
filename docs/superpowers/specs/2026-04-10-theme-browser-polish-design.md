# Theme And Browser Polish Design

**Date:** 2026-04-10
**Branch:** `codex/theme-and-browser-panel-implementation`

## Summary

This follow-up design polishes the recently added theme and browser-panel work so the app feels coherent and native on macOS. The changes stay on the same branch and focus on visual consistency, browser-pane resizing correctness, native menu integration, and removal of toy-like emoji workspace chrome.

## Goals

- Make the boards sidebar fully respect the current app theme.
- Make the browser pane behave like a normal full-bleed resizable panel at all times.
- Make the browser toolbar compact, single-row, and browser-like.
- Move theme switching out of the renderer chrome and into the macOS `View` menu.
- Move the workspace create `+` button next to the tabs instead of pinning it to the far right.
- Remove emoji workspace icons from the app UI and default workspace creation flow.
- Add right-click context menus for both the address input and the embedded webpage.

## Non-Goals

- Building a full Chrome-style multi-row browser chrome.
- Adding tabs, bookmarks, history, devtools buttons, or other browser-heavy features.
- Redesigning the overall app layout beyond the specific polish issues called out here.
- Migrating or deleting the existing workspace `icon` database column in this pass.

## User Experience Requirements

### Boards Pane

- The boards pane must use the same light/dark theme language as the rest of the shell.
- The current hardcoded light background, borders, and button surfaces should be replaced with theme-token-driven styling.
- The pane should remain readable and calm in both themes, with no white-only artifacts in dark mode.

### Browser Pane Layout

- The right pane must be truly full-bleed within its panel.
- Dragging the panel splitter must resize both the dark renderer surface and the loaded webpage continuously.
- There must be no centered narrow chrome, white gutters, or stale webpage width during or after resize.
- The address field must expand horizontally as the pane gets wider, like a standalone browser.

### Browser Toolbar

- The browser toolbar must be a single compact row.
- The second status line below the controls should be removed entirely.
- Back, Forward, and Reload should use familiar icon-only controls.
- `Go` should remain as a labeled button.
- All controls should be the same compact height as the address field.
- The toolbar should preserve the current minimal aesthetic rather than imitating Chrome visually one-to-one.

### Theme Switching

- The renderer top bar should no longer include a theme selector.
- Theme switching should move to the native application menu under `View > Theme`.
- `System`, `Light`, and `Dark` should behave as mutually exclusive menu choices.
- The menu state should reflect the current persisted theme preference.

### Workspace Tabs

- The `+` workspace-create button should sit immediately after the last workspace tab.
- The right side of the title bar should become quieter and mostly remain drag space.
- Emoji workspace icons should be removed from the UI entirely.
- Workspace tabs should show text-only labels.
- New workspaces created from renderer shortcuts or the tab bar should no longer seed emoji defaults.

### Context Menus

- Right-clicking in the browser address input should show normal edit actions including paste.
- Right-clicking inside the embedded webpage should show a native context menu with standard browser editing/navigation actions where applicable.
- Users should not be forced to use keyboard shortcuts for paste.

## Technical Design

### 1. Sidebar Theming

The sidebar currently mixes two styling systems:

- `Sidebar.tsx` applies hardcoded inline colors.
- `BoardList.css` hardcodes a light-only palette.

The fix is to move the sidebar shell fully into CSS and switch the board-list visuals to app theme tokens already used elsewhere in the renderer shell. This keeps the boards pane aligned with existing `theme-light` / `theme-dark` classes without adding a second theme state source.

The workspace data model can keep its `icon` field for now, but the renderer should stop depending on it for visual presentation.

### 2. Browser Pane Full-Bleed Layout

The resize bug is primarily a renderer layout problem, not a need for a new browser architecture. The current secondary panel is styled as a centered flex container, and the browser panel itself is not forced to span the full width of the pane. Because the native `BrowserView` bounds are computed from that renderer host, the webpage inherits the wrong geometry.

The fix is:

- make the secondary panel a stretch container rather than a centering container
- make the browser panel and host explicitly fill width and height
- keep the browser host as the sole source of truth for native bounds
- ensure splitter-driven geometry changes are observed and forwarded promptly

The result should be that both the pane background and the native webpage move together as one full-width surface.

### 3. Compact Browser Chrome

The browser toolbar should be reduced to one row with five control regions:

1. Back icon button
2. Forward icon button
3. Reload icon button
4. Stretch address input
5. `Go` button

The redundant status line should be removed, since the user already sees the URL they entered or loaded. Browser state should still be tracked internally for enable/disable logic and error handling, but not redundantly rendered as a second row.

### 4. Native Theme Menu

Theme changes should become a main-process concern for presentation, while the actual source of truth remains the persisted renderer theme preference.

The main process should own the native menu template and expose a `View > Theme` submenu. Selecting a menu item should notify the renderer through preload/IPC, and the renderer should route that selection through the existing theme controller so persistence and resolved-theme behavior remain centralized in one place.

The menu layer also needs a way to stay in sync when the renderer hydrates persisted state or the user changes the theme by another route. The cleanest shape is a small theme-menu IPC bridge with:

- renderer-to-main updates for the checked menu state
- main-to-renderer events for menu-driven theme selection

This keeps the menu checked state honest without duplicating persistence logic in Electron main.

### 5. Workspace Tab Simplification

The current top bar still allocates space for:

- a theme control on the far right
- a create button on the far right
- emoji icons in the tabs

The new tab strip should be simplified:

- tabs render as text-only
- the create button lives inline after the last tab
- the separate theme control disappears

This makes the top chrome feel more like a native document strip and reduces pointer travel.

### 6. Browser And Address Context Menus

Two separate context-menu surfaces are needed:

- Renderer address input:
  - likely handled directly in renderer with a small native-feeling menu bridge or standard input context logic
- Embedded webpage:
  - handled in Electron main by listening to the `BrowserView` web contents `context-menu` event and showing a native menu

The webpage context menu does not need to be complex. It should support the standard practical actions users expect for editing and browsing.

## Files Likely In Scope

Renderer:

- `src/components/sidebar/Sidebar.tsx`
- `src/components/sidebar/Sidebar.css` or board-list CSS consolidation
- `src/components/sidebar/BoardList.css`
- `src/components/layout/PanelLayout.css`
- `src/components/browser/BrowserPanel.tsx`
- `src/components/browser/BrowserPanel.css`
- `src/components/browser/BrowserPanel.test.tsx`
- `src/components/workspace/WorkspaceTabBar.tsx`
- `src/components/workspace/WorkspaceTabBar.css`
- `src/components/workspace/WorkspaceTabBar.test.tsx`
- `src/components/AppShell.tsx`
- `src/hooks/use-theme-controller.ts`

Electron / bridge:

- `electron/main.ts`
- `electron/ipc/browser.ts`
- `electron/preload.ts`
- `electron/main.test.ts`
- `electron/preload.test.ts`
- `src/platform/desktop-api.ts`
- `src/types/desktop.d.ts`

Potentially:

- `src/lib/workspace-operations.ts`
- `src/lib/workspace-operations.test.ts`
- `src/hooks/use-keyboard-shortcuts.ts`
- `src/hooks/use-keyboard-shortcuts.test.tsx`

## Testing Strategy

- Renderer tests for sidebar theming and tab-bar structure changes.
- Browser panel tests for single-row toolbar, icon controls, lack of redundant status line, full-width host contract, and resize error paths.
- Electron/browser bridge tests for webpage context-menu wiring if new IPC is added.
- Menu integration tests for `View > Theme` state changes and renderer synchronization.
- Focused verification on full theme/browser test slices, then `tsc`, renderer build, and main/preload build.

## Risks And Guardrails

- Removing the top-bar theme control must not break persisted theme preference behavior.
- Full-bleed browser resizing must not regress the single-owner browser lifecycle fixes already landed.
- Context-menu support must not leak broad Electron APIs into the renderer.
- Emoji removal should stay presentational unless a targeted cleanup of workspace creation defaults is required for consistency.

## Recommended Execution Strategy

Implement this as a single follow-up plan on the same branch. The work is cohesive, uses overlapping files, and benefits from integrated testing of sidebar theme, tab-strip layout, browser chrome, browser resizing, and native menu/context-menu behavior together.
