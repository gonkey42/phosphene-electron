import type {
  BoardPackImportActiveOptions,
  BoardPackImportIdOptions,
  BoardPackImportNameOptions,
  BoardPackImportOptions,
  boardPacks,
} from "./desktop-api";

declare const importFolder: typeof boardPacks.importFolder;
declare const desktopImportFolder: Window["desktop"]["boardPacks"]["importFolder"];

function assertBoardPackImportOptionTypes() {
  type BroadBoardPackImportOption =
    | { targetWorkspaceId: string }
    | { targetWorkspaceName: string }
    | { targetActiveWorkspace: true };

  const idOptions: BoardPackImportIdOptions = { targetWorkspaceId: "workspace-1" };
  const nameOptions: BoardPackImportNameOptions = { targetWorkspaceName: "Vacation Plan" };
  const activeOptions: BoardPackImportActiveOptions = { targetActiveWorkspace: true };
  const explicitIdOptions: BoardPackImportOptions<{ targetWorkspaceId: string }> = {
    targetWorkspaceId: "workspace-1",
  };

  void importFolder("/packs/starter");
  void importFolder("/packs/starter", { targetWorkspaceId: "workspace-1" });
  void importFolder("/packs/starter", { targetWorkspaceName: "Vacation Plan" });
  void importFolder("/packs/starter", { targetActiveWorkspace: true });
  void importFolder("/packs/starter", idOptions);
  void importFolder("/packs/starter", nameOptions);
  void importFolder("/packs/starter", activeOptions);
  void importFolder("/packs/starter", explicitIdOptions);
  void desktopImportFolder("/packs/starter");
  void desktopImportFolder("/packs/starter", { targetWorkspaceId: "workspace-1" });
  void desktopImportFolder("/packs/starter", { targetWorkspaceName: "Vacation Plan" });
  void desktopImportFolder("/packs/starter", { targetActiveWorkspace: true });

  // @ts-expect-error conflicting selectors should not compile.
  void importFolder("/packs/starter", { targetWorkspaceId: "workspace-1", targetWorkspaceName: "Vacation Plan" });

  // @ts-expect-error explicit undefined selector exclusions should not compile.
  void importFolder("/packs/starter", { targetWorkspaceId: "workspace-1", targetWorkspaceName: undefined });

  // @ts-expect-error empty options should use omitted options instead.
  void importFolder("/packs/starter", {});

  // @ts-expect-error unknown option keys should not compile.
  void importFolder("/packs/starter", { targetWorkspaceName: "Vacation Plan", unexpected: "value" });

  // @ts-expect-error global desktop API should reject conflicting selectors.
  void desktopImportFolder("/packs/starter", { targetWorkspaceId: "workspace-1", targetActiveWorkspace: true });

  // @ts-expect-error global desktop API should reject explicit undefined selector exclusions.
  void desktopImportFolder("/packs/starter", { targetActiveWorkspace: true, targetWorkspaceName: undefined });

  // @ts-expect-error exported id option annotation should reject explicit undefined selector exclusions.
  const invalidIdOptions: BoardPackImportIdOptions = { targetWorkspaceId: "workspace-1", targetWorkspaceName: undefined };

  // @ts-expect-error exported generic option alias requires an explicit selector shape.
  const invalidDefaultOptions: BoardPackImportOptions = { targetWorkspaceId: "workspace-1" };

  // @ts-expect-error explicit broad exported option alias usage should not bypass exactness.
  void importFolder<BoardPackImportOptions<BroadBoardPackImportOption>>("/packs/starter", { targetWorkspaceId: "workspace-1" });

  // @ts-expect-error explicit broad selector union usage should not bypass exactness.
  void desktopImportFolder<DesktopBoardPackImportOption>("/packs/starter", { targetWorkspaceId: "workspace-1" });

  void invalidIdOptions;
  void invalidDefaultOptions;
  void idOptions;
  void nameOptions;
  void activeOptions;
  void explicitIdOptions;
}

void assertBoardPackImportOptionTypes;
