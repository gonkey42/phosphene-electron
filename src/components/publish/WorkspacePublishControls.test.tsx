import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listStatesMock,
  publishWorkspaceToWebMock,
  unpublishWorkspaceFromWebMock,
  workspacePublishHookMock,
  useRealWorkspacePublishState,
} = vi.hoisted(() => ({
  listStatesMock: vi.fn(),
  publishWorkspaceToWebMock: vi.fn(),
  unpublishWorkspaceFromWebMock: vi.fn(),
  workspacePublishHookMock: vi.fn(),
  useRealWorkspacePublishState: {
    enabled: false,
    hook: null as null | typeof import("../../hooks/use-workspace-publish").useWorkspacePublish,
  },
}));

vi.mock("../../platform/desktop-api", () => ({
  webPublish: {
    listStates: listStatesMock,
  },
}));

vi.mock("../../lib/web-publish/workspace-publish", () => ({
  publishWorkspaceToWeb: publishWorkspaceToWebMock,
  unpublishWorkspaceFromWeb: unpublishWorkspaceFromWebMock,
}));

vi.mock("../../hooks/use-workspace-publish", () => ({
  useWorkspacePublish: (workspaceId: string) => {
    if (useRealWorkspacePublishState.enabled) {
      if (!useRealWorkspacePublishState.hook) {
        throw new Error("Real useWorkspacePublish hook was not loaded for this test");
      }

      return useRealWorkspacePublishState.hook(workspaceId);
    }

    return workspacePublishHookMock(workspaceId);
  },
}));

import type {
  WorkspacePublishPhase,
  WorkspacePublishStatus,
} from "../../hooks/use-workspace-publish";
import { WorkspacePublishControls } from "./WorkspacePublishControls";

function mockPublishState(
  overrides: Partial<{
    phase: WorkspacePublishPhase;
    status: WorkspacePublishStatus;
    hasPublishedSnapshot: boolean;
    isBusy: boolean;
    errorMessage: string | null;
    publish: () => Promise<void>;
    unpublish: () => Promise<void>;
    refresh: () => Promise<void>;
  }> = {},
) {
  const publish = vi.fn(async () => undefined);
  const unpublish = vi.fn(async () => undefined);
  const refresh = vi.fn(async () => undefined);
  const phase = overrides.phase ?? "loaded";
  const status = overrides.status ?? "not-online";
  const hasPublishedSnapshot = overrides.hasPublishedSnapshot ?? false;
  const errorMessage = overrides.errorMessage ?? null;

  workspacePublishHookMock.mockReturnValue({
    phase,
    status,
    hasPublishedSnapshot,
    isBusy: overrides.isBusy ?? false,
    errorMessage,
    viewState: {
      phase,
      status,
      hasPublishedSnapshot,
      errorMessage,
    },
    deleteEligibility: { state: "allowed" },
    publish,
    unpublish,
    refresh,
    ...overrides,
  });

  return { publish, unpublish, refresh };
}

describe("WorkspacePublishControls", () => {
  beforeEach(() => {
    listStatesMock.mockReset();
    publishWorkspaceToWebMock.mockReset();
    unpublishWorkspaceFromWebMock.mockReset();
    listStatesMock.mockResolvedValue({});
    publishWorkspaceToWebMock.mockResolvedValue(undefined);
    unpublishWorkspaceFromWebMock.mockResolvedValue(undefined);
    workspacePublishHookMock.mockReset();
    useRealWorkspacePublishState.enabled = false;
    useRealWorkspacePublishState.hook = null;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders compact publish glyphs with accessible names instead of resting text labels", () => {
    mockPublishState({ status: "not-online" });

    render(<WorkspacePublishControls workspaceId="workspace_1" workspaceName="Home" />);

    const publishButton = screen.getByRole("button", { name: "Publish Home to Web" });
    expect(publishButton).toHaveTextContent("↑");
    expect(publishButton).toHaveAccessibleDescription(
      "Not online. Publish Home to Web to create a public snapshot.",
    );
    expect(screen.getByLabelText("Publish status for Home: Not online")).toHaveTextContent("○");

    expect(screen.queryByText("Publish to Web")).not.toBeInTheDocument();
    expect(screen.queryByText("Republish")).not.toBeInTheDocument();
    expect(screen.queryByText("Unpublish")).not.toBeInTheDocument();
    expect(screen.queryByText("Not Online")).not.toBeInTheDocument();
    expect(screen.queryByText("Online")).not.toBeInTheDocument();
    expect(screen.queryByText("Changed")).not.toBeInTheDocument();
    expect(screen.queryByText("Publish Failed")).not.toBeInTheDocument();
  });

  it("renders changed and unpublish cues as compact non-color glyphs", () => {
    mockPublishState({
      status: "changed-since-publish",
      hasPublishedSnapshot: true,
    });

    render(<WorkspacePublishControls workspaceId="workspace_1" workspaceName="Home" />);

    expect(screen.getByRole("button", { name: "Republish Home" })).toHaveTextContent("↑");
    expect(screen.getByRole("button", { name: "Unpublish Home" })).toHaveTextContent("↓");
    expect(screen.getByLabelText("Publish status for Home: Changed since publish")).toHaveTextContent(
      "*",
    );
    expect(
      screen.getByText("Changed since publish. Republish Home to update the public snapshot."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Changed")).not.toBeInTheDocument();
  });

  it("omits the unpublish control until a published snapshot exists", () => {
    mockPublishState({
      status: "publish-failed",
      hasPublishedSnapshot: false,
      errorMessage: "Wrangler deploy failed",
    });

    render(<WorkspacePublishControls workspaceId="workspace_1" workspaceName="Home" />);

    expect(screen.getByRole("button", { name: "Republish Home" })).toHaveTextContent("↑");
    expect(screen.queryByRole("button", { name: "Unpublish Home" })).not.toBeInTheDocument();
  });

  it("calls publish and unpublish from enabled compact controls", () => {
    const { publish, unpublish } = mockPublishState({
      status: "online",
      hasPublishedSnapshot: true,
    });

    render(<WorkspacePublishControls workspaceId="workspace_1" workspaceName="Home" />);
    fireEvent.click(screen.getByRole("button", { name: "Republish Home" }));
    fireEvent.click(screen.getByRole("button", { name: "Unpublish Home" }));

    expect(publish).toHaveBeenCalledTimes(1);
    expect(unpublish).toHaveBeenCalledTimes(1);
  });

  it("does not describe unpublish with the publish action detail", () => {
    mockPublishState({
      status: "online",
      hasPublishedSnapshot: true,
    });

    render(<WorkspacePublishControls workspaceId="workspace_1" workspaceName="Home" />);

    expect(screen.getByRole("button", { name: "Unpublish Home" })).not.toHaveAccessibleDescription(
      "Online. Republish Home to update the public snapshot.",
    );
  });

  it("disables publish controls with accessible descriptions while busy", () => {
    mockPublishState({
      status: "online",
      hasPublishedSnapshot: true,
      isBusy: true,
    });

    render(<WorkspacePublishControls workspaceId="workspace_1" workspaceName="Home" />);

    const publishButton = screen.getByRole("button", { name: "Republish Home" });
    const unpublishButton = screen.getByRole("button", { name: "Unpublish Home" });
    expect(publishButton).toBeDisabled();
    expect(unpublishButton).toBeDisabled();
    expect(publishButton).toHaveAccessibleDescription(
      "Publish operation in progress. Publish controls are temporarily unavailable.",
    );
    expect(screen.getByLabelText("Publish status for Home: Publish operation in progress")).toHaveTextContent(
      "…",
    );
  });

  it.each([
    {
      phase: "loaded" as const,
      status: "online" as const,
      errorMessage: null,
      label: "Online",
      glyph: "✓",
      detail: "Online. Republish Home to update the public snapshot.",
    },
    {
      phase: "loading" as const,
      status: "not-online" as const,
      errorMessage: null,
      label: "Publish state loading",
      glyph: "…",
      detail: "Publish state is still loading. Publish controls are temporarily unavailable.",
    },
    {
      phase: "refreshing" as const,
      status: "online" as const,
      errorMessage: null,
      label: "Publish state refreshing",
      glyph: "↻",
      detail: "Publish state is refreshing. Publish controls are temporarily unavailable.",
    },
    {
      phase: "error" as const,
      status: "not-online" as const,
      errorMessage: "State service unavailable",
      label: "Publish state unavailable",
      glyph: "!",
      detail: "Publish state unavailable. State service unavailable",
    },
  ])("renders a non-color status cue for $label", ({ phase, status, errorMessage, label, glyph, detail }) => {
    mockPublishState({ phase, status, errorMessage });

    render(<WorkspacePublishControls workspaceId="workspace_1" workspaceName="Home" />);

    expect(screen.getByLabelText(`Publish status for Home: ${label}`)).toHaveTextContent(glyph);
    expect(screen.getByText(detail)).toBeInTheDocument();

    cleanup();
  });

  it("announces failed publish states with an alert", () => {
    mockPublishState({
      status: "publish-failed",
      hasPublishedSnapshot: true,
      errorMessage: "Wrangler deploy failed",
    });

    render(<WorkspacePublishControls workspaceId="workspace_1" workspaceName="Home" />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAccessibleName("Publish status for Home: Publish failed");
    expect(alert).toHaveTextContent("!");
    expect(screen.getByText("Publish failed. Wrangler deploy failed")).toBeInTheDocument();
  });

  it("renders a compact retry control when publish state is unavailable", () => {
    const { refresh } = mockPublishState({
      phase: "error",
      status: "not-online",
      errorMessage: "State service unavailable",
    });

    render(<WorkspacePublishControls workspaceId="workspace_1" workspaceName="Home" />);

    const retryButton = screen.getByRole("button", { name: "Retry publish state for Home" });
    expect(retryButton).toHaveTextContent("↻");
    expect(retryButton).toHaveAccessibleDescription(
      "Publish state unavailable. State service unavailable",
    );

    fireEvent.click(retryButton);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("recovers from an initial publish-state refresh failure through retry", async () => {
    useRealWorkspacePublishState.hook = (
      await vi.importActual<typeof import("../../hooks/use-workspace-publish")>(
        "../../hooks/use-workspace-publish"
      )
    ).useWorkspacePublish;
    useRealWorkspacePublishState.enabled = true;
    listStatesMock
      .mockRejectedValueOnce(new Error("State service unavailable"))
      .mockResolvedValueOnce({
        workspace_1: {
          state: "not-online",
          hasPublishedSnapshot: false,
          lastError: null,
          lastDeploymentUrl: null,
        },
      });

    render(<WorkspacePublishControls workspaceId="workspace_1" workspaceName="Home" />);

    const retryButton = await screen.findByRole("button", {
      name: "Retry publish state for Home",
    });
    expect(screen.getByRole("button", { name: "Publish Home to Web" })).toBeDisabled();

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Publish Home to Web" })).toBeEnabled();
    });
    expect(listStatesMock).toHaveBeenCalledTimes(2);
  });

  it("shares one publish-state refresh across multiple rendered controls", async () => {
    useRealWorkspacePublishState.hook = (
      await vi.importActual<typeof import("../../hooks/use-workspace-publish")>(
        "../../hooks/use-workspace-publish"
      )
    ).useWorkspacePublish;
    useRealWorkspacePublishState.enabled = true;
    listStatesMock.mockResolvedValue({
      workspace_1: {
        state: "online",
        hasPublishedSnapshot: true,
        lastError: null,
        lastDeploymentUrl: "https://phosphene.example/workspaces/home",
      },
      workspace_2: {
        state: "changed-since-publish",
        hasPublishedSnapshot: true,
        lastError: null,
        lastDeploymentUrl: "https://phosphene.example/workspaces/projects",
      },
    });

    render(
      <>
        <WorkspacePublishControls workspaceId="workspace_1" workspaceName="Home" />
        <WorkspacePublishControls workspaceId="workspace_2" workspaceName="Projects" />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Republish Home" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Republish Projects" })).toBeEnabled();
    });

    expect(listStatesMock).toHaveBeenCalledTimes(1);
  });
});
