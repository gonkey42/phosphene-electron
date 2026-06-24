# Phosphene Web Publish

Phosphene can manually publish selected workspaces as static snapshots to a private Cloudflare Pages site at `https://phosphene.gonkey.org`.

## Privacy Model

Cloudflare Access protects the whole site. Phosphene does not store viewer accounts or passwords. Approved viewers sign in through Cloudflare's one-time PIN email flow.

## One-Time Cloudflare Setup

1. Confirm Wrangler is authenticated with `npx wrangler whoami`.
2. Create or verify a Cloudflare Pages project named `phosphene`.
3. Attach the custom domain `phosphene.gonkey.org`.
4. In Cloudflare Zero Trust, create an Access application for `phosphene.gonkey.org`.
5. Enable one-time PIN login.
6. Add approved viewer email addresses to the Access policy.

## Publish Behavior

Local edits do not appear online until `Publish to Web` or `Republish` is clicked. Publishing a workspace includes every board in that workspace. Unpublishing removes that workspace from the next deployment. Published workspaces must be unpublished before they can be deleted locally.

## Troubleshooting

- If Wrangler is not authenticated, run `npx wrangler login`.
- If deployment fails, the app keeps the last successful published state when possible.
- If a board cannot be rendered as a PNG, fix the board locally and retry.
