import { beforeEach, describe, expect, it, vi } from "vitest";

const execMock = vi.fn();
const pragmaMock = vi.fn();
const prepareMock = vi.fn();
const getMock = vi.fn();
const runMock = vi.fn();

function makeDb() {
  return {
    pragma: pragmaMock,
    exec: execMock,
    prepare: prepareMock,
  };
}

describe("initializeSchema", () => {
  beforeEach(() => {
    vi.resetModules();
    execMock.mockReset();
    pragmaMock.mockReset();
    prepareMock.mockReset().mockReturnValue({ get: getMock, run: runMock });
    getMock.mockReset().mockReturnValue({ count: 0 });
    runMock.mockReset();
  });

  it("enables WAL and foreign keys before creating tables", async () => {
    const { initializeSchema, resetSchemaBootstrapForTests } = await import("./index");
    resetSchemaBootstrapForTests();
    initializeSchema(makeDb() as never);

    expect(pragmaMock).toHaveBeenNthCalledWith(1, "journal_mode = WAL");
    expect(pragmaMock).toHaveBeenNthCalledWith(2, "foreign_keys = ON");
    expect(execMock.mock.calls[0][0]).toContain("CREATE TABLE IF NOT EXISTS workspaces");
  });

  it("seeds a Home workspace when empty", async () => {
    const { initializeSchema, resetSchemaBootstrapForTests } = await import("./index");
    resetSchemaBootstrapForTests();
    initializeSchema(makeDb() as never);
    expect(runMock).toHaveBeenCalledWith(expect.any(String), "Home", "\u{1F3E0}", 0);
  });

  it("does not re-bootstrap on second call", async () => {
    const { initializeSchema, resetSchemaBootstrapForTests } = await import("./index");
    resetSchemaBootstrapForTests();
    initializeSchema(makeDb() as never);
    const execCallCount = execMock.mock.calls.length;
    initializeSchema(makeDb() as never);
    expect(execMock.mock.calls.length).toBe(execCallCount);
  });
});
