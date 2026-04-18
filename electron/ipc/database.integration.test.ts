import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { backupDatabase } from "./database";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), "phosphene-backup-"));
  tempDirs.push(dirPath);
  return dirPath;
}

describe("database backup integration", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
    );
  });

  it("captures the latest committed rows from a WAL-backed database", async () => {
    const userDataDir = await createTempDir();
    const backupsDir = path.join(userDataDir, "backups");
    const backupPath = path.join(backupsDir, "phosphene-2026-03-30.db");
    const dbPath = path.join(userDataDir, "phosphene.db");
    const database = new Database(dbPath);

    await fs.mkdir(backupsDir, { recursive: true });
    database.pragma("journal_mode = WAL");
    database.pragma("wal_autocheckpoint = 0");
    database.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)");
    database.prepare("INSERT INTO notes (body) VALUES (?)").run("before-backup");
    database.prepare("INSERT INTO notes (body) VALUES (?)").run("latest-committed-row");

    const walStat = await fs.stat(path.join(userDataDir, "phosphene.db-wal"));
    const backupResult = await backupDatabase(database, backupPath);
    const backupDb = new Database(backupPath, { readonly: true });

    const result: {
      backupResult: { status: string; destinationPath: string };
      walSize: number;
      rows: Array<{ body: string }>;
    } = {
      backupResult,
      walSize: walStat.size,
      rows: backupDb.prepare("SELECT body FROM notes ORDER BY id ASC").all() as Array<{ body: string }>,
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

    backupDb.close();
    database.close();
  });
});
