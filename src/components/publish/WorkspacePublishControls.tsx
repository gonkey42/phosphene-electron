import {
  useWorkspacePublish,
  type WorkspacePublishStatus,
} from "../../hooks/use-workspace-publish";
import "./WorkspacePublishControls.css";

const statusLabel: Record<WorkspacePublishStatus, string> = {
  "not-online": "Not Online",
  online: "Online",
  "changed-since-publish": "Changed",
  "publish-failed": "Publish Failed",
};

export function WorkspacePublishControls({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const { status, hasPublishedSnapshot, isBusy, errorMessage, publish, unpublish } =
    useWorkspacePublish(workspaceId);
  const publishLabel = status === "not-online" ? "Publish to Web" : "Republish";
  const publishAriaLabel =
    status === "not-online" ? `Publish ${workspaceName} to Web` : `Republish ${workspaceName}`;

  return (
    <div className="workspace-publish-controls">
      <span
        className={`workspace-publish-controls__status workspace-publish-controls__status--${status}`}
        title={statusLabel[status]}
      >
        {statusLabel[status]}
      </span>
      <button
        type="button"
        className="workspace-publish-controls__button"
        aria-label={publishAriaLabel}
        disabled={isBusy}
        onClick={() => void publish()}
      >
        {publishLabel}
      </button>
      {hasPublishedSnapshot ? (
        <button
          type="button"
          className="workspace-publish-controls__button"
          aria-label={`Unpublish ${workspaceName}`}
          disabled={isBusy}
          onClick={() => void unpublish()}
        >
          Unpublish
        </button>
      ) : null}
      {errorMessage ? (
        <span className="workspace-publish-controls__error" role="alert" title={errorMessage}>
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
