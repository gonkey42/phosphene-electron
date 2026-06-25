import { useId } from "react";

import {
  useWorkspacePublish,
  type WorkspacePublishPhase,
  type WorkspacePublishStatus,
} from "../../hooks/use-workspace-publish";
import "./WorkspacePublishControls.css";

type StatusPresentation = {
  label: string;
  detail: string;
  glyph: string;
  className: string;
  isAlert: boolean;
};

function getStatusPresentation({
  phase,
  status,
  isBusy,
  errorMessage,
  workspaceName,
}: {
  phase: WorkspacePublishPhase;
  status: WorkspacePublishStatus;
  isBusy: boolean;
  errorMessage: string | null;
  workspaceName: string;
}): StatusPresentation {
  if (isBusy) {
    return {
      label: "Publish operation in progress",
      detail: "Publish operation in progress. Publish controls are temporarily unavailable.",
      glyph: "…",
      className: "busy",
      isAlert: false,
    };
  }

  if (phase === "loading") {
    return {
      label: "Publish state loading",
      detail: "Publish state is still loading. Publish controls are temporarily unavailable.",
      glyph: "…",
      className: "loading",
      isAlert: false,
    };
  }

  if (phase === "refreshing") {
    return {
      label: "Publish state refreshing",
      detail: "Publish state is refreshing. Publish controls are temporarily unavailable.",
      glyph: "↻",
      className: "refreshing",
      isAlert: false,
    };
  }

  if (phase === "error") {
    return {
      label: "Publish state unavailable",
      detail: errorMessage
        ? `Publish state unavailable. ${errorMessage}`
        : "Publish state unavailable. Publish controls are temporarily unavailable.",
      glyph: "!",
      className: "error",
      isAlert: true,
    };
  }

  if (status === "online") {
    return {
      label: "Online",
      detail: `Online. Republish ${workspaceName} to update the public snapshot.`,
      glyph: "✓",
      className: "online",
      isAlert: false,
    };
  }

  if (status === "changed-since-publish") {
    return {
      label: "Changed since publish",
      detail: `Changed since publish. Republish ${workspaceName} to update the public snapshot.`,
      glyph: "*",
      className: "changed-since-publish",
      isAlert: false,
    };
  }

  if (status === "publish-failed") {
    return {
      label: "Publish failed",
      detail: errorMessage
        ? `Publish failed. ${errorMessage}`
        : `Publish failed. Republish ${workspaceName} to retry.`,
      glyph: "!",
      className: "publish-failed",
      isAlert: true,
    };
  }

  return {
    label: "Not online",
    detail: `Not online. Publish ${workspaceName} to Web to create a public snapshot.`,
    glyph: "○",
    className: "not-online",
    isAlert: false,
  };
}

export function WorkspacePublishControls({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const { phase, status, hasPublishedSnapshot, isBusy, errorMessage, refresh, publish, unpublish } =
    useWorkspacePublish(workspaceId);
  const detailId = useId();
  const statusPresentation = getStatusPresentation({
    phase,
    status,
    isBusy,
    errorMessage,
    workspaceName,
  });
  const publishAriaLabel =
    status === "not-online" ? `Publish ${workspaceName} to Web` : `Republish ${workspaceName}`;
  const isErrorPhase = phase === "error";
  const actionsDisabled = isBusy || phase !== "loaded";
  const publishButtonClassName = [
    "workspace-publish-controls__button",
    "workspace-publish-controls__button--publish",
    `workspace-publish-controls__button--${statusPresentation.className}`,
  ].join(" ");

  return (
    <div className="workspace-publish-controls">
      <span className="workspace-publish-controls__status-wrap">
        <span
          className={`workspace-publish-controls__status workspace-publish-controls__status--${statusPresentation.className}`}
          aria-describedby={detailId}
          aria-label={`Publish status for ${workspaceName}: ${statusPresentation.label}`}
          role={statusPresentation.isAlert ? "alert" : undefined}
          tabIndex={0}
        >
          {statusPresentation.glyph}
        </span>
        <span id={detailId} className="workspace-publish-controls__detail" role="tooltip">
          {statusPresentation.detail}
        </span>
      </span>
      <button
        type="button"
        className={publishButtonClassName}
        aria-describedby={detailId}
        aria-label={publishAriaLabel}
        disabled={actionsDisabled}
        onClick={() => void publish()}
      >
        ↑
      </button>
      {isErrorPhase ? (
        <button
          type="button"
          className="workspace-publish-controls__button workspace-publish-controls__button--retry"
          aria-describedby={detailId}
          aria-label={`Retry publish state for ${workspaceName}`}
          onClick={() => void refresh()}
        >
          ↻
        </button>
      ) : null}
      {hasPublishedSnapshot ? (
        <button
          type="button"
          className="workspace-publish-controls__button workspace-publish-controls__button--unpublish"
          aria-label={`Unpublish ${workspaceName}`}
          disabled={actionsDisabled}
          onClick={() => void unpublish()}
        >
          ↓
        </button>
      ) : null}
    </div>
  );
}
