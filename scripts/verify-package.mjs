#!/usr/bin/env node
// Post-package smoke check: launches the packaged Phosphene binary, captures
// stdout/stderr for ~15s with ELECTRON_ENABLE_LOGGING=1, and fails if we see
// known-bad signals (bootstrap:error, NODE_MODULE_VERSION mismatch, native
// module load errors) or the app exits early with a non-zero code.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_APP_PATH = "release/mac-arm64/Phosphene.app/Contents/MacOS/Phosphene";
const BOOT_WINDOW_MS = 15_000;
const EARLY_EXIT_MS = 10_000;
const FAIL_PATTERNS = ["bootstrap:error", "NODE_MODULE_VERSION", "Error: The module"];

const appPath = process.env.PHOSPHENE_APP_PATH || DEFAULT_APP_PATH;
const absAppPath = path.resolve(appPath);

if (!fs.existsSync(absAppPath)) {
  console.error(`[verify:package] Binary not found at ${absAppPath}`);
  console.error(`[verify:package] Did you run electron-builder first? Set PHOSPHENE_APP_PATH to override.`);
  process.exit(1);
}

const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), "phosphene-verify-"));
console.log(`[verify:package] Launching ${absAppPath}`);
console.log(`[verify:package] userData dir: ${tmpUserData}`);

let cleanedUp = false;
function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  try {
    fs.rmSync(tmpUserData, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[verify:package] Failed to remove ${tmpUserData}: ${err.message}`);
  }
}

const child = spawn(absAppPath, [`--user-data-dir=${tmpUserData}`], {
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

const startTime = Date.now();
let buffer = "";
let scanStart = 0;
let settled = false;
let timeoutHandle = null;
const maxPatternLen = FAIL_PATTERNS.reduce((n, p) => Math.max(n, p.length), 0);

function finish(exitCode, reason) {
  if (settled) return;
  settled = true;
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
  if (!child.killed && child.exitCode === null) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  cleanup();
  if (reason) {
    if (exitCode === 0) {
      console.log(`[verify:package] ${reason}`);
    } else {
      console.error(`[verify:package] ${reason}`);
    }
  }
  process.exit(exitCode);
}

function scan(chunk) {
  const chunkLen = chunk.length;
  buffer += chunk;
  // keep buffer bounded so memory can't blow up
  if (buffer.length > 256 * 1024) {
    const dropped = buffer.length - 128 * 1024;
    buffer = buffer.slice(-128 * 1024);
    scanStart = Math.max(0, scanStart - dropped);
  }
  // Scan over buffer starting a bit before the newly-appended region so a
  // pattern split across two chunks is still caught. Overlap by maxPatternLen.
  const from = Math.max(scanStart, buffer.length - chunkLen - maxPatternLen);
  for (const pattern of FAIL_PATTERNS) {
    const idx = buffer.indexOf(pattern, from);
    if (idx !== -1) {
      const line = buffer.slice(Math.max(0, idx - 80), idx + pattern.length + 200).trim();
      console.error(`[verify:package] FAIL: matched pattern ${JSON.stringify(pattern)}`);
      console.error(`[verify:package] context: ${line}`);
      console.error(`[verify:package] --- output tail ---\n${buffer.slice(-4000)}\n--- end ---`);
      finish(1, `smoke check failed: ${pattern}`);
      return;
    }
  }
  scanStart = buffer.length;
}

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", scan);
child.stderr.on("data", scan);

child.on("error", (err) => {
  console.error(`[verify:package] spawn error: ${err.message}`);
  finish(1, "failed to spawn binary");
});

child.on("exit", (code, signal) => {
  if (settled) return;
  const elapsed = Date.now() - startTime;
  if (signal === "SIGTERM") {
    // killed by our timeout path; finish() will have been called
    return;
  }
  if (elapsed < EARLY_EXIT_MS && (code !== 0 || signal)) {
    console.error(`[verify:package] App exited early (${elapsed}ms) with code ${code}${signal ? ` signal ${signal}` : ""}`);
    console.error(`[verify:package] --- output tail ---\n${buffer.slice(-4000)}\n--- end ---`);
    finish(1, `app exited after ${elapsed}ms (code=${code}${signal ? `, signal=${signal}` : ""})`);
    return;
  }
  // clean early exit (e.g., app closed itself without error) — treat as pass
  finish(0, `app exited cleanly after ${elapsed}ms, no bad signals seen`);
});

timeoutHandle = setTimeout(() => {
  // Drain the buffer one more time before declaring pass — a failure line
  // that landed in the race between timer fire and SIGTERM would otherwise
  // be lost once settled=true. Rewind scanStart so scan() re-examines the
  // buffer tail from scratch.
  scanStart = 0;
  scan("");
  if (settled) return;
  finish(0, `boot looked clean (${BOOT_WINDOW_MS}ms elapsed, no bad signals)`);
}, BOOT_WINDOW_MS);

// Defensive: handle Ctrl-C so we don't leak temp dirs
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    finish(130, `received ${sig}`);
  });
}
