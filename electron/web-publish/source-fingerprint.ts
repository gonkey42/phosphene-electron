import { createHash } from "node:crypto";
import type { WebPublishSourceFingerprintInput } from "./types";

export function createWorkspaceSourceFingerprint(input: WebPublishSourceFingerprintInput): string {
  const normalizedInput = {
    workspace: input.workspace,
    boards: [...input.boards].sort((left, right) => {
      if (left.position !== right.position) {
        return left.position - right.position;
      }

      return left.id.localeCompare(right.id);
    }),
  };

  return createHash("sha256").update(JSON.stringify(normalizedInput)).digest("hex");
}
