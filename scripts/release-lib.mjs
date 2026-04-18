import fs from "node:fs";
import path from "node:path";

export function collectReleaseArtifacts(releaseDir, version) {
  if (!fs.existsSync(releaseDir)) {
    throw new Error(
      `no .dmg or .zip artifacts found in ${releaseDir} for version ${version}. Did build:electron succeed?`,
    );
  }

  const versionToken = `-${version}-`;
  const artifacts = fs
    .readdirSync(releaseDir)
    .filter((filename) => {
      return (
        filename.includes(versionToken) &&
        (filename.endsWith(".dmg") || filename.endsWith(".zip"))
      );
    })
    .sort()
    .map((filename) => path.join(releaseDir, filename));

  if (artifacts.length === 0) {
    throw new Error(
      `no .dmg or .zip artifacts found in ${releaseDir} for version ${version}. Did build:electron succeed?`,
    );
  }

  return artifacts;
}
