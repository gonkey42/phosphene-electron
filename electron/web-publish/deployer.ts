import { spawn } from "node:child_process";

export type CommandResult = {
  stdout: string;
  stderr: string;
};

export type RunCommand = (command: string, args: string[]) => Promise<CommandResult>;

export type DeployWebPublishSiteOptions = {
  outputDir: string;
  projectName: string;
  runCommand?: RunCommand;
};

function defaultRunCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
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
  ]);
  const deploymentUrl = result.stdout.match(/https:\/\/\S+/)?.[0] ?? null;

  return { deploymentUrl };
}
