#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const stages = [
  {
    label: "Node tests (pass 1)",
    command: npmCommand,
    args: ["test"],
  },
  {
    label: "Electron smoke tests",
    command: npmCommand,
    args: ["run", "test:e2e"],
  },
  {
    label: "Node tests (pass 2)",
    command: npmCommand,
    args: ["test"],
  },
];

for (const [index, stage] of stages.entries()) {
  const stageNumber = index + 1;
  console.log(`[verify:runtime-cycle] Stage ${stageNumber}/${stages.length}: ${stage.label}`);
  console.log(`[verify:runtime-cycle] Running: ${stage.command} ${stage.args.join(" ")}`);

  const result = spawnSync(stage.command, stage.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(
      `[verify:runtime-cycle] Stage ${stageNumber}/${stages.length} failed to start: ${result.error.message}`,
    );
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(
      `[verify:runtime-cycle] Stage ${stageNumber}/${stages.length} failed: ${stage.label}`,
    );
    process.exit(result.status ?? 1);
  }

  console.log(`[verify:runtime-cycle] Stage ${stageNumber}/${stages.length} passed`);
}

console.log("[verify:runtime-cycle] Runtime cycle completed successfully");
