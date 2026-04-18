import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("runMigrations", () => {
  it("runs all migrations from version 0 on a fresh database", async () => {
    const db = new Database(":memory:");
    const { runMigrations, getCurrentVersion } = await import("./migrations");

    runMigrations(db);

    expect(getCurrentVersion(db)).toBe(2);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toEqual(
      expect.arrayContaining([
        "workspaces",
        "boards",
        "files",
        "captures",
        "settings",
        "schema_version",
      ]),
    );

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%_idx'")
      .all() as { name: string }[];
    expect(indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        "boards_workspace_id_idx",
        "boards_position_idx",
        "boards_deleted_at_idx",
        "files_board_id_idx",
        "captures_board_id_idx",
        "workspaces_position_idx",
        "workspaces_deleted_at_idx",
      ]),
    );
  });

  it("backfills a v0.2.1 database to the latest version and adds hot-path indexes", async () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        layout_config TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
        deleted_at TEXT,
        device_id TEXT
      );
      CREATE TABLE boards (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        canvas_data TEXT,
        thumbnail TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
        deleted_at TEXT,
        device_id TEXT,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      );
      CREATE TABLE files (
        id TEXT PRIMARY KEY,
        board_id TEXT,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type TEXT,
        file_size INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
        deleted_at TEXT,
        device_id TEXT,
        FOREIGN KEY (board_id) REFERENCES boards(id)
      );
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        content_type TEXT NOT NULL,
        content TEXT NOT NULL,
        source_url TEXT,
        board_id TEXT,
        processed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
        deleted_at TEXT,
        device_id TEXT,
        FOREIGN KEY (board_id) REFERENCES boards(id)
      );
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now','utc'))
      );
    `);
    const { runMigrations, getCurrentVersion } = await import("./migrations");

    runMigrations(db);

    expect(getCurrentVersion(db)).toBe(2);
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%_idx'")
      .all() as { name: string }[];
    expect(indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        "boards_workspace_id_idx",
        "boards_position_idx",
        "boards_deleted_at_idx",
        "files_board_id_idx",
        "captures_board_id_idx",
        "workspaces_position_idx",
        "workspaces_deleted_at_idx",
      ]),
    );
  });

  it("is idempotent — second run does not re-execute migrations", async () => {
    const db = new Database(":memory:");
    const { runMigrations, getCurrentVersion } = await import("./migrations");

    runMigrations(db);
    const rows1 = db
      .prepare("SELECT count(*) as n FROM schema_version")
      .get() as { n: number };
    runMigrations(db);
    const rows2 = db
      .prepare("SELECT count(*) as n FROM schema_version")
      .get() as { n: number };

    expect(rows1.n).toBe(rows2.n);
    expect(getCurrentVersion(db)).toBe(2);
  });
});

describe("applyConnectionPragmas + runMigrations on a file-backed DB", () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "phosphene-migrations-test-"));
    dbPath = join(tempDir, "test.db");
    db = new Database(dbPath);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("completes bootstrap against a real file-backed DB and enables WAL (regression guard for pragma-inside-transaction crash)", async () => {
    const { applyConnectionPragmas, runMigrations } = await import("./migrations");

    expect(() => {
      applyConnectionPragmas(db);
      runMigrations(db);
    }).not.toThrow();

    const journalMode = db.pragma("journal_mode", { simple: true }) as string;
    expect(journalMode.toLowerCase()).toBe("wal");
  });
});
