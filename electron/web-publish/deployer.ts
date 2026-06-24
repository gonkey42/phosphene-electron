import { spawn } from "node:child_process";
import path from "node:path";

export type CommandResult = {
  stdout: string;
  stderr: string;
};

export type CommandOptions = {
  cwd?: string;
};

export type RunCommand = (
  command: string,
  args: string[],
  options?: CommandOptions,
) => Promise<CommandResult>;

export type DeployWebPublishSiteOptions = {
  outputDir: string;
  projectName: string;
  runCommand?: RunCommand;
};

const GUI_APP_COMMAND_PATHS = ["/opt/homebrew/bin", "/usr/local/bin"];

export function createWebPublishCommandEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const pathParts = (baseEnv.PATH ?? "").split(path.delimiter).filter(Boolean);
  const PATH = [...new Set([...GUI_APP_COMMAND_PATHS, ...pathParts])].join(path.delimiter);

  return { ...baseEnv, PATH };
}

function defaultRunCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: createWebPublishCommandEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`Wrangler deploy failed with exit code ${code}: ${stderr || stdout}`));
    });
  });
}

export async function deployWebPublishSite({
  outputDir,
  projectName,
  runCommand = defaultRunCommand,
}: DeployWebPublishSiteOptions): Promise<{ deploymentUrl: string | null }> {
  const result = await runCommand("npx", [
    "wrangler",
    "pages",
    "deploy",
    outputDir,
    "--project-name",
    projectName,
    "--branch",
    "main",
  ], {
    cwd: path.dirname(outputDir),
  });
  const deploymentUrl = result.stdout.match(/https:\/\/\S+/)?.[0] ?? null;

  return { deploymentUrl };
}
