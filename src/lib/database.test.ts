import { beforeEach, describe, expect, it, vi } from "vitest";

const loadMock = vi.fn();

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: loadMock,
  },
}));

describe("getDb", () => {
  beforeEach(() => {
    loadMock.mockReset();
    vi.resetModules();
  });

  it("initializes the schema and seeds a default workspace", async () => {
    const executeMock = vi.fn().mockResolvedValue(undefined);
    const selectMock = vi.fn().mockResolvedValue([{ count: 0 }]);
    const dbMock = { execute: executeMock, select: selectMock };
    loadMock.mockResolvedValue(dbMock);

    const { getDb } = await import("./database");
    const db = await getDb();

    expect(db).toBe(dbMock);
    expect(loadMock).toHaveBeenCalledWith("sqlite:phosphene.db");
    expect(executeMock).toHaveBeenCalledWith("PRAGMA journal_mode=WAL");
    expect(executeMock).toHaveBeenCalledWith("PRAGMA foreign_keys=ON");
    expect(
      executeMock.mock.calls.some(([sql]) =>
        String(sql).includes("CREATE TABLE IF NOT EXISTS workspaces"),
      ),
    ).toBe(true);
    expect(selectMock).toHaveBeenCalledWith(
      "SELECT count(*) as count FROM workspaces WHERE deleted_at IS NULL",
    );
    expect(executeMock).toHaveBeenCalledWith(
      "INSERT INTO workspaces (id, name, icon, position) VALUES ($1, $2, $3, $4)",
      expect.arrayContaining([expect.any(String), "Home", "🏠", 0]),
    );
  });

  it("reuses an existing connection after the first load", async () => {
    const executeMock = vi.fn().mockResolvedValue(undefined);
    const selectMock = vi.fn().mockResolvedValue([{ count: 1 }]);
    const dbMock = { execute: executeMock, select: selectMock };
    loadMock.mockResolvedValue(dbMock);

    const { getDb } = await import("./database");
    const first = await getDb();
    const second = await getDb();

    expect(first).toBe(second);
    expect(loadMock).toHaveBeenCalledTimes(1);
  });
});
