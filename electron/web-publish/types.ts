export const WEB_PUBLISH_PROJECT_NAME = "phosphene";
export const WEB_PUBLISH_HOSTNAME = "phosphene.gonkey.org";

export type WebPublishWorkspaceManifestEntry = {
  workspaceId: string;
  slug: string;
  name: string;
  sourceFingerprint: string;
  publishedAt: string;
  lastDeploymentUrl: string | null;
  lastError: string | null;
};

export type WebPublishManifest = {
  schemaVersion: 1;
  projectName: string;
  hostname: string;
  workspaces: Record<string, WebPublishWorkspaceManifestEntry>;
  failedWorkspaces?: Record<string, WebPublishWorkspaceManifestEntry>;
};

export type WebPublishBoardSource = {
  id: string;
  name: string;
  position: number;
  canvasData: string | null;
  updatedAt: string;
};

export type WebPublishWorkspaceSource = {
  id: string;
  name: string;
  updatedAt: string;
};

export type WebPublishSourceFingerprintInput = {
  workspace: WebPublishWorkspaceSource;
  boards: WebPublishBoardSource[];
};
