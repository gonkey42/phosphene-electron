import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_WEB_PUBLISH_MANIFEST,
  readWebPublishManifest,
  writeWebPublishManifest,
} from "./manifest-store";

const tempDirs: string[] = [];

async function createTempUserDataPath(): Promise<string> {
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), "phosphene-web-publish-"));
  tempDirs.push(dirPath);
  return dirPath;
}

describe("web publish manifest store", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
    );
  });

  it("returns the default manifest when none exists", async () => {
    const userDataPath = await createTempUserDataPath();
    await expect(readWebPublishManifest(userDataPath)).resolves.toEqual(
      DEFAULT_WEB_PUBLISH_MANIFEST,
    );
  });

  it("returns a fresh default manifest when none exists", async () => {
    const firstUserDataPath = await createTempUserDataPath();
    const secondUserDataPath = await createTempUserDataPath();
    const firstManifest = await readWebPublishManifest(firstUserDataPath);

    firstManifest.workspaces.workspace_1 = {
      workspaceId: "workspace_1",
      slug: "trip",
      name: "Trip",
      sourceFingerprint: "fingerprint-1",
      publishedAt: "2026-06-24T01:00:00.000Z",
      lastDeploymentUrl: null,
      lastError: null,
    };

    const secondManifest = await readWebPublishManifest(secondUserDataPath);

    expect(secondManifest.workspaces).toEqual({});
  });

  it("round-trips published workspace state", async () => {
    const userDataPath = await createTempUserDataPath();
    const manifest = {
      ...DEFAULT_WEB_PUBLISH_MANIFEST,
      workspaces: {
        workspace_1: {
          workspaceId: "workspace_1",
          slug: "trip",
          name: "Trip",
          sourceFingerprint: "fingerprint-1",
          publishedAt: "2026-06-24T01:00:00.000Z",
          lastDeploymentUrl: "https://phosphene.gonkey.org",
          lastError: null,
        },
      },
    };

    await writeWebPublishManifest(userDataPath, manifest);
    await expect(readWebPublishManifest(userDataPath)).resolves.toEqual(manifest);
  });

  it("rejects unsupported workspaces shapes", async () => {
    const userDataPath = await createTempUserDataPath();
    const manifestPath = path.join(userDataPath, "web-publish", "manifest.json");
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });

    await fs.writeFile(
      manifestPath,
      JSON.stringify({ ...DEFAULT_WEB_PUBLISH_MANIFEST, workspaces: null }),
      "utf8",
    );
    await expect(readWebPublishManifest(userDataPath)).rejects.toThrow(
      "Unsupported web publish manifest format",
    );

    await fs.writeFile(
      manifestPath,
      JSON.stringify({ ...DEFAULT_WEB_PUBLISH_MANIFEST, workspaces: [] }),
      "utf8",
    );
    await expect(readWebPublishManifest(userDataPath)).rejects.toThrow(
      "Unsupported web publish manifest format",
    );
  });
});
