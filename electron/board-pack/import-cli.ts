import { importBoardPack } from "./importer";
import type { BoardPackWorkspaceTarget } from "./workspace-target";

export type ImportCliArgs = {
  packDir: string;
  userDataPath: string;
  targetWorkspace: BoardPackWorkspaceTarget;
};

const KNOWN_FLAGS = new Set([
  "--pack",
  "--user-data-dir",
  "--target-workspace-id",
  "--target-workspace-name",
  "--target-active-workspace",
]);
const VALUE_FLAGS = new Set([
  "--pack",
  "--user-data-dir",
  "--target-workspace-id",
  "--target-workspace-name",
]);
const TARGET_SELECTOR_FLAGS = new Set([
  "--target-workspace-id",
  "--target-workspace-name",
  "--target-active-workspace",
]);
const INLINE_VALUE_FLAGS = new Set(["--target-workspace-name"]);

type ParsedImportFlags = {
  packDir: string | null;
  userDataPath: string | null;
  targetWorkspaceId: string | null;
  targetWorkspaceName: string | null;
  targetActiveWorkspace: boolean;
};

type ParsedFlagArgument = {
  flag: string;
  inlineValue: string | null;
};

function parseFlagArgument(arg: string): ParsedFlagArgument {
  const separatorIndex = arg.indexOf("=");

  if (separatorIndex < 0) {
    return { flag: arg, inlineValue: null };
  }

  const flag = arg.slice(0, separatorIndex);

  if (!INLINE_VALUE_FLAGS.has(flag)) {
    return { flag: arg, inlineValue: null };
  }

  return {
    flag,
    inlineValue: arg.slice(separatorIndex + 1),
  };
}

function getMissingValueMessage(flag: string): string {
  switch (flag) {
    case "--pack":
      return "Missing required --pack <path>";
    case "--user-data-dir":
      return "Missing required --user-data-dir <path>";
    case "--target-workspace-id":
      return "Missing required --target-workspace-id <id>";
    case "--target-workspace-name":
      return "Missing required --target-workspace-name <name>";
    default:
      return `Missing required value for ${flag}`;
  }
}

function normalizeFlagValue(flag: string, value: string): string {
  if (value.trim() === "") {
    throw new Error(getMissingValueMessage(flag));
  }

  return flag === "--target-workspace-name" ? value : value.trim();
}

function setParsedFlagValue(
  parsedFlags: ParsedImportFlags,
  flag: string,
  value: string,
): void {
  switch (flag) {
    case "--pack":
      parsedFlags.packDir = value;
      return;
    case "--user-data-dir":
      parsedFlags.userDataPath = value;
      return;
    case "--target-workspace-id":
      parsedFlags.targetWorkspaceId = value;
      return;
    case "--target-workspace-name":
      parsedFlags.targetWorkspaceName = value;
      return;
    default:
      throw new Error(`Unknown board pack import flag ${flag}`);
  }
}

function parseFlags(argv: string[]): ParsedImportFlags {
  const parsedFlags: ParsedImportFlags = {
    packDir: null,
    userDataPath: null,
    targetWorkspaceId: null,
    targetWorkspaceName: null,
    targetActiveWorkspace: false,
  };
  const seenFlags = new Set<string>();
  let targetSelectorCount = 0;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const { flag, inlineValue } = parseFlagArgument(arg);

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected board pack import argument ${arg}`);
    }

    if (!KNOWN_FLAGS.has(flag)) {
      throw new Error(`Unknown board pack import flag ${arg}`);
    }

    if (TARGET_SELECTOR_FLAGS.has(flag)) {
      targetSelectorCount += 1;
      if (targetSelectorCount > 1) {
        throw new Error("Use only one target workspace selector");
      }
    } else if (seenFlags.has(flag)) {
      throw new Error(`Duplicate board pack import flag ${flag}`);
    }

    if (TARGET_SELECTOR_FLAGS.has(flag) && seenFlags.has(flag)) {
      throw new Error("Use only one target workspace selector");
    }

    seenFlags.add(flag);

    if (!VALUE_FLAGS.has(flag)) {
      parsedFlags.targetActiveWorkspace = true;
      continue;
    }

    if (inlineValue !== null) {
      setParsedFlagValue(parsedFlags, flag, normalizeFlagValue(flag, inlineValue));
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(getMissingValueMessage(flag));
    }

    setParsedFlagValue(parsedFlags, flag, normalizeFlagValue(flag, value));
    index += 1;
  }

  return parsedFlags;
}

function parseTargetWorkspace(parsedFlags: ParsedImportFlags): BoardPackWorkspaceTarget {
  if (parsedFlags.targetWorkspaceId !== null) {
    return { type: "id", id: parsedFlags.targetWorkspaceId };
  }

  if (parsedFlags.targetWorkspaceName !== null) {
    return { type: "name", name: parsedFlags.targetWorkspaceName };
  }

  if (parsedFlags.targetActiveWorkspace) {
    return { type: "active" };
  }

  return { type: "new" };
}

export function parseImportCliArgs(argv: string[]): ImportCliArgs {
  const parsedFlags = parseFlags(argv);
  const { packDir, userDataPath } = parsedFlags;

  if (packDir === null) {
    throw new Error("Missing required --pack <path>");
  }

  if (userDataPath === null) {
    throw new Error("Missing required --user-data-dir <path>");
  }

  return {
    packDir,
    userDataPath,
    targetWorkspace: parseTargetWorkspace(parsedFlags),
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
