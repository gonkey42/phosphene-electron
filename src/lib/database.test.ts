import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.fn();
const selectMock = vi.fn();

vi.mock("../platform/desktop-api", () => ({
  db: {
    execute: executeMock,
    select: selectMock,
  },
}));

describe("getDb", () => {
  beforeEach(() => {
    executeMock.mockReset().mockResolvedValue({ rowsAffected: 0 });
    selectMock.mockReset();
    vi.resetModules();
  });

  it("initializes the schema and seeds a default workspace", async () => {
    selectMock.mockResolvedValue([{ count: 0 }]);

    const { getDb } = await import("./database");
    const db = await getDb();

    expect(db).toBeDefined();
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
      expect.arrayContaining([expect.any(String), "Home", "\u{1F3E0}", 0]),
    );
  });

  it("reuses an existing connection after the first load", async () => {
    selectMock.mockResolvedValue([{ count: 1 }]);

    const { getDb } = await import("./database");
    const first = await getDb();
    const second = await getDb();

    expect(first).toBe(second);
  });
});
