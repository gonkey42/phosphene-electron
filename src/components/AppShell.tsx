import { useEffect } from "react";

import { runDailyBackup } from "../lib/backup";
import { getDb } from "../lib/database";
import { ensureStorageDirectories } from "../lib/file-storage";
import { listWorkspaces, mapWorkspace } from "../lib/workspace-operations";
import { useKeyboardShortcuts } from "../hooks/use-keyboard-shortcuts";
import { useErrorReporter } from "../hooks/use-error-reporter";
import { useAppStore } from "../stores/app-store";
import { KeyboardProvider } from "../contexts/KeyboardContext";

import { WorkspaceTabBar } from "./workspace/WorkspaceTabBar";
import { WorkspaceContainer } from "./workspace/WorkspaceContainer";

export function AppShell() {
  const initialized = useAppStore((state) => state.initialized);
  const setInitialized = useAppStore((state) => state.setInitialized);
  const setWorkspaces = useAppStore((state) => state.setWorkspaces);
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
  const reportError = useErrorReporter("AppShell");

  useKeyboardShortcuts();

  useEffect(() => {
    async function init() {
      try {
        await getDb();
        await ensureStorageDirectories();
        void runDailyBackup().catch((error) => {
          reportError("Backup failed", error);
        });
        const workspaces = (await listWorkspaces()).map(mapWorkspace);

        setWorkspaces(workspaces);
        if (workspaces.length > 0) {
          setActiveWorkspace(workspaces[0].id);
        }
        setInitialized(true);
      } catch (error) {
        reportError("Failed to initialize app", error);
      }
    }

    void init();
  }, [reportError, setActiveWorkspace, setInitialized, setWorkspaces]);

  if (!initialized) {
    return (
      <div className="app-shell app-shell--loading">
        <p>Loading Phosphene...</p>
      </div>
    );
  }

  return (
    <KeyboardProvider>
      <div className="app-shell">
        <WorkspaceTabBar />
        <WorkspaceContainer />
      </div>
    </KeyboardProvider>
  );
}
