#!/usr/bin/env node
// Phosphene release automation.
//
// Dry-run by default. Pass --yes to actually publish. Running with no flags
// (or with --dry-run) must NEVER mutate repo state, push tags, or create a
// GitHub release.
//
// Usage:
//   node scripts/release.mjs --bump patch --dry-run
//   node scripts/release.mjs --bump patch --notes-file release-notes/v0.2.3.md --yes
//
// Flags:
//   --bump <patch|minor|major>   (required) semver bump
//   --notes-file <path>          required when --yes; optional for dry-run
//   --dry-run                    default TRUE — prints plan, no mutations
//   --yes                        explicit opt-in to actually publish
//
// Passing --dry-run and --yes together is a hard error. Default-is-dry-run is
// the core safety invariant of this script.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");

function die(msg, code = 1) {
  console.error(`[release] ERROR: ${msg}`);
  process.exit(code);
}

function info(msg) {
  console.log(`[release] ${msg}`);
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

let parsed;
try {
  parsed = parseArgs({
    options: {
      bump: { type: "string" },
      "notes-file": { type: "string" },
      "dry-run": { type: "boolean" },
      yes: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: false,
  });
} catch (err) {
  die(`failed to parse args: ${err.message}`);
}

const args = parsed.values;

if (args.help) {
  console.log(
    [
      "Usage: node scripts/release.mjs --bump <patch|minor|major> [--notes-file <path>] [--dry-run | --yes]",
      "",
      "Dry-run by default. Pass --yes to actually publish.",
    ].join("\n"),
  );
  process.exit(0);
}

if (!args.bump) die("--bump is required (patch|minor|major)");
if (!["patch", "minor", "major"].includes(args.bump)) {
  die(`--bump must be patch|minor|major (got ${args.bump})`);
}

// Default-is-dry-run invariant. If neither flag is passed, behave as dry-run.
// If both are passed, abort — ambiguous intent.
if (args["dry-run"] && args.yes) {
  die("cannot combine --yes and --dry-run; pick one");
}
const dryRun = !args.yes; // default TRUE

if (!dryRun && !args["notes-file"]) {
  die("--notes-file is required when running with --yes");
}

if (args["notes-file"] && !fs.existsSync(args["notes-file"])) {
  die(`--notes-file not found: ${args["notes-file"]}`);
}

// ---------------------------------------------------------------------------
// Shell helpers
// ---------------------------------------------------------------------------

function run(cmd, cmdArgs, opts = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: repoRoot,
    stdio: opts.capture ? "pipe" : "inherit",
    encoding: "utf8",
    ...opts,
  });
  if (result.status !== 0) {
    const full = `${cmd} ${cmdArgs.join(" ")}`;
    if (opts.capture) {
      die(
        `step failed: ${full}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
    } else {
      die(`step failed: ${full}`);
    }
  }
  return result;
}

function runCapture(cmd, cmdArgs) {
  return run(cmd, cmdArgs, { capture: true }).stdout.trim();
}

function tryRun(cmd, cmdArgs) {
  return spawnSync(cmd, cmdArgs, {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8",
  });
}

// Run a step and, on failure, die with the normal error text plus a
// task-specific recovery hint so the maintainer knows how to resume or
// roll back without guessing.
function runOrDie(cmd, cmdArgs, recoveryHint) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const full = `${cmd} ${cmdArgs.join(" ")}`;
    die(`step failed: ${full}\nrecovery: ${recoveryHint}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Preflight — runs for both dry-run AND real runs.
// ---------------------------------------------------------------------------

info("preflight: checking repo state");

// git clean?
const status = runCapture("git", ["status", "--porcelain"]);
if (status.length > 0) {
  die(
    `working tree is dirty. Commit, stash, or clean before releasing:\n${status}`,
  );
}

// branch == main?
const branch = runCapture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "main") {
  die(`must be on main branch (currently on ${branch})`);
}

// gh auth?
const gh = tryRun("gh", ["auth", "status"]);
if (gh.status !== 0) {
  die(
    `gh CLI not authenticated. Run 'gh auth login' first.\n${gh.stderr || gh.stdout}`,
  );
}

// compute next version
const pkgPath = path.join(repoRoot, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const current = pkg.version;
const [maj, min, pat] = current.split(".").map((n) => parseInt(n, 10));
let next;
if (args.bump === "patch") next = `${maj}.${min}.${pat + 1}`;
else if (args.bump === "minor") next = `${maj}.${min + 1}.0`;
else next = `${maj + 1}.0.0`;
const nextTag = `v${next}`;

info(`current version: ${current}`);
info(`next version:    ${next}`);
info(`next tag:        ${nextTag}`);

// tag already exists?
const localTag = tryRun("git", ["rev-parse", "--verify", `refs/tags/${nextTag}`]);
if (localTag.status === 0) {
  die(`tag ${nextTag} already exists locally. Delete it or bump past it.`);
}
// check origin — lsRemote is best-effort; network failure here is fatal
// because we need to know before pushing.
const remoteTag = runCapture("git", ["ls-remote", "--tags", "origin", nextTag]);
if (remoteTag.length > 0) {
  die(`tag ${nextTag} already exists on origin. Delete it or bump past it.`);
}

info("preflight: OK");

// ---------------------------------------------------------------------------
// Plan — shared between dry-run and real run.
// ---------------------------------------------------------------------------

const releaseDir = path.join(repoRoot, "release");
const notesPath = args["notes-file"]
  ? path.resolve(args["notes-file"])
  : "(not provided — required for --yes)";

const plan = [
  {
    step: "Run gates",
    detail:
      "npm run rebuild:electron && npm test && npm run lint && npm run build && npm run build:main && npm run build:electron",
    note: "build:electron chains electron-builder + verify:package (boot smoke).",
  },
  {
    step: "Bump version in package.json",
    detail: `npm version ${args.bump} --no-git-tag-version  →  ${next}`,
    note: "also updates package-lock.json; no git tag or commit created by npm.",
  },
  {
    step: "Commit bump",
    detail: `git add package.json package-lock.json && git commit -m "chore: bump version to ${next}"`,
  },
  {
    step: "Push main",
    detail: "git push origin main",
  },
  {
    step: "Create & push tag",
    detail: `git tag ${nextTag} && git push origin ${nextTag}`,
  },
  {
    step: "Create GitHub release",
    detail: `gh release create ${nextTag} --title "Phosphene Electron ${nextTag}" --notes-file ${notesPath} ${releaseDir}/*.dmg ${releaseDir}/*.zip`,
    note: "artifacts come from the local electron-builder output in release/.",
  },
  {
    step: "Post-upload verify",
    detail: `gh release download ${nextTag} -D <tmp> --pattern "*.dmg"  →  hdiutil attach  →  PHOSPHENE_APP_PATH=<mounted>/Phosphene.app/Contents/MacOS/Phosphene node scripts/verify-package.mjs  →  hdiutil detach`,
    note: "re-runs the boot smoke against the ACTUAL uploaded artifact. See 'Post-upload verify caveats' in docs/release.md.",
  },
];

function printPlan() {
  console.log("");
  console.log("========================================================");
  console.log(`  Release plan for ${nextTag}`);
  console.log(`  mode: ${dryRun ? "DRY-RUN (no mutations)" : "LIVE (--yes)"}`);
  console.log("========================================================");
  plan.forEach((p, i) => {
    console.log(`\n  ${i + 1}. ${p.step}`);
    console.log(`     $ ${p.detail}`);
    if (p.note) console.log(`     note: ${p.note}`);
  });
  console.log("");
  console.log("  notes-file: " + notesPath);
  console.log("  artifacts:  " + releaseDir + "/*.{dmg,zip}");
  console.log("========================================================");
  console.log("");
}

printPlan();

if (dryRun) {
  info("DRY-RUN: no mutations performed. Pass --yes (and --notes-file) to publish.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Real run — from here on, everything mutates.
// ---------------------------------------------------------------------------

info("LIVE RUN: starting in 5 seconds. Ctrl-C to abort.");
// Tiny grace period so you have a chance to bail. Not a security feature.
execFileSync("sleep", ["5"], { stdio: "inherit" });

info("step 1/7: running gates");
run("npm", ["run", "rebuild:electron"]);
run("npm", ["test"]);
run("npm", ["run", "lint"]);
run("npm", ["run", "build"]);
run("npm", ["run", "build:main"]);
run("npm", ["run", "build:electron"]); // chains verify:package

// Verify electron-builder actually produced artifacts BEFORE any git mutation.
// If build:electron succeeded but the release/ dir is empty (wrong arch, stale
// config, etc.), we must fail here — not after the bump commit and tag have
// already been pushed. Collect the artifact list once and reuse it at upload
// time so we don't do the work twice.
const artifacts = fs.existsSync(releaseDir)
  ? fs
      .readdirSync(releaseDir)
      .filter((f) => f.endsWith(".dmg") || f.endsWith(".zip"))
      .map((f) => path.join(releaseDir, f))
  : [];
if (artifacts.length === 0) {
  die(
    `no .dmg or .zip artifacts found in ${releaseDir}. Did build:electron succeed? Aborting before any git mutation.`,
  );
}
info(`found ${artifacts.length} artifact(s) for upload:`);
for (const a of artifacts) info(`  ${a}`);

info("step 2/7: bumping version");
run("npm", ["version", args.bump, "--no-git-tag-version"]);

info("step 3/7: committing bump");
runOrDie(
  "git",
  ["add", "package.json", "package-lock.json"],
  "`git checkout -- package.json package-lock.json` to discard the bump.",
);
runOrDie(
  "git",
  ["commit", "-m", `chore: bump version to ${next}`],
  "package.json/package-lock.json may have been modified; `git checkout -- package.json package-lock.json` to discard the bump.",
);

info("step 4/7: pushing main");
runOrDie(
  "git",
  ["push", "origin", "main"],
  `bump commit is at HEAD locally but not pushed; retry with \`git push origin main\` or undo with \`git reset --hard HEAD~1\`.`,
);

info("step 5/7: creating & pushing tag");
runOrDie(
  "git",
  ["tag", nextTag],
  "no recovery needed — nothing was tagged.",
);
// Re-check the remote for the tag RIGHT before pushing it. Between preflight
// and now another maintainer might have created and pushed the same tag; if
// we race past this, `git push origin <tag>` will fail and leave the repo in
// a half-released state.
const remoteTagRecheck = runCapture(
  "git",
  ["ls-remote", "--tags", "origin", `refs/tags/${nextTag}`],
);
if (remoteTagRecheck.length > 0) {
  die(
    `tag ${nextTag} was created on origin by someone else while we were working. ` +
      `Local bump commit is already pushed to main. Resolve manually — likely ` +
      `\`git tag -d ${nextTag}\` locally, then either \`git reset --hard origin/main\` ` +
      `after coordinating with the other maintainer or adopt their tag.`,
  );
}
runOrDie(
  "git",
  ["push", "origin", nextTag],
  `local tag ${nextTag} exists but was not pushed; retry with \`git push origin ${nextTag}\` or delete with \`git tag -d ${nextTag}\`.`,
);

info("step 6/7: creating GitHub release + uploading artifacts");
info(`uploading ${artifacts.length} artifact(s):`);
for (const a of artifacts) info(`  ${a}`);
run("gh", [
  "release",
  "create",
  nextTag,
  "--title",
  `Phosphene Electron ${nextTag}`,
  "--notes-file",
  path.resolve(args["notes-file"]),
  ...artifacts,
]);

info("step 7/7: post-upload verify");
postUploadVerify(nextTag);

info(`DONE. Release ${nextTag} published.`);
const releaseUrl = runCapture("gh", [
  "release",
  "view",
  nextTag,
  "--json",
  "url",
  "-q",
  ".url",
]);
info(`URL: ${releaseUrl}`);

// ---------------------------------------------------------------------------
// Post-upload verify — downloads the uploaded DMG and re-runs verify:package
// against the mounted .app. Failure here is LOUD but does NOT auto-roll-back;
// rolling back a published release is error-prone and the doc covers it.
// ---------------------------------------------------------------------------

function postUploadVerify(tag) {
  if (process.platform !== "darwin") {
    info(
      "post-upload verify: skipped (non-macOS host; cannot mount DMG). See docs/release.md for manual steps.",
    );
    return;
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phosphene-postverify-"));
  try {
    info(`downloading ${tag} DMG into ${tmpDir}`);
    run("gh", [
      "release",
      "download",
      tag,
      "-D",
      tmpDir,
      "--pattern",
      "*.dmg",
    ]);
    const dmg = fs
      .readdirSync(tmpDir)
      .find((f) => f.endsWith(".dmg"));
    if (!dmg) {
      die(
        `post-upload verify: no .dmg downloaded into ${tmpDir}. Manual verify required.`,
      );
    }
    const dmgPath = path.join(tmpDir, dmg);
    info(`mounting ${dmgPath}`);
    // hdiutil attach -plist would be cleaner; parsing the human-readable
    // output with a regex is good enough.
    const attach = runCapture("hdiutil", [
      "attach",
      "-nobrowse",
      "-readonly",
      dmgPath,
    ]);
    const mountLine = attach
      .split("\n")
      .reverse()
      .find((l) => l.includes("/Volumes/"));
    if (!mountLine) {
      die(
        `post-upload verify: couldn't parse hdiutil output:\n${attach}\nManual verify required.`,
      );
    }
    const mountPoint = mountLine.split("\t").pop().trim();
    try {
      const appName = fs.readdirSync(mountPoint).find((f) => f.endsWith(".app"));
      if (!appName) {
        die(
          `post-upload verify: no .app found in ${mountPoint}. Manual verify required.`,
        );
      }
      const binary = path.join(
        mountPoint,
        appName,
        "Contents",
        "MacOS",
        path.basename(appName, ".app"),
      );
      info(`running verify:package against ${binary}`);
      run("node", ["scripts/verify-package.mjs"], {
        env: { ...process.env, PHOSPHENE_APP_PATH: binary },
      });
      info("post-upload verify: OK — uploaded DMG boots cleanly.");
    } finally {
      info(`unmounting ${mountPoint}`);
      tryRun("hdiutil", ["detach", mountPoint]);
    }
  } catch (err) {
    console.error(
      `[release] post-upload verify FAILED. The release is published but the uploaded DMG failed its smoke check.`,
    );
    console.error(
      `[release] Investigate immediately. See docs/release.md "Rollback procedure".`,
    );
    throw err;
  }
}
