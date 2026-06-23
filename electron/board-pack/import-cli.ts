import { importBoardPack } from "./importer";
import type { BoardPackWorkspaceTarget } from "./workspace-target";

export type ImportCliArgs = {
  packDir: string;
  userDataPath: string;
  targetWorkspace: BoardPackWorkspaceTarget;
};

function getRequiredFlagValue(argv: string[], flag: string, errorMessage: string): string {
  const flagIndex = argv.indexOf(flag);
  const value = argv[flagIndex + 1];

  if (flagIndex < 0 || !value || value.startsWith("--") || value.trim() === "") {
    throw new Error(errorMessage);
  }

  return value.trim();
}

const KNOWN_FLAGS = new Set([
  "--pack",
  "--user-data-dir",
  "--target-workspace-id",
  "--target-workspace-name",
  "--target-active-workspace",
]);

function assertKnownFlags(argv: string[]): void {
  for (const arg of argv) {
    if (arg.startsWith("--") && !KNOWN_FLAGS.has(arg)) {
      throw new Error(`Unknown board pack import flag ${arg}`);
    }
  }
}

function countFlagOccurrences(argv: string[], flag: string): number {
  return argv.filter((arg) => arg === flag).length;
}

function parseTargetWorkspace(argv: string[]): BoardPackWorkspaceTarget {
  const targetWorkspaceIdCount = countFlagOccurrences(argv, "--target-workspace-id");
  const targetWorkspaceNameCount = countFlagOccurrences(argv, "--target-workspace-name");
  const targetActiveWorkspaceCount = countFlagOccurrences(argv, "--target-active-workspace");
  const targetSelectorCount =
    targetWorkspaceIdCount + targetWorkspaceNameCount + targetActiveWorkspaceCount;

  if (targetSelectorCount > 1) {
    throw new Error("Use only one target workspace selector");
  }

  const targetWorkspaceId = targetWorkspaceIdCount === 1
    ? getRequiredFlagValue(
        argv,
        "--target-workspace-id",
        "Missing required --target-workspace-id <id>",
      )
    : null;
  const targetWorkspaceName = targetWorkspaceNameCount === 1
    ? getRequiredFlagValue(
        argv,
        "--target-workspace-name",
        "Missing required --target-workspace-name <name>",
      )
    : null;

  if (targetWorkspaceId !== null) {
    return { type: "id", id: targetWorkspaceId };
  }

  if (targetWorkspaceName !== null) {
    return { type: "name", name: targetWorkspaceName };
  }

  if (targetActiveWorkspaceCount === 1) {
    return { type: "active" };
  }

  return { type: "new" };
}

export function parseImportCliArgs(argv: string[]): ImportCliArgs {
  const packDir = getRequiredFlagValue(argv, "--pack", "Missing required --pack <path>");
  const userDataPath = getRequiredFlagValue(
    argv,
    "--user-data-dir",
    "Missing required --user-data-dir <path>",
  );

  assertKnownFlags(argv);

  return {
    packDir,
    userDataPath,
    targetWorkspace: parseTargetWorkspace(argv),
  };
}

async function main(): Promise<void> {
  try {
    const { packDir, userDataPath, targetWorkspace } = parseImportCliArgs(process.argv.slice(2));
    const result = await importBoardPack({ packDir, userDataPath, targetWorkspace });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
