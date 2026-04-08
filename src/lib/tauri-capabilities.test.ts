import defaultCapability from "../../src-tauri/capabilities/default.json";
import { describe, expect, it } from "vitest";

describe("tauri fs capability", () => {
  it("grants the file-specific app data permissions required for image extraction", () => {
    expect(defaultCapability.permissions).toEqual(
      expect.arrayContaining([
        "fs:scope-appdata-recursive",
        "fs:allow-exists",
        "fs:allow-mkdir",
        "fs:allow-read-file",
        "fs:allow-write-file",
      ]),
    );
  });

  it("grants recursive home-directory read access for Finder-dropped source images", () => {
    expect(defaultCapability.permissions).toEqual(
      expect.arrayContaining(["fs:allow-home-read-recursive"]),
    );
  });
});
