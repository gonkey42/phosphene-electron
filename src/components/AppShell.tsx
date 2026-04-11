import { useLayoutEffect, useMemo, useState } from "react";

import { runDailyBackup } from "../lib/backup";
import { getDb } from "../lib/database";
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

export function AppShell() {
  const status = useAppStore((state) => state.status);
  const initializationError = useAppStore((state) => state.initializationError);
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
        await getDb();
        await ensureStorageDirectories();
        void runDailyBackup().catch((error) => {
          reportError("Backup failed", error);
        });
        const workspaces = (await listWorkspaces()).map(mapWorkspace);

        clearSharedErrorChannel(APP_INIT_ERROR_CHANNEL);
        setWorkspaces(workspaces);
        if (workspaces.length > 0) {
          setActiveWorkspace(workspaces[0].id);
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
        <SharedErrorBanner />
        <WorkspaceTabBar />
        <WorkspaceContainer />
      </div>
    </KeyboardProvider>
  );
}
