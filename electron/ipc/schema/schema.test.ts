import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("initializeSchema", () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "phosphene-schema-test-"));
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

  it("boots a fresh DB end-to-end: tables, WAL mode, and seeded Home workspace", async () => {
    const { initializeSchema, resetSchemaBootstrapForTests } = await import("./index");
    resetSchemaBootstrapForTests();

    initializeSchema(db);

    const journalMode = db.pragma("journal_mode", { simple: true }) as string;
    expect(journalMode.toLowerCase()).toBe("wal");

    const foreignKeys = db.pragma("foreign_keys", { simple: true }) as number;
    expect(foreignKeys).toBe(1);

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

    const workspaces = db
      .prepare("SELECT name, icon, position FROM workspaces WHERE deleted_at IS NULL")
      .all() as { name: string; icon: string; position: number }[];
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]).toEqual({ name: "Home", icon: "\u{1F3E0}", position: 0 });
  });

  it("does not re-seed Home on a second initializeSchema call (idempotency guard)", async () => {
    const { initializeSchema, resetSchemaBootstrapForTests } = await import("./index");
    resetSchemaBootstrapForTests();

    initializeSchema(db);
    const countAfterFirst = (
      db
        .prepare("SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL")
        .get() as { count: number }
    ).count;

    initializeSchema(db);
    const countAfterSecond = (
      db
        .prepare("SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL")
        .get() as { count: number }
    ).count;

    expect(countAfterFirst).toBe(1);
    expect(countAfterSecond).toBe(1);
  });

  it("initializes each database connection independently", async () => {
    const { initializeSchema, resetSchemaBootstrapForTests } = await import("./index");
    resetSchemaBootstrapForTests();

    const secondDb = new Database(":memory:");

    try {
      initializeSchema(db);
      initializeSchema(secondDb);

      const firstCount = (
        db
          .prepare("SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL")
          .get() as { count: number }
      ).count;
      const secondCount = (
        secondDb
          .prepare("SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL")
          .get() as { count: number }
      ).count;

      expect(firstCount).toBe(1);
      expect(secondCount).toBe(1);
    } finally {
      secondDb.close();
    }
  });
});
