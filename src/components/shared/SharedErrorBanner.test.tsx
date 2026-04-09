import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSharedErrors, recordSharedError } from "../../hooks/shared-error-store";

import { SharedErrorBanner } from "./SharedErrorBanner";

describe("SharedErrorBanner", () => {
  beforeEach(() => {
    clearSharedErrors();
  });

  afterEach(() => {
    cleanup();
    clearSharedErrors();
  });

  it("shows recoverable board, workspace, and keyboard failures and lets the user dismiss them", () => {
    const boardRetry = vi.fn();
    const workspaceRetry = vi.fn();

    recordSharedError({
      message: "Failed to reload boards",
      source: "BoardList",
      error: new Error("board reload failed"),
      context: { workspaceId: "workspace-1" },
      channel: "board-list:reload",
      retry: {
        label: "Retry",
        run: boardRetry,
      },
    });
    recordSharedError({
      message: "Failed to reload workspaces",
      source: "WorkspaceTabBar",
      error: new Error("workspace reload failed"),
      channel: "workspace-tab-bar:reload",
      retry: {
        label: "Retry",
        run: workspaceRetry,
      },
    });
    recordSharedError({
      message: "Failed to create board from keyboard shortcut",
      source: "KeyboardShortcuts",
      error: new Error("keyboard shortcut failed"),
      channel: "keyboard-shortcut:create-board",
    });

    render(<SharedErrorBanner />);

    const boardAlert = screen.getByRole("alert", { name: "BoardList" });
    const workspaceAlert = screen.getByRole("alert", { name: "WorkspaceTabBar" });
    const keyboardAlert = screen.getByRole("alert", { name: "KeyboardShortcuts" });

    expect(boardAlert).toHaveTextContent("Failed to reload boards");
    expect(boardAlert).toHaveTextContent("workspace-1");
    expect(within(boardAlert).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(workspaceAlert).toHaveTextContent("Failed to reload workspaces");
    expect(within(workspaceAlert).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(keyboardAlert).toHaveTextContent("Failed to create board from keyboard shortcut");
    expect(within(keyboardAlert).queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(within(keyboardAlert).getByRole("button", { name: "Dismiss" })).toBeInTheDocument();

    fireEvent.click(within(workspaceAlert).getByRole("button", { name: "Retry" }));
    expect(workspaceRetry).toHaveBeenCalledTimes(1);

    fireEvent.click(within(boardAlert).getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("alert", { name: "BoardList" })).not.toBeInTheDocument();
    expect(boardRetry).not.toHaveBeenCalled();
  });
});
