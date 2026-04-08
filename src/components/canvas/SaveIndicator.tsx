import { useEffect, useState } from "react";

import type { SaveStatus } from "../../hooks/use-board-persistence";

import "./SaveIndicator.css";

type SaveIndicatorProps = {
  status: SaveStatus;
};

function getLabel(status: SaveStatus): string {
  if (status === "saving") {
    return "Saving...";
  }

  if (status === "unsaved") {
    return "Unsaved";
  }

  return "Saved";
}

export function SaveIndicator({ status }: SaveIndicatorProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (status !== "saved") {
      setVisible(true);
      return undefined;
    }

    setVisible(true);
    const timer = window.setTimeout(() => {
      setVisible(false);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [status]);

  return (
    <div className={`save-indicator ${visible ? "" : "fade-out"}`.trim()}>
      <span className={`save-indicator-dot ${status}`} />
      <span>{getLabel(status)}</span>
    </div>
  );
}
