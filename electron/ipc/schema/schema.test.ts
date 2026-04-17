import { beforeEach, describe, expect, it, vi } from "vitest";

const execMock = vi.fn();
const pragmaMock = vi.fn();
const prepareMock = vi.fn();
const getMock = vi.fn();
const runMock = vi.fn();
const transactionMock = vi.fn();

function makeDb() {
  return {
    pragma: pragmaMock,
    exec: execMock,
    prepare: prepareMock,
    transaction: transactionMock,
  };
}

describe("initializeSchema", () => {
  beforeEach(() => {
    vi.resetModules();
    execMock.mockReset();
    pragmaMock.mockReset();
    prepareMock.mockReset().mockReturnValue({ get: getMock, run: runMock });
    // getCurrentVersion returns 0, hasWorkspaces returns undefined (fresh DB),
    // workspace count returns 0 (triggers Home seed).
    getMock
      .mockReset()
      .mockReturnValueOnce({ version: null })
      .mockReturnValueOnce(undefined)
      .mockReturnValue({ count: 0 });
    runMock.mockReset();
    transactionMock.mockReset().mockImplementation((fn: () => void) => fn);
  });

  it("delegates to runMigrations and seeds the Home workspace", async () => {
    const { initializeSchema, resetSchemaBootstrapForTests } = await import("./index");
    resetSchemaBootstrapForTests();
    initializeSchema(makeDb() as never);

    // schema_version table creation implies runMigrations ran
    const allSql = execMock.mock.calls.map((c) => c[0] as string).join("\n");
    expect(allSql).toContain("schema_version");

    // Home workspace seeded
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
