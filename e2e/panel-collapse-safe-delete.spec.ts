import { expect, type Locator, type Page, test } from "@playwright/test";
import path from "node:path";

import { waitForLoadedBrowserUrl, type TrackedBrowserState } from "./helpers/browser-state";
import { launchApp } from "./helpers/launch";

const REQUIRED_WORKSPACE_NAMES = [
  "Columbia Charleston Planning Workspace",
  "Return Trip",
  "House Ideas",
  "Packing Notes",
] as const;

const EXTRA_WORKSPACE_NAMES = [
  "Published State",
  "Changed State",
] as const;

const ALL_WORKSPACE_NAMES = [
  ...REQUIRED_WORKSPACE_NAMES,
  ...EXTRA_WORKSPACE_NAMES,
] as const;

const ACTIVE_WORKSPACE_NAME = REQUIRED_WORKSPACE_NAMES[0];
const BROWSER_FIRST_URL = "https://example.com/?phosphene-e2e=panel-one";
const BROWSER_SECOND_URL = "https://example.com/?phosphene-e2e=panel-two";
const DELAYED_BOARD_NAME = "Return ferry timing board with a deliberately long visible title";
const BROKEN_CANVAS_BOARD_NAME = "Broken canvas data board kept for rendered error state checks";
const FIRST_BOARD_NAME =
  "Charleston swim windows and Columbia restaurant shortlist with an intentionally long title";
const SECOND_BOARD_NAME =
  "Historic district walking plan with museums, coffee, and parking notes";

const BOARD_NAMES = [
  FIRST_BOARD_NAME,
  SECOND_BOARD_NAME,
  DELAYED_BOARD_NAME,
  "House ideas mood board with porch lights, paint colors, and garden paths",
  "Packing notes master checklist for humid weather and beach detours",
  "Long return-trip route comparison with stops, snacks, and charging backup",
  "Budget and reservations tracker with confirmation numbers and backup plans",
  BROKEN_CANVAS_BOARD_NAME,
] as const;

type WorkspaceName = (typeof ALL_WORKSPACE_NAMES)[number];
type RequiredWorkspaceName = (typeof REQUIRED_WORKSPACE_NAMES)[number];
type BoardName = (typeof BOARD_NAMES)[number];

type PublishState = {
  state: "not-online" | "online" | "changed-since-publish" | "publish-failed";
  hasPublishedSnapshot: boolean;
  lastError: string | null;
  lastDeploymentUrl: string | null;
};

type WorkspaceFixture = {
  workspaceIdsByName: Record<WorkspaceName, string>;
  boardIdsByName: Record<BoardName, string>;
};

type DesktopWorkspaceListItem = {
  id: string;
  name: string;
  icon: string | null;
  position: number;
};

type DesktopWorkspaceAPI = {
  list(): Promise<DesktopWorkspaceListItem[]>;
  createWorkspace(name: string, icon?: string): Promise<string>;
  rename(workspaceId: string, name: string): Promise<void>;
  reorderWorkspaces(orderedIds: string[]): Promise<void>;
  saveLayout(workspaceId: string, layoutConfig: object): Promise<void>;
};

type DesktopBoardAPI = {
  createBoard(name: string, workspaceId: string | null): Promise<string>;
  saveCanvasData(boardId: string, canvasData: string): Promise<void>;
};

type DesktopSettingsAPI = {
  setActiveWorkspaceId(workspaceId: string): Promise<void>;
};

type DesktopBrowserAPI = {
  getState(): Promise<TrackedBrowserState>;
};

type E2EDesktopAPI = {
  workspaces: DesktopWorkspaceAPI;
  boards: DesktopBoardAPI;
  settings: DesktopSettingsAPI;
  browser: DesktopBrowserAPI;
};

type E2EWindow = Window & {
  desktop: E2EDesktopAPI;
};

type ElectronMainProcess = {
  ipcMain: {
    removeHandler(channel: string): void;
    handle(
      channel: string,
      listener: (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown,
    ): void;
  };
};

type DatabaseModule = {
  getDatabase(userDataPath: string): {
    prepare(sql: string): {
      all(...params: unknown[]): unknown[];
    };
  };
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
  visibility: string;
  display: string;
};

test.describe("panel collapse, compact chrome, and safe delete", () => {
  test.setTimeout(120_000);

  test("renders compact workspace tabs and protects workspace deletion", async () => {
    const launch = await launchSeededPanelFixture({ width: 2048, height: 1152 });

    try {
      const { window } = launch;
      const tabBar = workspaceTabBar(window);

      for (const workspaceName of REQUIRED_WORKSPACE_NAMES) {
        await expectElementWithinViewport(window, workspaceTab(window, workspaceName), `${workspaceName} tab`);
        await expectElementWithinContainer(
          workspaceTab(window, workspaceName),
          tabBar,
          `${workspaceName} tab`,
        );
        await expectElementWithinViewport(
          window,
          deleteWorkspaceButton(window, workspaceName),
          `${workspaceName} delete control`,
        );
        await expectElementWithinContainer(
          deleteWorkspaceButton(window, workspaceName),
          tabBar,
          `${workspaceName} delete control`,
        );
        await expect(deleteWorkspaceButton(window, workspaceName)).toBeEnabled();
      }

      await expect(tabBar.getByRole("button", { name: `Unpublish ${ACTIVE_WORKSPACE_NAME}` })).toBeVisible();
      await expect(tabBar.getByRole("button", { name: "Unpublish House Ideas" })).toBeVisible();
      await expect(tabBar.getByLabel("Publish status for Published State: Online")).toBeVisible();
      await expect(tabBar.getByLabel("Publish status for Changed State: Changed since publish")).toBeVisible();
      await expect(tabBar.getByLabel("Publish status for Return Trip: Publish failed")).toBeVisible();
      await expect(tabBar.getByLabel("Publish status for Packing Notes: Not online")).toBeVisible();

      for (const legacyLabel of ["Changed", "Republish", "Unpublish", "Publish to Web"]) {
        await expect(tabBar.getByText(legacyLabel, { exact: true })).toHaveCount(0);
      }

      const publishButton = tabBar.getByRole("button", {
        name: `Publish ${ACTIVE_WORKSPACE_NAME} to Web`,
      });
      const unpublishButton = tabBar.getByRole("button", {
        name: `Unpublish ${ACTIVE_WORKSPACE_NAME}`,
      });
      const deleteButton = deleteWorkspaceButton(window, ACTIVE_WORKSPACE_NAME);

      await expectCompactTabControl(publishButton, "publish control");
      await expectCompactTabControl(unpublishButton, "unpublish control");
      await expectCompactTabControl(deleteButton, "workspace delete control");
      await expectNoCompactControlOverlaps(tabBar);

      const nameIsTruncated = await tabBar
        .locator(".workspace-tab-bar__name")
        .filter({ hasText: ACTIVE_WORKSPACE_NAME })
        .first()
        .evaluate((element) => element.scrollWidth > element.clientWidth);
      expect(nameIsTruncated).toBe(true);

      const createButton = tabBar.getByRole("button", { name: "Create workspace" });
      await expect(createButton).toBeVisible();
      await expectElementWithinViewport(window, createButton, "workspace create button");
      await expectElementWithinContainer(createButton, tabBar, "workspace create button");

      const packingDeleteButton = deleteWorkspaceButton(window, "Packing Notes");
      await packingDeleteButton.click();
      await expect(workspaceTab(window, "Packing Notes")).toBeVisible();
      await expect(confirmWorkspaceDeleteButton(window, "Packing Notes")).toHaveText("x?");

      await workspaceTab(window, "Return Trip").click();
      await expect(deleteWorkspaceButton(window, "Packing Notes")).toHaveText("x");
      await expect(workspaceTab(window, "Packing Notes")).toBeVisible();

      await deleteWorkspaceButton(window, "Packing Notes").click();
      await expect(confirmWorkspaceDeleteButton(window, "Packing Notes")).toHaveText("x?");
      await confirmWorkspaceDeleteButton(window, "Packing Notes").click();
      await expect(workspaceTab(window, "Packing Notes")).toHaveCount(0);
    } finally {
      await launch.cleanup();
    }
  });

  test("keeps board rows dense and protects board deletion", async () => {
    const launch = await launchSeededPanelFixture({ width: 1600, height: 1000 });

    try {
      const { window } = launch;
      const sidebar = workspaceBoards(window);
      await expect(sidebar.getByRole("button", { name: FIRST_BOARD_NAME, exact: true })).toBeVisible();

      const rowHeights = await sidebar.locator(".board-list__item").evaluateAll((rows) =>
        rows.map((row) => row.getBoundingClientRect().height),
      );
      expect(rowHeights.length).toBeGreaterThanOrEqual(8);
      for (const [index, height] of rowHeights.entries()) {
        expect(height, `board row ${index + 1} should stay at compact normal density`).toBeGreaterThanOrEqual(44);
        expect(height, `board row ${index + 1} should stay at compact normal density`).toBeLessThanOrEqual(56);
      }

      const firstTitleTruncates = await boardRow(window, FIRST_BOARD_NAME)
        .locator(".board-list__item-name")
        .evaluate((element) => element.scrollWidth > element.clientWidth);
      expect(firstTitleTruncates).toBe(true);

      const firstBoardButton = sidebar.getByRole("button", { name: FIRST_BOARD_NAME, exact: true });
      await firstBoardButton.click();
      await expect(firstBoardButton).toHaveClass(/board-list__item-button--active/);

      await boardDeleteButton(window, SECOND_BOARD_NAME).click();
      await expect(confirmBoardDeleteButton(window, SECOND_BOARD_NAME)).toHaveText("Delete?");
      await expect(firstBoardButton).toHaveClass(/board-list__item-button--active/);
      await expect(sidebar.getByRole("button", { name: SECOND_BOARD_NAME, exact: true })).toBeVisible();

      await firstBoardButton.click();
      await expect(boardDeleteButton(window, SECOND_BOARD_NAME)).toHaveText("Delete");

      await boardDeleteButton(window, SECOND_BOARD_NAME).click();
      await expect(confirmBoardDeleteButton(window, SECOND_BOARD_NAME)).toHaveText("Delete?");
      await confirmBoardDeleteButton(window, SECOND_BOARD_NAME).click();
      await expect(sidebar.getByRole("button", { name: SECOND_BOARD_NAME, exact: true })).toHaveCount(0);
      await expect(firstBoardButton).toHaveClass(/board-list__item-button--active/);
    } finally {
      await launch.cleanup();
    }
  });

  test("collapses panels to zero width and preserves browser state", async () => {
    const launch = await launchSeededPanelFixture({ width: 1800, height: 1050 });

    try {
      const { window } = launch;
      await expectCanvasControlsVisible(window);

      const visibleSidebarWidth = await pollRoundedRectWidth(window, ".workspace-sidebar-shell");
      const visibleBrowserWidth = await pollRoundedRectWidth(window, ".panel-secondary");
      const visibleCanvasWidth = (await activeWorkspaceRect(window, ".workspace-canvas-shell")).width;
      expect(visibleSidebarWidth).toBeGreaterThan(250);
      expect(visibleBrowserWidth).toBeGreaterThan(200);

      await window.getByRole("button", { name: "Hide boards panel" }).click();
      await expect(window.getByRole("button", { name: "Show boards panel" })).toBeVisible();
      await expect.poll(() => pollRoundedRectWidth(window, ".workspace-sidebar-shell")).toBe(0);

      await window.getByRole("button", { name: "Show boards panel" }).click();
      await expect(window.getByRole("button", { name: "Hide boards panel" })).toBeVisible();
      await expect.poll(() => pollRoundedRectWidth(window, ".workspace-sidebar-shell")).toBeGreaterThan(250);

      const addressBar = window.getByRole("textbox", { name: "Browser address" });
      await expect(addressBar).toBeVisible();
      await addressBar.click();
      await addressBar.fill(BROWSER_FIRST_URL);
      await window.keyboard.press("Enter");
      await waitForLoadedBrowserUrl(window, /phosphene-e2e=panel-one/);
      await addressBar.click();
      await addressBar.fill(BROWSER_SECOND_URL);
      await window.keyboard.press("Enter");
      await waitForLoadedBrowserUrl(window, /phosphene-e2e=panel-two/);
      await expectLiveBrowserState(window, {
        expectedUrl: /phosphene-e2e=panel-two/,
        canGoBack: true,
        label: "after navigation",
      });

      await window.getByRole("button", { name: "Hide browser panel" }).click();
      await expect(window.getByRole("button", { name: "Show browser panel" })).toBeVisible();
      await expect.poll(() => pollRoundedRectWidth(window, ".panel-secondary")).toBe(0);

      await window.getByRole("button", { name: "Show browser panel" }).click();
      await expect(window.getByRole("button", { name: "Hide browser panel" })).toBeVisible();
      await expect.poll(() => pollRoundedRectWidth(window, ".panel-secondary")).toBeGreaterThan(200);
      await expectLiveBrowserState(window, {
        expectedUrl: /phosphene-e2e=panel-two/,
        canGoBack: true,
        label: "after browser hide and restore",
      });

      await window.getByRole("button", { name: "Focus canvas" }).click();
      await expect(window.getByRole("button", { name: "Show boards panel" })).toBeVisible();
      await expect(window.getByRole("button", { name: "Show browser panel" })).toBeVisible();
      await expect.poll(() => pollRoundedRectWidth(window, ".workspace-sidebar-shell")).toBe(0);
      await expect.poll(() => pollRoundedRectWidth(window, ".panel-secondary")).toBe(0);
      const focusedCanvasWidth = (await activeWorkspaceRect(window, ".workspace-canvas-shell")).width;
      expect(focusedCanvasWidth).toBeGreaterThan(visibleCanvasWidth + 300);

      await window.getByRole("button", { name: "Restore panels" }).click();
      await expect(window.getByRole("button", { name: "Hide boards panel" })).toBeVisible();
      await expect(window.getByRole("button", { name: "Hide browser panel" })).toBeVisible();
      await expect.poll(() => pollRoundedRectWidth(window, ".workspace-sidebar-shell")).toBeGreaterThan(250);
      await expect.poll(() => pollRoundedRectWidth(window, ".panel-secondary")).toBeGreaterThan(200);
      await expectLiveBrowserState(window, {
        expectedUrl: /phosphene-e2e=panel-two/,
        canGoBack: true,
        label: "after focus restore",
      });

      await expectMixedCanvasFocusCollapse(window);

      await workspaceTab(window, "Return Trip").click();
      await expect(workspaceTab(window, "Return Trip")).toHaveAttribute("aria-current", "page");
      await expectLiveBrowserState(window, {
        expectedUrl: /phosphene-e2e=panel-two/,
        canGoBack: true,
        label: "after workspace switch away",
      });

      await workspaceTab(window, ACTIVE_WORKSPACE_NAME).click();
      await expect(workspaceTab(window, ACTIVE_WORKSPACE_NAME)).toHaveAttribute("aria-current", "page");
      await expectLiveBrowserState(window, {
        expectedUrl: /phosphene-e2e=panel-two/,
        canGoBack: true,
        label: "after workspace switch back",
      });
    } finally {
      await launch.cleanup();
    }
  });

  test("keeps the bottom-right control cluster usable across canvas states and widths", async () => {
    const launch = await launchSeededPanelFixture({ width: 2048, height: 1152 });

    try {
      const { window, fixture } = launch;
      await expect(activeWorkspacePage(window).getByText("No board selected")).toBeVisible();
      await expectCanvasControlsVisible(window);
      await expectCanvasControlsOffsetFromBottom(window);

      await delayBoardLoad(launch.app, launch.userDataDir, fixture.boardIdsByName[DELAYED_BOARD_NAME], 450);
      await workspaceBoards(window).getByRole("button", { name: DELAYED_BOARD_NAME, exact: true }).click();
      await expect(activeWorkspacePage(window).getByText("Loading board...")).toBeVisible();
      await expectCanvasControlsVisible(window);
      await expect(activeWorkspacePage(window).getByText("Loading board...")).toBeHidden();

      await workspaceBoards(window)
        .getByRole("button", { name: BROKEN_CANVAS_BOARD_NAME, exact: true })
        .click();
      await expect(activeWorkspacePage(window).getByText("Failed to load board")).toBeVisible();
      await expectCanvasControlsVisible(window);

      await workspaceBoards(window).getByRole("button", { name: FIRST_BOARD_NAME, exact: true }).click();
      await expect(window.locator(".excalidraw-wrapper")).toBeVisible({ timeout: 30_000 });
      await expectCanvasControlsVisible(window);
      await expectCanvasControlsOffsetFromBottom(window);
      await expectCanvasControlsDoNotOverlapExcalidrawControls(window);

      await window.setViewportSize({ width: 1080, height: 780 });
      await expectCanvasControlsVisible(window);
      await expectCanvasControlsInsideViewport(window);
      await expectCanvasControlsDoNotOverlapExcalidrawControls(window);
      const controls = window.getByRole("group", { name: "Canvas panel controls" }).getByRole("button");
      for (let index = 0; index < (await controls.count()); index += 1) {
        await controls.nth(index).click({ trial: true });
      }
    } finally {
      await launch.cleanup();
    }
  });
});

async function launchSeededPanelFixture(viewport: { width: number; height: number }) {
  const launch = await launchApp();
  const { window } = launch;

  try {
    await window.setViewportSize(viewport);
    await expect(workspaceTabBar(window).getByRole("button", { name: "Home", exact: true })).toBeVisible({
      timeout: 15_000,
    });

    const fixture = await seedPanelFixture(window);
    await installPublishStateFixture(launch.app, createPublishStates(fixture));
    await window.reload({ waitUntil: "domcontentloaded" });
    await window.setViewportSize(viewport);
    await waitForSeededFixtureReady(window);

    return {
      ...launch,
      fixture,
    };
  } catch (setupError) {
    await launch.cleanup();
    throw setupError;
  }
}

async function seedPanelFixture(page: Page): Promise<WorkspaceFixture> {
  return page.evaluate(
    async ({ workspaceNames, boardNames, activeWorkspaceName, brokenBoardName, firstBoardName }) => {
      const e2eWindow = window as unknown as E2EWindow;
      const existingWorkspaces = await e2eWindow.desktop.workspaces.list();
      if (existingWorkspaces.length === 0) {
        throw new Error("Expected the app to seed a default workspace before E2E fixture setup");
      }

      const workspaceIdsByName = {} as Record<WorkspaceName, string>;
      const firstWorkspace = existingWorkspaces[0];
      await e2eWindow.desktop.workspaces.rename(firstWorkspace.id, workspaceNames[0]);
      workspaceIdsByName[workspaceNames[0] as WorkspaceName] = firstWorkspace.id;

      for (const workspaceName of workspaceNames.slice(1)) {
        workspaceIdsByName[workspaceName as WorkspaceName] =
          await e2eWindow.desktop.workspaces.createWorkspace(workspaceName);
      }

      await e2eWindow.desktop.workspaces.reorderWorkspaces(
        workspaceNames.map((workspaceName) => workspaceIdsByName[workspaceName as WorkspaceName]),
      );

      const activeWorkspaceId = workspaceIdsByName[activeWorkspaceName as WorkspaceName];
      await e2eWindow.desktop.settings.setActiveWorkspaceId(activeWorkspaceId);

      for (const workspaceName of workspaceNames) {
        await e2eWindow.desktop.workspaces.saveLayout(workspaceIdsByName[workspaceName as WorkspaceName], {
          primaryPanelSize: 75,
          lastVisiblePrimaryPanelSize: 75,
          boardsVisible: true,
          browserVisible: true,
          activeBoardId: null,
        });
      }

      const boardIdsByName = {} as Record<BoardName, string>;
      for (const boardName of boardNames) {
        boardIdsByName[boardName as BoardName] =
          await e2eWindow.desktop.boards.createBoard(boardName, activeWorkspaceId);
      }

      await e2eWindow.desktop.boards.saveCanvasData(
        boardIdsByName[firstBoardName as BoardName],
        JSON.stringify({
          elements: [],
          appState: { viewBackgroundColor: "#f5f7fb" },
          files: {},
        }),
      );
      await e2eWindow.desktop.boards.saveCanvasData(
        boardIdsByName[brokenBoardName as BoardName],
        "{ this is intentionally invalid canvas JSON",
      );

      return { workspaceIdsByName, boardIdsByName };
    },
    {
      workspaceNames: ALL_WORKSPACE_NAMES,
      boardNames: BOARD_NAMES,
      activeWorkspaceName: ACTIVE_WORKSPACE_NAME,
      brokenBoardName: BROKEN_CANVAS_BOARD_NAME,
      firstBoardName: FIRST_BOARD_NAME,
    },
  );
}

function createPublishStates(fixture: WorkspaceFixture): Record<string, PublishState> {
  const workspaceId = (name: WorkspaceName) => fixture.workspaceIdsByName[name];

  return {
    [workspaceId("Columbia Charleston Planning Workspace")]: {
      state: "not-online",
      hasPublishedSnapshot: true,
      lastError: null,
      lastDeploymentUrl: "https://example.test/columbia",
    },
    [workspaceId("Return Trip")]: {
      state: "publish-failed",
      hasPublishedSnapshot: false,
      lastError: "E2E publish failure fixture",
      lastDeploymentUrl: null,
    },
    [workspaceId("House Ideas")]: {
      state: "not-online",
      hasPublishedSnapshot: true,
      lastError: null,
      lastDeploymentUrl: "https://example.test/house-ideas",
    },
    [workspaceId("Packing Notes")]: {
      state: "not-online",
      hasPublishedSnapshot: false,
      lastError: null,
      lastDeploymentUrl: null,
    },
    [workspaceId("Published State")]: {
      state: "online",
      hasPublishedSnapshot: true,
      lastError: null,
      lastDeploymentUrl: "https://example.test/published",
    },
    [workspaceId("Changed State")]: {
      state: "changed-since-publish",
      hasPublishedSnapshot: true,
      lastError: null,
      lastDeploymentUrl: "https://example.test/changed",
    },
  };
}

async function installPublishStateFixture(
  app: Awaited<ReturnType<typeof launchApp>>["app"],
  publishStates: Record<string, PublishState>,
): Promise<void> {
  await app.evaluate((electronMainProcess, states: Record<string, PublishState>) => {
    const { ipcMain } = electronMainProcess as ElectronMainProcess;
    ipcMain.removeHandler("web-publish:list-states");
    ipcMain.handle("web-publish:list-states", async () => states);
  }, publishStates);
}

async function waitForSeededFixtureReady(page: Page): Promise<void> {
  await expect(workspaceTab(page, ACTIVE_WORKSPACE_NAME)).toBeVisible({ timeout: 15_000 });
  await expect(deleteWorkspaceButton(page, ACTIVE_WORKSPACE_NAME)).toBeEnabled({ timeout: 15_000 });
  await expect(
    workspaceTabBar(page).getByRole("button", { name: `Unpublish ${ACTIVE_WORKSPACE_NAME}` }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(workspaceBoards(page).getByRole("button", { name: FIRST_BOARD_NAME, exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

async function delayBoardLoad(
  app: Awaited<ReturnType<typeof launchApp>>["app"],
  userDataDir: string,
  boardId: string,
  delayMs: number,
): Promise<void> {
  await app.evaluate(
    async (
      electronMainProcess,
      options: {
        databaseModulePath: string;
        userDataDir: string;
        delayedBoardId: string;
        delay: number;
      },
    ) => {
      type BoardRow = {
        id: string;
        workspace_id: string | null;
        name: string;
        description: string | null;
        canvas_data: string | null;
        thumbnail: string | null;
        position: number;
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
      };

      const moduleBuiltin = process.getBuiltinModule?.("node:module") as
        | { createRequire(path: string): (id: string) => unknown }
        | undefined;

      if (!moduleBuiltin) {
        throw new Error("node:module is unavailable in the Electron main process");
      }

      const require = moduleBuiltin.createRequire(options.databaseModulePath);
      const { getDatabase } = require(options.databaseModulePath) as DatabaseModule;
      const database = getDatabase(options.userDataDir);
      const { ipcMain } = electronMainProcess as ElectronMainProcess;
      const loadBoard = (requestedBoardId: string) => {
        const row = database
          .prepare(
            "SELECT id, workspace_id, name, description, canvas_data, thumbnail, position, created_at, updated_at, deleted_at FROM boards WHERE id = ? AND deleted_at IS NULL LIMIT 1",
          )
          .all(requestedBoardId)[0] as BoardRow | undefined;

        return row
          ? {
              id: row.id,
              workspaceId: row.workspace_id,
              name: row.name,
              description: row.description,
              canvasData: row.canvas_data,
              thumbnail: row.thumbnail,
              position: row.position,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              deletedAt: row.deleted_at,
            }
          : null;
      };
      const restoreProductionBoardGetHandler = () => {
        ipcMain.removeHandler("boards:get");
        ipcMain.handle("boards:get", async (_event, requestedBoardId) => {
          if (typeof requestedBoardId !== "string") {
            throw new Error("[IPC boards:get] Invalid payload: expected boardId to be a string");
          }

          return loadBoard(requestedBoardId);
        });
      };

      ipcMain.removeHandler("boards:get");
      ipcMain.handle("boards:get", async (_event, requestedBoardId) => {
        if (typeof requestedBoardId !== "string") {
          throw new Error("[IPC boards:get] Invalid payload: expected boardId to be a string");
        }

        if (requestedBoardId === options.delayedBoardId) {
          await new Promise((resolve) => setTimeout(resolve, options.delay));
          restoreProductionBoardGetHandler();
        }

        return loadBoard(requestedBoardId);
      });
    },
    {
      databaseModulePath: path.join(process.cwd(), "dist-electron", "ipc", "database.js"),
      userDataDir,
      delayedBoardId: boardId,
      delay: delayMs,
    },
  );
}

function workspaceTabBar(page: Page): Locator {
  return page.getByRole("banner", { name: "Workspaces" });
}

function workspaceTab(page: Page, workspaceName: WorkspaceName | RequiredWorkspaceName): Locator {
  return workspaceTabBar(page).getByRole("button", { name: workspaceName, exact: true });
}

function deleteWorkspaceButton(page: Page, workspaceName: RequiredWorkspaceName): Locator {
  return workspaceTabBar(page).getByRole("button", { name: `Delete ${workspaceName}` });
}

function confirmWorkspaceDeleteButton(page: Page, workspaceName: RequiredWorkspaceName): Locator {
  return workspaceTabBar(page).getByRole("button", { name: `Confirm delete ${workspaceName}` });
}

function workspaceBoards(page: Page): Locator {
  return page.getByRole("complementary", { name: "Workspace boards" });
}

function boardRow(page: Page, boardName: BoardName): Locator {
  return workspaceBoards(page).locator(".board-list__item").filter({ hasText: boardName }).first();
}

function boardDeleteButton(page: Page, boardName: BoardName): Locator {
  return boardRow(page, boardName).getByRole("button", { name: `Delete ${boardName}` });
}

function confirmBoardDeleteButton(page: Page, boardName: BoardName): Locator {
  return boardRow(page, boardName).getByRole("button", { name: `Confirm delete ${boardName}` });
}

async function expectCompactTabControl(locator: Locator, label: string): Promise<void> {
  await expect(locator, `${label} should be visible`).toBeVisible();
  await expect(locator, `${label} should be enabled`).toBeEnabled();
  await locator.click({ trial: true });
  await locator.focus();
  await expect(locator, `${label} should be keyboard focusable`).toBeFocused();

  const box = await requireVisibleBox(locator, label);
  expect(box.width, `${label} width`).toBeGreaterThanOrEqual(24);
  expect(box.height, `${label} height`).toBeGreaterThanOrEqual(24);
  expect(box.width, `${label} width`).toBeLessThanOrEqual(32);
  expect(box.height, `${label} height`).toBeLessThanOrEqual(32);
}

async function expectNoCompactControlOverlaps(tabBar: Locator): Promise<void> {
  const boxes = await tabBar
    .locator(
      ".workspace-publish-controls__button, .workspace-tab-bar__close-button, .workspace-tab-bar__create-button",
    )
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return {
            label: element.getAttribute("aria-label") ?? element.textContent ?? "control",
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            right: rect.right,
            bottom: rect.bottom,
            visibility: style.visibility,
            display: style.display,
          };
        })
        .filter(
          (box) =>
            box.width > 0 &&
            box.height > 0 &&
            box.visibility !== "hidden" &&
            box.display !== "none",
        ),
    );

  expect(boxes.length).toBeGreaterThan(0);

  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      expect(
        boxesOverlap(boxes[leftIndex], boxes[rightIndex]),
        `${boxes[leftIndex].label} should not overlap ${boxes[rightIndex].label}`,
      ).toBe(false);
    }
  }
}

async function expectCanvasControlsVisible(page: Page): Promise<void> {
  const group = page.getByRole("group", { name: "Canvas panel controls" });
  await expect(group).toBeVisible();
  await expect(group.getByRole("button")).toHaveCount(3);

  for (let index = 0; index < 3; index += 1) {
    const button = group.getByRole("button").nth(index);
    const box = await requireVisibleBox(button, `canvas control ${index + 1}`);
    expect(box.width).toBeGreaterThanOrEqual(28);
    expect(box.height).toBeGreaterThanOrEqual(28);
  }
}

async function expectCanvasControlsOffsetFromBottom(page: Page): Promise<void> {
  const groupBox = await requireVisibleBox(
    page.getByRole("group", { name: "Canvas panel controls" }),
    "canvas controls",
  );
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(viewport!.height - (groupBox.y + groupBox.height)).toBeGreaterThanOrEqual(56);
}

async function expectCanvasControlsInsideViewport(page: Page): Promise<void> {
  await expectElementWithinViewport(
    page,
    page.getByRole("group", { name: "Canvas panel controls" }),
    "canvas controls",
  );
}

async function expectCanvasControlsDoNotOverlapExcalidrawControls(page: Page): Promise<void> {
  const result = await activeWorkspacePage(page).evaluate(() => {
    const controls = document.querySelector(".workspace-canvas-controls");
    const excalidraw = document.querySelector(".excalidraw");

    if (!controls || !excalidraw) {
      return {
        visibleExcalidrawControls: 0,
        overlaps: ["Missing canvas controls or Excalidraw root"],
      };
    }

    const controlsRect = controls.getBoundingClientRect();
    const visibleButtons = Array.from(excalidraw.querySelectorAll("button, [role='button']"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const label =
          element.getAttribute("aria-label") ??
          element.getAttribute("title") ??
          element.textContent?.trim() ??
          "Excalidraw control";

        return {
          label,
          x: rect.x,
          y: rect.y,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden",
        };
      })
      .filter((box) => box.visible && box.width <= 180 && box.height <= 90);

    const overlaps = visibleButtons
      .filter(
        (box) =>
          controlsRect.x < box.right &&
          controlsRect.right > box.x &&
          controlsRect.y < box.bottom &&
          controlsRect.bottom > box.y,
      )
      .map((box) => box.label);

    return {
      visibleExcalidrawControls: visibleButtons.length,
      overlaps,
    };
  });

  expect(result.visibleExcalidrawControls).toBeGreaterThan(0);
  expect(result.overlaps).toEqual([]);
}

async function expectElementWithinViewport(page: Page, locator: Locator, label: string): Promise<void> {
  const box = await requireVisibleBox(locator, label);
  const viewport = page.viewportSize();
  expect(viewport, "viewport should be set").not.toBeNull();
  expect(box.x, `${label} left edge`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${label} top edge`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${label} right edge`).toBeLessThanOrEqual(viewport!.width);
  expect(box.y + box.height, `${label} bottom edge`).toBeLessThanOrEqual(viewport!.height);
}

async function expectElementWithinContainer(locator: Locator, container: Locator, label: string): Promise<void> {
  const box = await requireVisibleBox(locator, label);
  const containerBox = await requireVisibleBox(container, `${label} container`);

  expect(box.x, `${label} left edge within container`).toBeGreaterThanOrEqual(containerBox.x);
  expect(box.y, `${label} top edge within container`).toBeGreaterThanOrEqual(containerBox.y);
  expect(box.x + box.width, `${label} right edge within container`).toBeLessThanOrEqual(
    containerBox.x + containerBox.width,
  );
  expect(box.y + box.height, `${label} bottom edge within container`).toBeLessThanOrEqual(
    containerBox.y + containerBox.height,
  );
}

async function requireVisibleBox(locator: Locator, label: string) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} should have a rendered bounding box`).not.toBeNull();
  return box!;
}

async function expectLiveBrowserState(
  page: Page,
  options: {
    expectedUrl: RegExp;
    canGoBack: boolean;
    label: string;
  },
): Promise<void> {
  await expect
    .poll(
      async () =>
        await page.evaluate(async ({ source, flags }) => {
          const e2eWindow = window as unknown as E2EWindow;
          const state = await e2eWindow.desktop.browser.getState();
          const expectedUrl = new RegExp(source, flags);

          return {
            urlMatches: expectedUrl.test(state.url),
            canGoBack: state.canGoBack,
            isLoading: state.isLoading,
            lastError: state.lastError,
          };
        }, { source: options.expectedUrl.source, flags: options.expectedUrl.flags }),
      { message: `${options.label} browser state` },
    )
    .toEqual({
      urlMatches: true,
      canGoBack: options.canGoBack,
      isLoading: false,
      lastError: null,
    });
}

async function expectMixedCanvasFocusCollapse(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Hide boards panel" }).click();
  await expect(page.getByRole("button", { name: "Show boards panel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide browser panel" })).toBeVisible();
  await page.getByRole("button", { name: "Focus canvas" }).click();
  await expect(page.getByRole("button", { name: "Show boards panel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show browser panel" })).toBeVisible();
  await expect.poll(() => pollRoundedRectWidth(page, ".workspace-sidebar-shell")).toBe(0);
  await expect.poll(() => pollRoundedRectWidth(page, ".panel-secondary")).toBe(0);

  await page.getByRole("button", { name: "Restore panels" }).click();
  await expect(page.getByRole("button", { name: "Hide boards panel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide browser panel" })).toBeVisible();
  await expect.poll(() => pollRoundedRectWidth(page, ".workspace-sidebar-shell")).toBeGreaterThan(250);
  await expect.poll(() => pollRoundedRectWidth(page, ".panel-secondary")).toBeGreaterThan(200);

  await page.getByRole("button", { name: "Hide browser panel" }).click();
  await expect(page.getByRole("button", { name: "Hide boards panel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show browser panel" })).toBeVisible();
  await page.getByRole("button", { name: "Focus canvas" }).click();
  await expect(page.getByRole("button", { name: "Show boards panel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show browser panel" })).toBeVisible();
  await expect.poll(() => pollRoundedRectWidth(page, ".workspace-sidebar-shell")).toBe(0);
  await expect.poll(() => pollRoundedRectWidth(page, ".panel-secondary")).toBe(0);

  await page.getByRole("button", { name: "Restore panels" }).click();
  await expect(page.getByRole("button", { name: "Hide boards panel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide browser panel" })).toBeVisible();
  await expect.poll(() => pollRoundedRectWidth(page, ".workspace-sidebar-shell")).toBeGreaterThan(250);
  await expect.poll(() => pollRoundedRectWidth(page, ".panel-secondary")).toBeGreaterThan(200);
}

async function activeWorkspaceRect(page: Page, selector: string): Promise<Rect> {
  return activeWorkspacePage(page).locator(selector).first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
      visibility: style.visibility,
      display: style.display,
    };
  });
}

function activeWorkspacePage(page: Page): Locator {
  return page.locator('.workspace-page[aria-hidden="false"]').first();
}

async function pollRoundedRectWidth(page: Page, selector: string): Promise<number> {
  const rect = await activeWorkspaceRect(page, selector);
  return Math.round(rect.width);
}

function boxesOverlap(left: Pick<Rect, "x" | "y" | "right" | "bottom">, right: Pick<Rect, "x" | "y" | "right" | "bottom">) {
  return left.x < right.right && left.right > right.x && left.y < right.bottom && left.bottom > right.y;
}
