import { importBoardPack } from "./importer";

export type ImportCliArgs = {
  packDir: string;
  userDataPath: string;
};

function getRequiredFlagValue(argv: string[], flag: string, errorMessage: string): string {
  const flagIndex = argv.indexOf(flag);
  const value = argv[flagIndex + 1];

  if (flagIndex < 0 || !value || value.startsWith("--")) {
    throw new Error(errorMessage);
  }

  return value;
}

export function parseImportCliArgs(argv: string[]): ImportCliArgs {
  return {
    packDir: getRequiredFlagValue(argv, "--pack", "Missing required --pack <path>"),
    userDataPath: getRequiredFlagValue(
      argv,
      "--user-data-dir",
      "Missing required --user-data-dir <path>",
    ),
  };
}

async function main(): Promise<void> {
  try {
    const { packDir, userDataPath } = parseImportCliArgs(process.argv.slice(2));
    const result = await importBoardPack({ packDir, userDataPath });
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
