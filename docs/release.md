# Releasing Phosphene Electron

This document is the authoritative release checklist. It covers both the
automated path (`scripts/release.mjs`) and the fully manual path, so a new
maintainer can ship a release cold.

---

## Before you start

A **release** is a tagged version of the app that ships binaries (DMG + ZIP)
to the GitHub Releases page. Release when:

- a feature or fix is ready for users,
- main is green (lint + typecheck + `npm test` with no failing tests),
- the working tree is clean.

Do **not** release from a feature branch, a dirty tree, or a commit that
hasn't been pushed to `origin/main`.

---

## Prerequisites

Everything below must be true before you run anything.

1. **On `main`**, clean working tree, up to date with `origin/main`.
   ```
   git checkout main && git pull --ff-only && git status
   ```
2. **Node / npm** — use the version pinned in `.nvmrc`.
3. **`gh` CLI authenticated.**
   ```
   gh auth status
   ```
   If not, `gh auth login` and pick the `gonkey42/phosphene-electron`-capable
   account.
4. **macOS host.** Releases are currently macOS-only (arm64 DMG + ZIP). The
   automation script refuses the post-upload verify step on non-Darwin hosts.
5. **Signing / notarization.** As of v0.2.2 the build is **ad-hoc signed and
   NOT notarized**. There is no `afterSign` or `notarize` config in
   `package.json > build`. This is called out in the release notes template
   below. If you add notarization, update this section.
6. **Tests.** `npm test` should pass with zero failing tests. Don't
   hard-code a specific pass/total count here — the suite grows.

---

## Version bump convention

Semantic versioning:

- **patch** — bug fixes, internal refactors, test additions, doc updates.
- **minor** — user-visible new features, no breaking changes.
- **major** — breaking changes to persisted data, file formats, or public UX
  contracts. None shipped yet.

Tag format is `vX.Y.Z` (no prefix beyond `v`, no build metadata). This
matches every release from v0.1.0 through v0.2.2.

---

## Automated path (preferred)

The script lives at `scripts/release.mjs` and is wired into `npm run release`.
It is **dry-run by default**. You must pass `--yes` (and a notes file) to
actually publish.

### 1. Write release notes

Create `release-notes/vX.Y.Z.md` using the template at the bottom of this
doc. Commit-and-push the notes file first if you want it in the repo, or
keep it local — either works, `gh release` only needs the file to exist
on disk at release time.

### 2. Dry-run the release

```
node scripts/release.mjs --bump patch --notes-file release-notes/vX.Y.Z.md --dry-run
```

This prints a numbered plan of every shell command that would run and exits
0 without touching anything. Read it. Make sure the next version, tag, and
artifact paths look right.

### 3. Publish

```
node scripts/release.mjs --bump patch --notes-file release-notes/vX.Y.Z.md --yes
```

You cannot pass `--dry-run` and `--yes` together; the script hard-errors on
that combination.

The live run:

1. Re-runs preflight (clean tree, on main, `gh` auth, tag doesn't already
   exist locally or on origin).
2. Bumps `package.json` + `package-lock.json` via
   `npm version --no-git-tag-version`.
3. Runs gates: `rebuild:electron`, `test`, `lint`, `build`, `build:main`,
   `build:electron` (the last one chains `electron-builder` + `verify:package`,
   which boots the packaged binary for ~15 s and fails on bootstrap
   errors). Building after the version bump ensures the archive filenames
   and app metadata match the release tag. Run lint as
   `npm run lint -- --max-warnings=0` so warnings are blocking.
4. Collects only the `.dmg` and `.zip` artifacts whose filenames include
   the target version, ignoring stale archives from older builds.
5. Commits: `chore: bump version to X.Y.Z`.
6. Pushes `main`.
7. Creates and pushes the tag `vX.Y.Z`.
8. Creates the GitHub release with `gh release create`, uploading only the
   matching current-version archives.
9. Downloads the uploaded DMG into a temp dir, mounts it with `hdiutil
   attach -nobrowse -readonly`, runs `verify:package` against the mounted
   `.app`, and detaches.

If **any** step fails, the script aborts with the failing command printed.
The repo may be left in a partially-released state — see **Rollback**.

---

## Manual path (fallback if the script is broken)

Every step the automation does, by hand. Each step assumes the previous
succeeded. Abort on any non-zero exit.

```bash
# 0. sanity
git checkout main
git pull --ff-only
git status                         # must be clean

# 1. bump first so build artifacts match the release version
npm version patch --no-git-tag-version
# inspect: package.json and package-lock.json should show the new version
git diff

# 2. gates
npm run rebuild:electron
npm test                           # zero failing tests
npm run lint -- --max-warnings=0
npm run build
npm run build:main
npm run build:electron             # runs electron-builder + verify:package

# 3. commit + push
git add package.json package-lock.json
git commit -m "chore: bump version to X.Y.Z"
git push origin main

# 4. tag
git tag vX.Y.Z
git push origin vX.Y.Z

# 5. release
gh release create vX.Y.Z \
  --title "Phosphene Electron vX.Y.Z" \
  --notes-file release-notes/vX.Y.Z.md \
  release/Phosphene-X.Y.Z-arm64.dmg \
  release/Phosphene-X.Y.Z-arm64-mac.zip

# 6. post-upload verify
TMP=$(mktemp -d)
gh release download vX.Y.Z -D "$TMP" --pattern "*.dmg"
# The mount point is the final field printed by hdiutil attach; it varies with
# the DMG's volume name and arch, so don't hard-code it. Capture it:
MOUNT=$(hdiutil attach -nobrowse -readonly "$TMP"/*.dmg | tail -1 | awk -F'\t' '{print $NF}')
echo "mounted at: $MOUNT"
PHOSPHENE_APP_PATH="$MOUNT/Phosphene.app/Contents/MacOS/Phosphene" \
  node scripts/verify-package.mjs
hdiutil detach "$MOUNT"
```

---

## Post-upload verify caveats

The `verify:package` script boots the app for 15 s with
`ELECTRON_ENABLE_LOGGING=1` and greps for known-bad signals
(`bootstrap:error`, `NODE_MODULE_VERSION`, native-module load errors). It
is **a smoke test, not a functional test**. A green verify means the app
can launch and load its renderer; it does not mean features work.

Post-upload verify currently only runs on macOS (it mounts the DMG). On
other hosts the script skips it and prints a note — do the manual smoke
install in that case.

---

## Release notes template

Copy this into `release-notes/vX.Y.Z.md` and fill in the blanks. Structure
is copied from v0.2.2.

```markdown
## Phosphene Electron vX.Y.Z

<one-paragraph summary — what kind of release this is, who should care>

### Changes
- **<area>** — <what changed and why it matters>
- **<area>** — <what changed and why it matters>

### Validation
- `npm test` — all tests passing
- `npm run lint -- --max-warnings=0` — zero warnings
- `npm run build` + `npm run build:main` + `npm run build:electron` — all succeed
- `npm run test:e2e` — smoke tests passing

### Downloads
- `Phosphene-X.Y.Z-arm64.dmg`
- `Phosphene-X.Y.Z-arm64-mac.zip`

### Notes
- macOS artifacts are arm64 builds
- this build is ad-hoc signed and not notarized, so macOS may show Gatekeeper warnings on first launch — right-click the app → Open the first time to bypass
```

---

## Smoke-install checklist

After the release is live, do this on a clean machine (or a fresh user
account) before announcing:

1. Download the DMG from the GitHub release page.
2. Mount it; drag `Phosphene.app` to `/Applications`.
3. First launch: right-click → Open (bypasses Gatekeeper warning on
   unnotarized builds).
4. Confirm the default **Home** workspace loads.
5. Create a new workspace; confirm it persists across a quit + relaunch.
6. Open a browser pane; navigate to a URL; confirm it renders.
7. Quit cleanly. Check `~/Library/Application Support/Phosphene` (or
   wherever the platform puts user data) is sane.

If any of these fail on the _uploaded_ artifact but passed locally, that's
a packaging or upload-corruption issue — roll back.

---

## Rollback procedure

The release script does **not** auto-roll-back. If something is wrong:

1. **Delete the GitHub release** (keeps the tag):
   ```
   gh release delete vX.Y.Z --yes
   ```
2. **Delete the tag** locally and on origin:
   ```
   git tag -d vX.Y.Z
   git push origin :refs/tags/vX.Y.Z
   ```
3. **Revert the bump commit** on main:
   ```
   git revert <sha-of-bump-commit>
   git push origin main
   ```
   Or, if the bump commit is the tip and nothing's been built on top of it,
   `git reset --hard HEAD~1 && git push --force-with-lease origin main` —
   but only do that if you're sure no one has pulled.
4. Fix the underlying issue, then re-release with the _next_ patch number
   (don't reuse the rolled-back version).

---

## Troubleshooting

- **`working tree is dirty`** — commit or stash, then retry.
- **`tag vX.Y.Z already exists`** — you already started a release at this
  version. Either delete the tag (see Rollback) or bump past it.
- **`gh: command not found` / `gh auth status` fails** — install/auth the
  `gh` CLI.
- **`verify:package` fails mid-gate** — the locally packaged app won't
  boot. The script aborts before any mutation. Debug locally
  (`PHOSPHENE_APP_PATH=... node scripts/verify-package.mjs`).
- **Post-upload verify fails** — the release is live but broken. Roll
  back, fix, re-release.
