# Web Publish Dark Mode Design

Date: 2026-06-24
Status: Approved for planning

## Problem

Phosphene Web Publish v1 generates a private static site for selected workspaces at `https://phosphene.gonkey.org`. The current generated site uses a hardcoded light palette in `electron/web-publish/site-generator.ts`, and published board snapshots default missing canvas backgrounds to white in `src/lib/web-publish/export-board-snapshot.ts`.

The local app already has a dark theme. The user normally selects it from the macOS menu at `View > Theme > Dark`, and wants the generated Web Publish index and workspace pages to visually match that app dark mode. The website should not follow the viewer's operating-system preference, should not default to `System`, and should not introduce a separate unrelated dark palette.

## Goals

- Make generated Web Publish HTML use Phosphene's existing app dark-mode tokens as the visual source of truth.
- Make the generated site dark by default and deterministic, independent of viewer OS `prefers-color-scheme`.
- Match the app's dark mode across page background, text, muted text, borders, cards, panels, workspace links, board cards, board image frames, and empty states.
- Make uploaded board preview snapshots use the app's dark Excalidraw rendering path where possible.
- Preserve explicit board canvas background colors chosen by the user, while giving boards without an explicit background a dark-mode default instead of white.
- Keep Cloudflare Access, deployment behavior, publish state, slug behavior, and manual publish semantics unchanged.
- Cover the dark output with tests so future changes to `src/App.css` dark tokens do not silently drift away from Web Publish styling.

## Non-Goals

- No light or system-themed Web Publish output in this pass.
- No website theme toggle.
- No `prefers-color-scheme` media query for the generated site.
- No Cloudflare Access, Pages, or Wrangler behavior changes.
- No release cut or production deployment as part of the implementation unless explicitly approved later.
- No redesign of the local app theme menu.
- No new unrelated color palette.

## Existing Context

### App Theme Tokens

`src/App.css` defines the renderer theme variables. The current dark theme is:

```css
.theme-dark {
  --app-background: #08111f;
  --app-surface: #0f1b2d;
  --app-surface-muted: #12233a;
  --app-text: #e2e8f0;
  --app-text-muted: #94a3b8;
  --app-border: #243448;
  --app-shadow: 0 24px 60px rgba(2, 6, 23, 0.5);
}
```

Most local shell CSS already consumes those variables through `var(--app-...)`, including the workspace tabs, publish controls, sidebar, and app shell.

### Theme Menu And Persistence

The native menu is implemented in `electron/main.ts`:

- `buildApplicationMenuTemplate()` creates `View > Theme`.
- `buildThemeSubmenuTemplate()` creates radio items for `System`, `Light`, and `Dark`.
- Selecting a radio item calls `setThemePreference(preference, { persist: true, notifyRenderer: true })`.
- `setThemePreference()` rebuilds the menu so the checked item follows `currentThemePreference`.

The persisted preference is stored in SQLite through `electron/theme-preferences.ts`:

- valid values are `system`, `light`, and `dark`
- the settings key is `theme_preference`
- `loadPersistedThemePreference()` falls back to `system` only when no valid value exists

The renderer consumes the bridge through `src/lib/theme-settings.ts` and `src/hooks/use-theme-controller.ts`. `useThemeController()` resolves `system` against `window.matchMedia("(prefers-color-scheme: dark)")`, stores `themePreference` and `resolvedTheme` in `src/stores/app-store.ts`, and applies `theme-${resolvedTheme}` to `AppShell`.

The screenshot is useful only as confirmation of the user-facing entry point: `View > Theme > Dark` is selected. It is not a design mockup for the generated website.

### Web Publish Generator

Web Publish is currently implemented around:

- `electron/web-publish/site-generator.ts` for static HTML and asset generation.
- `electron/web-publish/site-generator.test.ts` for generated index/workspace page coverage.
- `electron/ipc/web-publish.ts` for publish/unpublish IPC, manifest updates, staging, promotion, and fake-deployer tests.
- `src/lib/web-publish/workspace-publish.ts` for renderer-side publish orchestration.
- `src/lib/web-publish/export-board-snapshot.ts` for Excalidraw PNG export with filesystem image hydration.
- `src/lib/web-publish/export-board-snapshot.test.ts` and `src/lib/web-publish/workspace-publish.test.ts` for renderer export tests.

The generator's `pageShell()` currently hardcodes a light site:

- body background `#f7f8fb`
- body text `#172033`
- cards and board panels with `background: white`
- borders around `#d7dce6` / `#e4e7ef`

Those values should be replaced with the app dark theme language.

## Proposed Behavior

### Generated Site Theme

Every generated Web Publish page should render as dark Phosphene UI:

- `html` or `body` carries a stable `theme-dark` class.
- The generated stylesheet defines the same `--app-*` dark variables used by the local app.
- Page backgrounds use the app shell's dark background language, with `--app-background`, `--app-surface-muted`, and `--app-surface`.
- Workspace links and board cards use `--app-surface`, `--app-border`, `--app-text`, `--app-text-muted`, and `--app-shadow`.
- Empty-state and secondary text use `--app-text-muted`.
- Links remain readable on dark backgrounds and should not rely on browser default blue.
- The generated CSS must not use `prefers-color-scheme`; the private site should look dark for every viewer.

Because Electron main cannot directly import `src/App.css` at packaged runtime, the implementation may mirror the app dark tokens in a Web Publish module. That mirror must be guarded by tests that parse `src/App.css` and compare the `.theme-dark` token values to the generated Web Publish theme values. `src/App.css` remains the source of truth.

### Board Preview Snapshots

Published board snapshots should be generated for dark viewing:

- Snapshot export should pass Excalidraw `theme: "dark"` into the export app state.
- Snapshot export should continue to hydrate `phosphene-file://` image references before export.
- Snapshot export should keep `exportBackground: true`.
- If the stored board app state has an explicit `viewBackgroundColor`, preserve it.
- If `viewBackgroundColor` is missing, default it to the app dark background token rather than `#ffffff`.

This keeps user-authored canvas backgrounds intact while avoiding white default board previews on the dark generated site.

### Publish Flow

The publish flow remains manual:

1. The user selects `View > Theme > Dark` in the app.
2. The user clicks `Publish to Web` or `Republish`.
3. The renderer exports board snapshots with dark publish rendering.
4. The main process regenerates the static site with dark Web Publish CSS.
5. The main process deploys only if the existing publish action is explicitly invoked by the user.

Implementation work and verification must not cut a release or deploy the site unless the user explicitly approves that later.

## Testing Strategy

- Add unit coverage that extracts `.theme-dark` variables from `src/App.css` and asserts Web Publish dark tokens match them.
- Extend `electron/web-publish/site-generator.test.ts` to assert generated index and workspace pages contain dark theme variables/classes and do not contain the previous light-only styles.
- Extend generated HTML assertions for published workspace cards, board cards, board image frames, and empty-state pages.
- Extend `src/lib/web-publish/export-board-snapshot.test.ts` to assert dark Excalidraw export state, dark default background, explicit background preservation, and image hydration.
- Extend `src/lib/web-publish/workspace-publish.test.ts` if publish orchestration starts passing an explicit publish theme through to snapshot export.
- Keep IPC/deployer tests fake; no tests should hit Cloudflare.
- Run targeted tests, full tests, lint, build, and a local generated-site/manual preview check before considering implementation complete.

## Acceptance Criteria

- Generated `index.html` and workspace pages use the app dark token values from `src/App.css`.
- Generated pages do not rely on OS color-scheme media queries.
- Generated pages no longer contain light-only `body`/card/board styles such as `background: white` or `#f7f8fb`.
- Workspace cards, board cards, image frames, text, muted text, links, and empty states are readable and visually aligned with Phosphene dark mode.
- Published board snapshots are exported with Excalidraw dark theme state.
- Boards without a stored background no longer export with a white default background.
- Boards with explicit stored backgrounds keep those backgrounds.
- Existing Web Publish behavior still works: publish, republish, unpublish, manifest updates, slug stability, failure preservation, and fake deployer tests remain green.
- No release is cut and no Cloudflare deployment is performed unless explicitly approved later.
