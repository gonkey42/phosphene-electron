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
    });
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
