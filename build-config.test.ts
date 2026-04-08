// @vitest-environment node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import viteConfig from "./vite.config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

describe("packaged app build config", () => {
  it("uses a relative asset base so the packaged file:// app can load renderer assets", () => {
    expect(viteConfig.base).toBe("./");
  });

  it("brands the application shell as Phosphene", async () => {
    const html = await readFile(path.join(rootDir, "index.html"), "utf8");

    expect(html).toContain("<title>Phosphene</title>");
  });
});
