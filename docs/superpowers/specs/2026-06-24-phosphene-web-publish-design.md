# Phosphene Web Publish Design

Date: 2026-06-24
Status: Approved for planning

## Problem

Phosphene is a local-first Electron canvas app. The user wants a boring-simple way to make selected workspaces viewable when away from the Mac, without exposing the editable local app or local database to the internet. The web view should live at `phosphene.gonkey.org`, separate from the existing `gonkey.org` website, and it should be private for the user plus invited viewers.

## Goals

- Publish selected Phosphene workspaces to a private Cloudflare-hosted site at `phosphene.gonkey.org`.
- Keep publishing manual. Local edits stay local until the user clicks `Publish` or `Republish`.
- Let the user decide workspace by workspace which content is online.
- Publish every board inside a selected workspace.
- Render boards as static image snapshots for the first version.
- Provide a private landing page listing only published workspaces.
- Give every published workspace its own page with all board snapshots.
- Let the user unpublish a workspace so its page, board images, and old workspace links are removed from the deployed site.
- Use one Cloudflare Access email allowlist for the whole private site.
- Use Cloudflare Pages for hosting and Wrangler for deployment, since Wrangler is already authenticated on this machine.

## Non-Goals

- No live editing on the website.
- No automatic background publishing.
- No public unauthenticated links.
- No per-workspace or per-board invite lists in v1.
- No per-board publish selection in v1.
- No pan/zoom web viewer in v1.
- No changes to the existing `gonkey.org` Pages project.
- No requirement to merge the Phosphene web output into the existing public website.

## Existing Context

- The app stores workspaces, boards, canvas data, and metadata in SQLite under the macOS app data directory.
- Board image data is extracted to filesystem paths and rehydrated in the renderer through `src/lib/image-extraction.ts`.
- The installed Excalidraw package exposes export helpers such as `exportToBlob`, but those helpers are best used in the renderer because they depend on browser canvas behavior.
- The current desktop API boundary runs through `electron/preload.ts`, `src/platform/desktop-api.ts`, and `src/types/desktop.d.ts`.
- The current website is a Cloudflare Pages project named `gonkey42`, serving `gonkey.org`, `www.gonkey.org`, and `gonkey42.pages.dev`.
- Wrangler is authenticated for the Cloudflare account that owns `gonkey.org`.

## Approaches Considered

### Approach A: Separate Private Cloudflare Pages Project

Create a separate Pages project for Phosphene, attach `phosphene.gonkey.org`, protect the hostname with Cloudflare Access, and have the local app deploy a generated static site to that project.

This keeps the existing public website untouched. It also gives the published Phosphene site a simple structure: an index page, one page per workspace, and image files for board snapshots.

### Approach B: Path Under Existing Site

Serve the web publish output under `gonkey.org/phosphene`. This keeps one hostname, but it requires either modifying the existing website deployment or adding Worker routing in front of the current Pages project.

This is more complex than the v1 needs and creates a risk of disturbing the existing public site.

### Approach C: Live Local App Through A Tunnel

Expose a local service with Cloudflare Tunnel and protect it with Access. This could make updates more immediate, but it requires the Mac to be awake and turns the local environment into the origin.

This is not appropriate for v1 because static snapshots are enough and safer.

### Approach D: Automatic Publishing

Watch workspace changes and publish after edits settle. This is convenient, but it creates privacy risk and more failure modes. A user may temporarily place sensitive content on a board before deciding whether it should go online.

Manual publish is the v1 choice.

## Recommendation

Use Approach A: a separate private Cloudflare Pages project at `phosphene.gonkey.org`, deployed manually from Phosphene. Cloudflare Access protects the whole site with one email allowlist and one-time PIN login.

## Proposed Behavior

### Workspace Publish States

Each workspace has a local publish state:

- `not-online`: the workspace is local only and does not appear on the private site.
- `online`: the workspace is published and the local source fingerprint still matches the published snapshot.
- `changed-since-publish`: the workspace has a published snapshot, but the local workspace or one of its boards changed after that snapshot.
- `publish-failed`: the last publish or unpublish attempt failed. The state includes a short error message and leaves the last successful website state intact when possible.

The app should expose simple actions:

- `Publish to Web` for `not-online` workspaces.
- `Republish` for `online`, `changed-since-publish`, and `publish-failed` workspaces.
- `Unpublish` for any workspace with a published snapshot.

### Website Structure

The private site root lists published workspaces:

```text
https://phosphene.gonkey.org/
  Trip Itinerary
  House Ideas
  Project Moodboard
```

Each workspace has a slugged page:

```text
https://phosphene.gonkey.org/workspaces/trip-itinerary/
```

Each workspace page shows every board in that workspace as a static image snapshot. For v1, a board image may open in the browser's native image view or a simple generated board page, but no pan/zoom app is required.

### Access Control

Cloudflare Access protects `phosphene.gonkey.org` as a single application. The policy allows one configured list of email addresses. Approved viewers authenticate with Cloudflare's one-time PIN flow.

Phosphene does not implement its own login system. It may link to a setup note that explains where the allowlist is configured in Cloudflare.

### Publish Data Flow

1. The user clicks `Publish to Web` or `Republish` on a workspace.
2. The renderer asks the main process for a publish preparation payload for that workspace.
3. The main process reads the current workspace and board records from SQLite and returns ordered board canvas data plus a source fingerprint.
4. The renderer rehydrates any `phosphene-file://` image references and renders each board to a PNG snapshot with Excalidraw export helpers.
5. The renderer sends the workspace id, source fingerprint, and board PNG bytes back to the main process.
6. The main process re-checks the workspace source fingerprint. If the workspace changed while snapshots were being generated, it rejects the publish and asks the renderer to retry.
7. The main process writes the published workspace snapshot into the app data directory under a web publish folder.
8. The main process regenerates the whole static site from all currently published workspace snapshots.
9. The main process deploys the generated static site to the Cloudflare Pages project with Wrangler.
10. On success, the local manifest records the workspace as published and stores the deployment time and URL.

### Unpublish Data Flow

1. The user clicks `Unpublish` for a workspace.
2. The main process removes that workspace from the local web publish manifest and deletes its snapshot assets.
3. The main process regenerates the static site from remaining published workspaces.
4. The main process deploys the generated static site to Cloudflare Pages.
5. On success, the workspace becomes `not-online`.

If unpublish deployment fails, the app reports `publish-failed` and should not claim that the remote content is gone. The local manifest should preserve enough information to retry.

### Local Publish Manifest

Publishing should use a filesystem-backed manifest in the app data directory instead of a new SQLite schema in v1. SQLite remains the source of truth for local workspace and board content. The publish manifest is an export artifact that records the last published remote state.

Recommended app data layout:

```text
web-publish/
  manifest.json
  snapshots/
    <workspace-id>/
      workspace.json
      boards/
        <board-id>.png
  site/
    index.html
    assets/
    workspaces/
```

The manifest tracks:

- Cloudflare project name.
- Public hostname.
- Published workspace ids.
- Workspace slugs.
- Last successful source fingerprint per workspace.
- Last publish time.
- Last deployment URL when Wrangler returns one.
- Last failure message for a workspace action.

### Slugs

Workspace and board URLs should use stable slugs. The default slug is derived from the current name, lowercased and ASCII-normalized, with non-alphanumeric runs collapsed to `-`.

If a workspace is renamed after it has been published, the existing slug should remain stable until the workspace is unpublished and published again. This avoids breaking links because of a rename.

If two published workspaces would produce the same slug, append a short stable suffix derived from the workspace id.

### Cloudflare Setup

The implementation should assume a one-time Cloudflare setup exists before the app's first successful publish:

- Pages project: `phosphene`
- Production hostname: `phosphene.gonkey.org`
- Cloudflare Access application protecting `phosphene.gonkey.org`
- One email allowlist for approved viewers
- One-time PIN login enabled

The build plan should include a setup/preflight step that verifies Wrangler login, project availability, and deployment failure messaging. It should not expose Cloudflare tokens in logs.

## Error Handling

- If Wrangler is not installed or not authenticated, show a clear error and leave the last successful website state untouched.
- If Cloudflare deployment fails, preserve the generated site output for inspection and mark the affected workspace `publish-failed`.
- If board snapshot generation fails for one board, fail the publish for that workspace. Do not publish a partial workspace.
- If the workspace changes during snapshot generation, fail fast with a retryable stale-source error.
- If a published workspace is deleted locally, the app should still let the user unpublish its last published snapshot from the site.
- If no workspaces are published, deploy a private empty-state landing page rather than deleting the whole Pages project.

## Testing

- Unit tests cover slug creation, manifest reads/writes, source fingerprinting, site generation, and Wrangler command construction.
- Renderer tests cover snapshot export orchestration with mocked Excalidraw export and mocked desktop APIs.
- IPC tests cover payload validation and stale-source rejection.
- UI tests cover publish state labels and publish/republish/unpublish actions with mocked desktop APIs.
- E2E or integration tests should not hit Cloudflare. Use a fake deployer command or dependency injection.
- Manual verification should include one real Wrangler deployment only after local tests pass and the user confirms the target Cloudflare project.

## Acceptance Criteria

- A user can publish a selected workspace to `phosphene.gonkey.org`.
- The private site index lists only published workspaces.
- A published workspace page shows static image snapshots for every board in that workspace.
- A local workspace that has never been published does not appear on the private site.
- Local edits do not change the website until the user clicks `Republish`.
- The app indicates when a published workspace has changed since its last successful publish.
- The user can unpublish a workspace, and old workspace URLs stop serving that workspace after deployment.
- Publishing or unpublishing failure leaves the previous successful remote state intact when possible and shows a clear retryable error.
- Cloudflare Access, not Phosphene, protects the site with one email allowlist.
- The existing `gonkey.org` website remains untouched.
