import { dismissSharedError, useSharedErrors } from "../../hooks/shared-error-store";

const bannerStyle = {
  display: "grid",
  gap: "0.75rem",
  margin: "0 0 1rem",
};

const cardStyle = {
  alignItems: "start",
  background: "#fff5f5",
  border: "1px solid #fecaca",
  borderRadius: "0.75rem",
  color: "#7f1d1d",
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  padding: "0.875rem 1rem",
};

const actionsStyle = {
  display: "flex",
  gap: "0.5rem",
};

export function SharedErrorBanner() {
  const errors = useSharedErrors().filter((entry) => !entry.persistent);

  if (errors.length === 0) {
    return null;
  }

  return (
    <section aria-label="Recoverable errors" style={bannerStyle}>
      {errors.map((entry) => (
        <div key={entry.id} aria-label={entry.source ?? "Shared error"} role="alert" style={cardStyle}>
          <div>
            {entry.source ? <strong>{entry.source}</strong> : null}
            <p>{entry.message}</p>
            {entry.context?.workspaceId ? (
              <p>Workspace: {String(entry.context.workspaceId)}</p>
            ) : null}
          </div>

          <div style={actionsStyle}>
            {entry.retry ? (
              <button
                type="button"
                onClick={() => {
                  void Promise.resolve(entry.retry?.run()).catch(() => undefined);
                }}
              >
                {entry.retry.label}
              </button>
            ) : null}
            {entry.dismissible ? (
              <button
                type="button"
                onClick={() => {
                  dismissSharedError(entry.id);
                }}
              >
                Dismiss
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}
