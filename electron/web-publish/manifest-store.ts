import fs from "node:fs/promises";
import path from "node:path";
import { WEB_PUBLISH_HOSTNAME, WEB_PUBLISH_PROJECT_NAME, type WebPublishManifest } from "./types";

export const DEFAULT_WEB_PUBLISH_MANIFEST: WebPublishManifest = {
  schemaVersion: 1,
  projectName: WEB_PUBLISH_PROJECT_NAME,
  hostname: WEB_PUBLISH_HOSTNAME,
  workspaces: {},
  failedWorkspaces: {},
};

function createDefaultWebPublishManifest(): WebPublishManifest {
  return {
    ...DEFAULT_WEB_PUBLISH_MANIFEST,
    workspaces: {},
    failedWorkspaces: {},
  };
}

export function getWebPublishRoot(userDataPath: string): string {
  return path.join(userDataPath, "web-publish");
}

export function getWebPublishManifestPath(userDataPath: string): string {
  return path.join(getWebPublishRoot(userDataPath), "manifest.json");
}

export async function readWebPublishManifest(userDataPath: string): Promise<WebPublishManifest> {
  try {
    const raw = await fs.readFile(getWebPublishManifestPath(userDataPath), "utf8");
    const parsed = JSON.parse(raw) as WebPublishManifest;

    if (
      parsed.schemaVersion !== 1 ||
      typeof parsed.workspaces !== "object" ||
      parsed.workspaces === null ||
      Array.isArray(parsed.workspaces) ||
      (parsed.failedWorkspaces !== undefined &&
        (typeof parsed.failedWorkspaces !== "object" ||
          parsed.failedWorkspaces === null ||
          Array.isArray(parsed.failedWorkspaces)))
    ) {
      throw new Error("Unsupported web publish manifest format");
    }

    return {
      ...parsed,
      failedWorkspaces: parsed.failedWorkspaces ?? {},
    };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return createDefaultWebPublishManifest();
    }

    throw error;
  }
}

export async function writeWebPublishManifest(
  userDataPath: string,
  manifest: WebPublishManifest,
): Promise<void> {
  const manifestPath = getWebPublishManifestPath(userDataPath);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
