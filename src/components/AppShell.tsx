import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { runDailyBackup } from "../lib/backup";
import { loadActiveWorkspaceId, saveActiveWorkspaceId } from "../lib/active-workspace-setting";
import { ensureStorageDirectories } from "../lib/file-storage";
import { listWorkspaces, mapWorkspace } from "../lib/workspace-operations";
import { useThemeController } from "../hooks/use-theme-controller";
import { useKeyboardShortcuts } from "../hooks/use-keyboard-shortcuts";
import { clearSharedErrorChannel, useSharedErrors } from "../hooks/shared-error-store";
import { useErrorReporter } from "../hooks/use-error-reporter";
import { useAppStore } from "../stores/app-store";
import { KeyboardProvider } from "../contexts/KeyboardContext";

import { WorkspaceTabBar } from "./workspace/WorkspaceTabBar";
import { WorkspaceContainer } from "./workspace/WorkspaceContainer";
import { SharedErrorBanner } from "./shared/SharedErrorBanner";

const APP_INIT_ERROR_CHANNEL = "app-shell:init";

const liveRegionStyle: CSSProperties = {
  border: 0,
  clip: "rect(0 0 0 0)",
  height: 1,
  margin: -1,
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  whiteSpace: "nowrap",
  width: 1,
};

export function AppShell() {
  const status = useAppStore((state) => state.status);
  const initializationError = useAppStore((state) => state.initializationError);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const deleteAnnouncement = useAppStore((state) => state.deleteAnnouncement);
  const setInitializationState = useAppStore((state) => state.setInitializationState);
  const setWorkspaces = useAppStore((state) => state.setWorkspaces);
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
  const reportError = useErrorReporter("AppShell");
  const { resolvedTheme } = useThemeController();
  const [initAttempt, setInitAttempt] = useState(0);
  const sharedErrors = useSharedErrors();
  const startupError = useMemo(
    () => sharedErrors.find((entry) => entry.channel === APP_INIT_ERROR_CHANNEL) ?? null,
    [sharedErrors],
  );
  const shellClassName = `app-shell theme-${resolvedTheme}`;

  useKeyboardShortcuts();

  useLayoutEffect(() => {
    async function init() {
      setInitializationState({ status: "loading" });

      try {
        await ensureStorageDirectories();
        void runDailyBackup().catch((error) => {
          reportError("Backup failed", error);
        });
        const persistedActiveWorkspaceId = await loadActiveWorkspaceId();
        const workspaces = (await listWorkspaces()).map(mapWorkspace);

        clearSharedErrorChannel(APP_INIT_ERROR_CHANNEL);
        setWorkspaces(workspaces);
        if (workspaces.length > 0) {
          const nextActiveWorkspaceId =
            persistedActiveWorkspaceId &&
            workspaces.some((workspace) => workspace.id === persistedActiveWorkspaceId)
            ? persistedActiveWorkspaceId
            : workspaces[0].id;
          setActiveWorkspace(nextActiveWorkspaceId);
        }
        setInitializationState({ status: "ready" });
      } catch (error) {
        reportError("Failed to initialize app", error, undefined, {
          channel: APP_INIT_ERROR_CHANNEL,
          persistent: true,
          dismissible: false,
        });
        setInitializationState({
          status: "error",
          error: {
            title: "Unable to start Phosphene",
            detail: error instanceof Error ? error.message : "Unknown startup failure",
          },
        });
      }
    }

    void init();
  }, [initAttempt, reportError, setActiveWorkspace, setInitializationState, setWorkspaces]);

  useEffect(() => {
    if (status !== "ready" || !activeWorkspaceId) {
      return;
    }

    void saveActiveWorkspaceId(activeWorkspaceId).catch((error) => {
      reportError("Failed to persist active workspace", error, { activeWorkspaceId });
    });
  }, [activeWorkspaceId, reportError, status]);

  if (status === "error" && initializationError) {
    return (
      <div className={`${shellClassName} app-shell--error`}>
        <div className="app-shell__failure-panel" role="alert">
          <h1>{initializationError.title}</h1>
          <p>{startupError?.error instanceof Error ? startupError.error.message : initializationError.detail}</p>
          <p>Check filesystem permissions or reinstall if the preload script is missing.</p>
          <button type="button" onClick={() => setInitAttempt((attempt) => attempt + 1)}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (status === "idle") {
    return null;
  }

  if (status === "loading") {
    return (
      <div className={`${shellClassName} app-shell--loading`}>
        <p>Loading Phosphene...</p>
      </div>
    );
  }

  return (
    <KeyboardProvider>
      <div className={shellClassName}>
        <div role="status" aria-live="polite" aria-atomic="true" style={liveRegionStyle}>
          {deleteAnnouncement ?? ""}
        </div>
        <SharedErrorBanner />
        <WorkspaceTabBar />
        <WorkspaceContainer />
      </div>
    </KeyboardProvider>
  );
}
