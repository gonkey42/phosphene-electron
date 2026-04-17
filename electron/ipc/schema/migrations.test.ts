import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

describe("runMigrations", () => {
  it("runs all migrations from version 0 on a fresh database", async () => {
    const db = new Database(":memory:");
    const { runMigrations, getCurrentVersion } = await import("./migrations");

    runMigrations(db);

    expect(getCurrentVersion(db)).toBe(1);
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
  });

  it("backfills schema_version=1 for a pre-migration database that has workspaces", async () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE workspaces (id TEXT PRIMARY KEY)");
    const { runMigrations, getCurrentVersion } = await import("./migrations");

    runMigrations(db);

    expect(getCurrentVersion(db)).toBe(1);
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
    expect(getCurrentVersion(db)).toBe(1);
  });
});
