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

  it("reuses the cached database proxy across calls", async () => {
    const { getDb } = await import("./database");
    const first = await getDb();
    const second = await getDb();

    expect(first).toBe(second);
  });
});
