import { describe, expect, it, vi } from "vitest";
import { deployWebPublishSite } from "./deployer";

describe("deployWebPublishSite", () => {
  it("runs wrangler pages deploy for the phosphene project", async () => {
    const run = vi.fn().mockResolvedValue({
      stdout: "Deployment complete! https://abc.phosphene.pages.dev",
      stderr: "",
    });

    await expect(
      deployWebPublishSite({
        outputDir: "/tmp/site",
        projectName: "phosphene",
        runCommand: run,
      }),
    ).resolves.toEqual({ deploymentUrl: "https://abc.phosphene.pages.dev" });

    expect(run).toHaveBeenCalledWith("npx", [
      "wrangler",
      "pages",
      "deploy",
      "/tmp/site",
      "--project-name",
      "phosphene",
      "--branch",
      "main",
    ]);
  });
});
