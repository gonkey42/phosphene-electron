import { beforeEach, describe, expect, it, vi } from "vitest";

const handleMock = vi.fn();
const prepareMock = vi.fn();
const runMock = vi.fn();
const allMock = vi.fn();
const pragmaMock = vi.fn();
const closeMock = vi.fn();
const databaseConstructorMock = vi.fn();

vi.mock("electron", () => ({
  ipcMain: {
    handle: handleMock,
  },
}));

vi.mock("better-sqlite3", () => {
  const DatabaseMock = function (this: object, filePath: string) {
    databaseConstructorMock(filePath);
    return {
      pragma: pragmaMock,
      prepare: prepareMock,
      close: closeMock,
    };
  };

  return { default: DatabaseMock };
});

describe("registerDatabaseIPC", () => {
  beforeEach(() => {
    vi.resetModules();
    handleMock.mockReset();
    prepareMock.mockReset();
    runMock.mockReset();
    allMock.mockReset();
    pragmaMock.mockReset();
    closeMock.mockReset();
    databaseConstructorMock.mockReset();

    prepareMock.mockReturnValue({
      run: runMock,
      all: allMock,
    });
    runMock.mockReturnValue({ changes: 1 });
    allMock.mockReturnValue([]);
  });

  it("reorders positional parameters to match placeholder order for execute handlers", async () => {
    const { registerDatabaseIPC } = await import("./database");

    registerDatabaseIPC("/app/data");

    const executeHandler = handleMock.mock.calls.find(([channel]) => channel === "db:execute")?.[1];

    expect(executeHandler).toBeTypeOf("function");

    executeHandler(
      {},
      "UPDATE boards SET name = $2, canvas_data = $3 WHERE id = $1 AND deleted_at IS NULL",
      ["board-1", "Updated board", "{\"type\":\"excalidraw\"}"],
    );

    expect(prepareMock).toHaveBeenCalledWith(
      "UPDATE boards SET name = ?, canvas_data = ? WHERE id = ? AND deleted_at IS NULL",
    );
    expect(runMock).toHaveBeenCalledWith(
      "Updated board",
      "{\"type\":\"excalidraw\"}",
      "board-1",
    );
  });
});
