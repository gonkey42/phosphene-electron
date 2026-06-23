import { describe, expect, it } from "vitest";
import { parseImportCliArgs } from "./import-cli";

describe("parseImportCliArgs", () => {
  it("accepts pack and user data directory arguments", () => {
    expect(
      parseImportCliArgs([
        "--pack",
        "/tmp/example-pack",
        "--user-data-dir",
        "/tmp/phosphene-user-data",
      ]),
    ).toEqual({
      packDir: "/tmp/example-pack",
      userDataPath: "/tmp/phosphene-user-data",
      targetWorkspace: { type: "new" },
    });
  });

  it("accepts a target workspace id", () => {
    expect(
      parseImportCliArgs([
        "--pack",
        "/tmp/example-pack",
        "--user-data-dir",
        "/tmp/phosphene-user-data",
        "--target-workspace-id",
        "workspace-1",
      ]),
    ).toEqual({
      packDir: "/tmp/example-pack",
      userDataPath: "/tmp/phosphene-user-data",
      targetWorkspace: { type: "id", id: "workspace-1" },
    });
  });

  it("accepts a target workspace name", () => {
    expect(
      parseImportCliArgs([
        "--pack",
        "/tmp/example-pack",
        "--user-data-dir",
        "/tmp/phosphene-user-data",
        "--target-workspace-name",
        "Vacation Plan",
      ]),
    ).toEqual({
      packDir: "/tmp/example-pack",
      userDataPath: "/tmp/phosphene-user-data",
      targetWorkspace: { type: "name", name: "Vacation Plan" },
    });
  });

  it("accepts the active workspace target", () => {
    expect(
      parseImportCliArgs([
        "--pack",
        "/tmp/example-pack",
        "--user-data-dir",
        "/tmp/phosphene-user-data",
        "--target-active-workspace",
      ]),
    ).toEqual({
      packDir: "/tmp/example-pack",
      userDataPath: "/tmp/phosphene-user-data",
      targetWorkspace: { type: "active" },
    });
  });

  it("rejects conflicting target selectors", () => {
    expect(() =>
      parseImportCliArgs([
        "--pack",
        "/tmp/example-pack",
        "--user-data-dir",
        "/tmp/phosphene-user-data",
        "--target-workspace-id",
        "workspace-1",
        "--target-active-workspace",
      ]),
    ).toThrow("Use only one target workspace selector");
  });

  it("rejects duplicate target workspace selectors", () => {
    expect(() =>
      parseImportCliArgs([
        "--pack",
        "/tmp/example-pack",
        "--user-data-dir",
        "/tmp/phosphene-user-data",
        "--target-workspace-id",
        "workspace-1",
        "--target-workspace-id",
        "workspace-2",
      ]),
    ).toThrow("Use only one target workspace selector");
  });

  it("rejects a missing target workspace id", () => {
    expect(() =>
      parseImportCliArgs([
        "--pack",
        "/tmp/example-pack",
        "--user-data-dir",
        "/tmp/phosphene-user-data",
        "--target-workspace-id",
      ]),
    ).toThrow("Missing required --target-workspace-id <id>");
  });

  it("rejects a blank target workspace id", () => {
    expect(() =>
      parseImportCliArgs([
        "--pack",
        "/tmp/example-pack",
        "--user-data-dir",
        "/tmp/phosphene-user-data",
        "--target-workspace-id",
        "   ",
      ]),
    ).toThrow("Missing required --target-workspace-id <id>");
  });

  it("rejects a blank target workspace name", () => {
    expect(() =>
      parseImportCliArgs([
        "--pack",
        "/tmp/example-pack",
        "--user-data-dir",
        "/tmp/phosphene-user-data",
        "--target-workspace-name",
        "   ",
      ]),
    ).toThrow("Missing required --target-workspace-name <name>");
  });

  it("rejects a missing target workspace name", () => {
    expect(() =>
      parseImportCliArgs([
        "--pack",
        "/tmp/example-pack",
        "--user-data-dir",
        "/tmp/phosphene-user-data",
        "--target-workspace-name",
      ]),
    ).toThrow("Missing required --target-workspace-name <name>");
  });

  it("rejects unknown flags", () => {
    expect(() =>
      parseImportCliArgs([
        "--pack",
        "/tmp/example-pack",
        "--user-data-dir",
        "/tmp/phosphene-user-data",
        "--target-workspace-nam",
        "Vacation Plan",
      ]),
    ).toThrow("Unknown board pack import flag --target-workspace-nam");
  });

  it("rejects missing pack argument", () => {
    expect(() =>
      parseImportCliArgs(["--user-data-dir", "/tmp/phosphene-user-data"]),
    ).toThrow("Missing required --pack <path>");
  });

  it("rejects missing user data directory argument", () => {
    expect(() => parseImportCliArgs(["--pack", "/tmp/example-pack"])).toThrow(
      "Missing required --user-data-dir <path>",
    );
  });

  it("rejects pack argument followed by another flag", () => {
    expect(() =>
      parseImportCliArgs(["--pack", "--user-data-dir", "/tmp/phosphene-user-data"]),
    ).toThrow("Missing required --pack <path>");
  });

  it("rejects user data directory argument followed by another flag", () => {
    expect(() =>
      parseImportCliArgs(["--pack", "/tmp/example-pack", "--user-data-dir", "--extra"]),
    ).toThrow("Missing required --user-data-dir <path>");
  });
});
