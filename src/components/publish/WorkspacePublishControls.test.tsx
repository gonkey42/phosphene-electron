import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useWorkspacePublishMock } = vi.hoisted(() => ({
  useWorkspacePublishMock: vi.fn(),
}));

vi.mock("../../hooks/use-workspace-publish", () => ({
  useWorkspacePublish: useWorkspacePublishMock,
}));

import type { WorkspacePublishStatus } from "../../hooks/use-workspace-publish";
import { WorkspacePublishControls } from "./WorkspacePublishControls";

function mockPublishState(
  overrides: Partial<{
    status: WorkspacePublishStatus;
    hasPublishedSnapshot: boolean;
    isBusy: boolean;
    errorMessage: string | null;
    publish: () => Promise<void>;
    unpublish: () => Promise<void>;
  }> = {},
) {
  const publish = vi.fn(async () => undefined);
  const unpublish = vi.fn(async () => undefined);

  useWorkspacePublishMock.mockReturnValue({
    status: "not-online",
    hasPublishedSnapshot: false,
    isBusy: false,
    errorMessage: null,
    publish,
    unpublish,
    ...overrides,
  });

  return { publish, unpublish };
}

describe("WorkspacePublishControls", () => {
  beforeEach(() => {
    useWorkspacePublishMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows Publish to Web for a not-online workspace", () => {
    mockPublishState({ status: "not-online" });

    render(<WorkspacePublishControls workspaceId="workspace_1" workspaceName="Home" />);

    expect(screen.getByText("Publish to Web")).toBeVisible();
    expect(screen.queryByText("Unpublish")).not.toBeInTheDocument();
  });

  it("shows Republish for a changed-since-publish workspace", () => {
    mockPublishState({ status: "changed-since-publish" });

    render(<WorkspacePublishControls workspaceId="workspace_1" workspaceName="Home" />);

    expect(screen.getByText("Republish")).toBeVisible();
  });

  it("shows Unpublish when a workspace has a published snapshot", () => {
    mockPublishState({ status: "online", hasPublishedSnapshot: true });

    render(<WorkspacePublishControls workspaceId="workspace_1" workspaceName="Home" />);

    expect(screen.getByText("Unpublish")).toBeVisible();
  });

  it("hides Unpublish for a first-time publish failure without a published snapshot", () => {
    mockPublishState({ status: "publish-failed", hasPublishedSnapshot: false });

    render(<WorkspacePublishControls workspaceId="workspace_1" workspaceName="Home" />);

    expect(screen.getByText("Republish")).toBeVisible();
    expect(screen.queryByText("Unpublish")).not.toBeInTheDocument();
  });

  it("uses workspace-specific accessible labels while keeping compact visible text", () => {
    mockPublishState({ status: "not-online" });

    render(<WorkspacePublishControls workspaceId="workspace_1" workspaceName="Home" />);

    expect(screen.getByRole("button", { name: "Publish Home to Web" })).toHaveTextContent(
      "Publish to Web",
    );
  });

  it("calls publish when the publish button is clicked", () => {
    const { publish } = mockPublishState({ status: "not-online" });

    render(<WorkspacePublishControls workspaceId="workspace_1" workspaceName="Home" />);
    fireEvent.click(screen.getByRole("button", { name: "Publish Home to Web" }));

    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("calls unpublish when the unpublish button is clicked", () => {
    const { unpublish } = mockPublishState({ status: "online", hasPublishedSnapshot: true });

    render(<WorkspacePublishControls workspaceId="workspace_1" workspaceName="Home" />);
    fireEvent.click(screen.getByRole("button", { name: "Unpublish Home" }));

    expect(unpublish).toHaveBeenCalledTimes(1);
  });
});
