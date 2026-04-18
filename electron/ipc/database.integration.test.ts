import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const workspaceRoot = path.resolve(process.cwd());
const tempDirs: string[] = [];
const tempFiles: string[] = [];
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const electronBinary = path.join(
  workspaceRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron",
);

async function createTempDir(): Promise<string> {
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), "phosphene-backup-"));
  tempDirs.push(dirPath);
  return dirPath;
}

async function createRunnerScript(): Promise<string> {
  const scriptDir = await fs.mkdtemp(path.join(workspaceRoot, ".tmp-phosphene-backup-"));
  const scriptPath = path.join(scriptDir, "database-backup-runner.mjs");

  await fs.writeFile(
    scriptPath,
    `
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { backupDatabase, closeDatabase, getDatabase } from ${JSON.stringify(
      path.join(workspaceRoot, "dist-electron", "ipc", "database.js"),
    )};

const userDataDir = process.argv[2];
const backupPath = process.argv[3];
const database = getDatabase(userDataDir);

database.pragma("wal_autocheckpoint = 0");
database.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)");
database.prepare("INSERT INTO notes (body) VALUES (?)").run("before-backup");
database.prepare("INSERT INTO notes (body) VALUES (?)").run("latest-committed-row");

const walStat = await fs.stat(path.join(userDataDir, "phosphene.db-wal"));
const backupResult = await backupDatabase(database, backupPath);
const backupDb = new Database(backupPath, { readonly: true });

try {
  const rows = backupDb.prepare("SELECT body FROM notes ORDER BY id ASC").all();
  process.stdout.write(JSON.stringify({ backupResult, walSize: walStat.size, rows }));
} finally {
  backupDb.close();
  closeDatabase();
}
`,
    "utf8",
  );

  tempDirs.push(scriptDir);
  tempFiles.push(scriptPath);
  return scriptPath;
}

describe("database backup integration", () => {
  beforeAll(async () => {
    await execFile(npmCommand, ["run", "build:main"], {
      cwd: workspaceRoot,
      env: process.env,
    });
  });

  afterEach(async () => {
    await Promise.all(
      tempFiles.splice(0).map((filePath) => fs.rm(filePath, { force: true })),
    );
    await Promise.all(
      tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
    );
  });

  // TODO(cluster-3): un-skip and fix WAL backup race — see plan 2026-04-17-cluster-2, A5
  it.skip("captures the latest committed rows from a WAL-backed database", async () => {
    const userDataDir = await createTempDir();
    const backupsDir = path.join(userDataDir, "backups");
    const backupPath = path.join(backupsDir, "phosphene-2026-03-30.db");
    const runnerScript = await createRunnerScript();

    await fs.mkdir(backupsDir, { recursive: true });

    const { stdout, stderr } = await execFile(electronBinary, [runnerScript, userDataDir, backupPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      },
    });

    expect(stderr).toBe("");

    const result = JSON.parse(stdout) as {
      backupResult: { status: string; destinationPath: string };
      walSize: number;
      rows: Array<{ body: string }>;
    };

    expect(result.backupResult).toEqual({
      status: "created",
      destinationPath: backupPath,
    });
    expect(result.walSize).toBeGreaterThan(0);
    expect(result.rows).toEqual([
      { body: "before-backup" },
      { body: "latest-committed-row" },
    ]);
  });
});
