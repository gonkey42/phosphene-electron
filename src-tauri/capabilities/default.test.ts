import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("default Tauri capability", () => {
  it("includes the filesystem permissions required for backup creation and retention", () => {
    const capability = JSON.parse(
      readFileSync(resolve(process.cwd(), "src-tauri/capabilities/default.json"), "utf8"),
    ) as { permissions: string[] };

    expect(capability.permissions).toContain("fs:allow-copy-file");
    expect(capability.permissions).toContain("fs:allow-read-dir");
    expect(capability.permissions).toContain("fs:allow-remove");
  });
});
