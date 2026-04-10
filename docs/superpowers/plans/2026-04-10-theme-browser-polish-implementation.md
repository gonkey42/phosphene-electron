# Theme And Browser Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the recently shipped theme and browser-panel work so the sidebar is theme-aware, the browser pane behaves like a real full-bleed browser surface, theme switching moves into the native `View` menu, and the top chrome becomes cleaner and text-only.

**Architecture:** Keep the current renderer theme controller and single-owner `BrowserView` architecture, but tighten the renderer layout/CSS, add a small native theme-menu bridge between Electron main and renderer, and wire native context menus for both the address field and embedded webpage. The branch stays the same; this is a cohesive follow-up fix pass rather than a new feature branch.

**Tech Stack:** React 18, Zustand, Electron 41, BrowserView, Vitest, Testing Library, TypeScript, Vite

---

### Task 1: Theme The Boards Pane And Remove Workspace Emoji Rendering

**Files:**
- Modify: `src/components/sidebar/Sidebar.tsx`
- Create: `src/components/sidebar/Sidebar.css`
- Modify: `src/components/sidebar/BoardList.css`
- Modify: `src/lib/workspace-operations.ts`
- Modify: `src/components/workspace/WorkspaceTabBar.tsx`
- Modify: `src/components/workspace/WorkspaceTabBar.test.tsx`

- [ ] **Step 1: Write the failing sidebar/theme and text-only workspace tests**

```tsx
// src/components/workspace/WorkspaceTabBar.test.tsx
it("renders text-only workspace tabs with the create button immediately after the last tab", async () => {
  listWorkspacesMock.mockResolvedValue([
    createWorkspaceItem({ id: "workspace-1", name: "Home", icon: "🏠", position: 0 }),
    createWorkspaceItem({ id: "workspace-2", name: "Projects", icon: "🗂️", position: 1 }),
  ]);

  render(<WorkspaceTabBar />);

  const home = await screen.findByRole("button", { name: "Home" });
  const projects = screen.getByRole("button", { name: "Projects" });
  const create = screen.getByRole("button", { name: "Create workspace" });

  expect(home).toHaveTextContent("Home");
  expect(projects).toHaveTextContent("Projects");
  expect(home).not.toHaveTextContent("🏠");
  expect(projects).not.toHaveTextContent("🗂️");
  expect(projects.parentElement?.nextElementSibling).toContainElement(create);
});

it("creates a new workspace without seeding an emoji icon", async () => {
  listWorkspacesMock.mockResolvedValueOnce([createWorkspaceItem()]);
  listWorkspacesMock.mockResolvedValueOnce([
    createWorkspaceItem(),
    createWorkspaceItem({ id: "workspace-2", name: "Workspace 2", icon: null, position: 1 }),
  ]);
  createWorkspaceMock.mockResolvedValue("workspace-2");

  render(<WorkspaceTabBar />);

  fireEvent.click(await screen.findByRole("button", { name: "Create workspace" }));

  await waitFor(() => {
    expect(createWorkspaceMock).toHaveBeenCalledWith("Workspace 2", undefined);
  });
});
```

```tsx
// src/components/sidebar/Sidebar.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./BoardList", () => ({
  BoardList: () => <div data-testid="board-list" />,
}));

import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  it("uses CSS theming instead of inline light-only styles", () => {
    render(<Sidebar workspaceId="workspace-1" />);

    const sidebar = screen.getByLabelText("Workspace boards");
    expect(sidebar).toHaveClass("sidebar");
    expect(sidebar).not.toHaveAttribute("style");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/sidebar/Sidebar.test.tsx src/components/workspace/WorkspaceTabBar.test.tsx`

Expected: FAIL because the sidebar still uses inline styling, workspace tabs still render emoji icons, and the create button/theme control layout has not been updated yet.

- [ ] **Step 3: Implement themed sidebar shell and text-only workspace tabs**

```tsx
// src/components/sidebar/Sidebar.tsx
import { BoardList } from "./BoardList";
import "./Sidebar.css";

interface SidebarProps {
  workspaceId?: string;
  onBoardSelect?: (boardId: string | null) => void;
}

export function Sidebar({ workspaceId, onBoardSelect }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Workspace boards">
      <BoardList workspaceId={workspaceId} onBoardSelect={onBoardSelect} />
    </aside>
  );
}
```

```css
/* src/components/sidebar/Sidebar.css */
.sidebar {
  background: var(--app-surface-muted);
  border-right: 1px solid var(--app-border);
  color: var(--app-text);
  display: flex;
  flex: 0 0 18rem;
  min-height: 0;
  width: 18rem;
}
```

```ts
// src/lib/workspace-operations.ts
export function mapWorkspace(item: WorkspaceListItem) {
  return {
    id: item.id,
    name: item.name,
    icon: item.icon,
    position: item.position,
  };
}

export async function createWorkspace(name: string, icon?: string): Promise<string> {
  return workspaces.createWorkspace(name, icon);
}
```

```tsx
// src/components/workspace/WorkspaceTabBar.tsx
// remove WorkspaceThemeModeSelector import
// render create button as the last item in the tabs list
// remove visual icon span from tab labels
const nextWorkspaces = workspaces.some((workspace) => workspace.id === workspaceId)
  ? workspaces
  : [...workspaces, mapWorkspace({ id: workspaceId, name: nextName, icon: null, position: nextPosition })];
...
<ul className="workspace-tab-bar__tabs">
  {workspaces.map((workspace, index) => {
    const shortcut = getShortcutLabel(index);
    return (
      <li key={workspace.id} className={`workspace-tab-bar__tab-item${isActive ? " workspace-tab-bar__tab-item--active" : ""}`}>
        ...
        <button ...>
          <span className="workspace-tab-bar__name">{workspace.name}</span>
          {shortcut ? <span className="workspace-tab-bar__shortcut">{shortcut}</span> : null}
        </button>
      </li>
    );
  })}
  <li className="workspace-tab-bar__tab-item workspace-tab-bar__tab-item--create">
    <button
      type="button"
      className="workspace-tab-bar__create-button"
      aria-label="Create workspace"
      onClick={() => void handleCreateWorkspace()}
    >
      +
    </button>
  </li>
</ul>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/components/sidebar/Sidebar.test.tsx src/components/workspace/WorkspaceTabBar.test.tsx`

Expected: PASS for themed sidebar shell, text-only tabs, and inline create-button placement.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/Sidebar.tsx src/components/sidebar/Sidebar.css src/components/sidebar/BoardList.css src/lib/workspace-operations.ts src/components/workspace/WorkspaceTabBar.tsx src/components/workspace/WorkspaceTabBar.test.tsx src/components/sidebar/Sidebar.test.tsx
git commit -m "feat: theme sidebar and simplify workspace tabs"
```

### Task 2: Remove The Top-Bar Theme Control And Add Native View Menu Theme Switching

**Files:**
- Modify: `src/components/AppShell.tsx`
- Modify: `src/components/workspace/WorkspaceTabBar.tsx`
- Modify: `src/components/workspace/WorkspaceTabBar.css`
- Delete: `src/components/workspace/WorkspaceThemeModeSelector.tsx`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/platform/desktop-api.ts`
- Modify: `src/types/desktop.d.ts`
- Modify: `src/hooks/use-theme-controller.ts`
- Modify: `electron/main.test.ts`
- Modify: `electron/preload.test.ts`
- Modify: `src/components/AppShell.test.tsx`
- Modify: `src/components/workspace/WorkspaceTabBar.test.tsx`

- [ ] **Step 1: Write the failing menu-theme and top-bar cleanup tests**

```tsx
// src/components/AppShell.test.tsx
it("does not pass theme selector props into the workspace tab bar", async () => {
  listWorkspacesMock.mockResolvedValue([]);
  getDbMock.mockResolvedValue({});
  runDailyBackupMock.mockResolvedValue(undefined);

  const { AppShell } = await import("./AppShell");
  render(<AppShell />);

  await screen.findByTestId("workspace-tab-bar");
  expect(tabBarMock).toHaveBeenCalledWith({});
});
```

```tsx
// src/components/workspace/WorkspaceTabBar.test.tsx
it("does not render a theme mode selector in the tab bar", async () => {
  listWorkspacesMock.mockResolvedValue([createWorkspaceItem()]);

  render(<WorkspaceTabBar />);

  await screen.findByRole("button", { name: "Home" });
  expect(screen.queryByLabelText("Theme mode")).not.toBeInTheDocument();
});
```

```ts
// electron/main.test.ts
it("registers a View > Theme submenu with system, light, and dark entries", async () => {
  await import("./main");
  await waitForAsyncEffects();
  expect(menuBuildFromTemplateMock).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        label: "View",
        submenu: expect.arrayContaining([
          expect.objectContaining({ label: "Theme" }),
        ]),
      }),
    ]),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/AppShell.test.tsx src/components/workspace/WorkspaceTabBar.test.tsx electron/main.test.ts`

Expected: FAIL because the theme selector still renders in the top bar and no native theme menu exists yet.

- [ ] **Step 3: Implement the native theme menu bridge**

```ts
// src/types/desktop.d.ts
interface DesktopThemeAPI {
  setPreference(preference: "system" | "light" | "dark"): Promise<void>;
  onPreferenceSelected(callback: (preference: "system" | "light" | "dark") => void): () => void;
}

interface DesktopAPI {
  ...
  theme: DesktopThemeAPI;
}
```

```ts
// src/platform/desktop-api.ts
export const theme = {
  setPreference(preference: ThemePreference) {
    return getDesktop().theme.setPreference(preference);
  },
  onPreferenceSelected(callback: (preference: ThemePreference) => void) {
    return getDesktop().theme.onPreferenceSelected(callback);
  },
};
```

```ts
// electron/main.ts
import { Menu } from "electron";

function buildApplicationMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [{ role: "appMenu" as const }]
      : []),
    {
      label: "View",
      submenu: [
        {
          label: "Theme",
          submenu: [
            { id: "theme-system", label: "System", type: "radio", checked: true, click: () => broadcastThemePreference("system") },
            { id: "theme-light", label: "Light", type: "radio", click: () => broadcastThemePreference("light") },
            { id: "theme-dark", label: "Dark", type: "radio", click: () => broadcastThemePreference("dark") },
          ],
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
```

```ts
// electron/preload.ts
theme: {
  setPreference(preference: "system" | "light" | "dark") {
    return ipcRenderer.invoke("theme:set-preference", preference);
  },
  onPreferenceSelected(callback) {
    const listener = (_event: unknown, preference: "system" | "light" | "dark") => callback(preference);
    ipcRenderer.on("theme:preference-selected", listener);
    return () => ipcRenderer.off("theme:preference-selected", listener);
  },
},
```

```ts
// src/hooks/use-theme-controller.ts
useEffect(() => {
  const unsubscribe = theme.onPreferenceSelected((preference) => {
    void updateThemePreference(preference);
  });

  return unsubscribe;
}, [updateThemePreference]);

useEffect(() => {
  void theme.setPreference(themePreference);
}, [themePreference]);
```

```tsx
// src/components/AppShell.tsx
<WorkspaceTabBar />
```

- [ ] **Step 4: Remove the top-bar theme selector and adjust tab-bar styling**

```tsx
// src/components/workspace/WorkspaceTabBar.tsx
export interface WorkspaceTabBarProps {}
export function WorkspaceTabBar() { ... }
```

```css
/* src/components/workspace/WorkspaceTabBar.css */
.workspace-tab-bar {
  justify-content: flex-start;
}

.workspace-tab-bar__tabs {
  flex: 0 1 auto;
  overflow: visible;
}

.workspace-tab-bar__tab-item--create {
  flex: 0 0 auto;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/components/AppShell.test.tsx src/components/workspace/WorkspaceTabBar.test.tsx electron/main.test.ts electron/preload.test.ts`

Expected: PASS for renderer cleanup and native theme menu wiring.

- [ ] **Step 6: Commit**

```bash
git add src/components/AppShell.tsx src/components/workspace/WorkspaceTabBar.tsx src/components/workspace/WorkspaceTabBar.css electron/main.ts electron/preload.ts src/platform/desktop-api.ts src/types/desktop.d.ts src/hooks/use-theme-controller.ts src/components/AppShell.test.tsx src/components/workspace/WorkspaceTabBar.test.tsx electron/main.test.ts electron/preload.test.ts
git commit -m "feat: move theme switching into the native menu"
```

### Task 3: Make The Browser Pane Full-Bleed And Compact

**Files:**
- Modify: `src/components/layout/PanelLayout.css`
- Modify: `src/components/browser/BrowserPanel.tsx`
- Modify: `src/components/browser/BrowserPanel.css`
- Modify: `src/components/browser/BrowserPanel.test.tsx`

- [ ] **Step 1: Write the failing browser layout/chrome tests**

```tsx
// src/components/browser/BrowserPanel.test.tsx
it("renders a single-row browser toolbar without the redundant status line", () => {
  render(<BrowserPanel />);

  expect(screen.getByRole("form", { name: "Browser navigation" })).toBeInTheDocument();
  expect(screen.queryByText("No page loaded")).not.toBeInTheDocument();
});

it("renders icon-style browser navigation controls", () => {
  render(<BrowserPanel />);

  expect(screen.getByRole("button", { name: "Back" })).toHaveAttribute("data-icon-button", "true");
  expect(screen.getByRole("button", { name: "Forward" })).toHaveAttribute("data-icon-button", "true");
  expect(screen.getByRole("button", { name: "Reload" })).toHaveAttribute("data-icon-button", "true");
});

it("stretches the browser host to the full pane width", () => {
  render(<BrowserPanel />);
  expect(screen.getByTestId("browser-panel")).toHaveClass("browser-panel--full-bleed");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/browser/BrowserPanel.test.tsx`

Expected: FAIL because the browser panel still renders the second line and does not expose the new compact/full-bleed contract.

- [ ] **Step 3: Implement full-bleed panel and compact toolbar**

```css
/* src/components/layout/PanelLayout.css */
.panel-secondary {
  align-items: stretch;
  background: transparent;
  color: inherit;
  display: flex;
  justify-content: stretch;
  min-width: 0;
  overflow: hidden;
}
```

```tsx
// src/components/browser/BrowserPanel.tsx
return (
  <section
    className={`browser-panel browser-panel--${resolvedTheme} browser-panel--full-bleed`}
    data-testid="browser-panel"
    onPointerDown={() => setFocus("browser")}
  >
    <form aria-label="Browser navigation" className="browser-panel__controls" onSubmit={...}>
      <button type="button" aria-label="Back" data-icon-button="true" ...>←</button>
      <button type="button" aria-label="Forward" data-icon-button="true" ...>→</button>
      <button type="button" aria-label="Reload" data-icon-button="true" ...>↻</button>
      <input ... className="browser-panel__address" />
      <button type="submit" className="browser-panel__go">Go</button>
    </form>
    {browserState.lastError ? <div className="browser-panel__error" role="alert">...</div> : null}
    <div ref={hostRef} className="browser-panel__host" />
  </section>
);
```

```css
/* src/components/browser/BrowserPanel.css */
.browser-panel--full-bleed {
  width: 100%;
}

.browser-panel__controls {
  align-items: center;
  display: grid;
  gap: 8px;
  grid-template-columns: auto auto auto minmax(0, 1fr) auto;
  padding: 8px 10px;
}

.browser-panel__status {
  display: none;
}

.browser-panel__controls [data-icon-button="true"] {
  min-width: 34px;
  padding: 0;
}

.browser-panel__host {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  width: 100%;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/components/browser/BrowserPanel.test.tsx`

Expected: PASS for the compact browser toolbar and full-bleed panel contract.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/PanelLayout.css src/components/browser/BrowserPanel.tsx src/components/browser/BrowserPanel.css src/components/browser/BrowserPanel.test.tsx
git commit -m "feat: make browser pane full bleed and compact"
```

### Task 4: Fix Browser Bounds Sync And Add Context Menus

**Files:**
- Modify: `src/components/browser/BrowserPanel.tsx`
- Modify: `src/components/browser/BrowserPanel.test.tsx`
- Modify: `electron/ipc/browser.ts`
- Modify: `electron/main.ts`
- Modify: `electron/main.test.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/preload.test.ts`
- Modify: `src/platform/desktop-api.ts`
- Modify: `src/types/desktop.d.ts`

- [ ] **Step 1: Write the failing resize/context-menu tests**

```tsx
// src/components/browser/BrowserPanel.test.tsx
it("updates browser bounds when the host size changes", async () => {
  render(<BrowserPanel />);
  await waitFor(() => {
    expect(setBoundsMock).toHaveBeenCalled();
  });
});
```

```ts
// electron/main.test.ts
it("registers a browser webpage context menu", async () => {
  await import("./main");
  await waitForAsyncEffects();

  const attachHandler = ipcMainHandleMock.mock.calls.find(([channel]) => channel === "browser:attach")?.[1];
  const windowInstance = new BrowserWindowMock();
  browserWindowFromWebContentsMock.mockReturnValue(windowInstance);
  await attachHandler?.({ sender: windowInstance.webContents } as never, { x: 0, y: 0, width: 300, height: 200 });

  const attachedView = browserWindowSetBrowserViewMock.mock.calls[0]?.[0] as BrowserViewMock;
  expect(attachedView.webContents.on).toHaveBeenCalledWith("context-menu", expect.any(Function));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/browser/BrowserPanel.test.tsx electron/main.test.ts electron/preload.test.ts`

Expected: FAIL because the current browser bridge has no context-menu plumbing and the resize contract has not been tightened enough for the new assertions.

- [ ] **Step 3: Add consistent bounds updates and address-input context menu support**

```tsx
// src/components/browser/BrowserPanel.tsx
import { browser, contextMenu, type BrowserState } from "../../platform/desktop-api";

const syncBounds = (host: HTMLDivElement) => {
  return Promise.resolve()
    .then(() => browser.setBounds(getBrowserBounds(host)))
    .catch(reportBrowserError);
};

useEffect(() => {
  const host = hostRef.current;
  if (!host) {
    return;
  }

  void browser.attach(getBrowserBounds(host)).catch(reportBrowserError);

  const observer = typeof window.ResizeObserver === "function"
    ? new window.ResizeObserver(() => {
        void syncBounds(host);
      })
    : null;

  observer?.observe(host);
  window.addEventListener("resize", handleWindowResize);

  return () => {
    observer?.disconnect();
    window.removeEventListener("resize", handleWindowResize);
    void browser.destroy();
  };
}, []);

<input
  ...
  onContextMenu={(event) => {
    event.preventDefault();
    void contextMenu.showAddressInputMenu();
  }}
/>
```

- [ ] **Step 4: Expose address-input menu IPC and add webpage context-menu support in Electron**

```ts
// src/types/desktop.d.ts
interface DesktopContextMenuAPI {
  showAddressInputMenu(): Promise<void>;
}

interface DesktopAPI {
  ...
  contextMenu: DesktopContextMenuAPI;
}
```

```ts
// src/platform/desktop-api.ts
export const contextMenu = {
  showAddressInputMenu() {
    return getDesktop().contextMenu.showAddressInputMenu();
  },
};
```

```ts
// electron/preload.ts
contextMenu: {
  showAddressInputMenu() {
    return ipcRenderer.invoke("browser:show-address-input-menu");
  },
},
```

```ts
// electron/ipc/browser.ts
import { Menu } from "electron";

ipcMain.handle("browser:show-address-input-menu", async (event) => {
  const window = getWindowForEvent(event);
  if (!window) {
    return;
  }

  Menu.buildFromTemplate([
    { role: "undo" as const },
    { role: "redo" as const },
    { type: "separator" as const },
    { role: "cut" as const },
    { role: "copy" as const },
    { role: "paste" as const },
    { role: "selectAll" as const },
  ]).popup({ window });
});

const handleContextMenu = (_event: unknown, params: Electron.ContextMenuParams) => {
  const template = [
    { role: "back", enabled: browserView.webContents.canGoBack() },
    { role: "forward", enabled: browserView.webContents.canGoForward() },
    { type: "separator" as const },
    { role: "reload" as const },
    { type: "separator" as const },
    { role: "cut" as const, enabled: params.editFlags.canCut },
    { role: "copy" as const, enabled: params.editFlags.canCopy },
    { role: "paste" as const, enabled: params.editFlags.canPaste },
    { role: "selectAll" as const },
  ];

  Menu.buildFromTemplate(template).popup({ window });
};

browserView.webContents.on("context-menu", handleContextMenu);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/components/browser/BrowserPanel.test.tsx electron/main.test.ts electron/preload.test.ts`

Expected: PASS for bounds-sync and native context-menu plumbing.

- [ ] **Step 6: Commit**

```bash
git add src/components/browser/BrowserPanel.tsx src/components/browser/BrowserPanel.test.tsx electron/ipc/browser.ts electron/main.ts electron/main.test.ts electron/preload.ts electron/preload.test.ts src/platform/desktop-api.ts src/types/desktop.d.ts
git commit -m "feat: add browser resize polish and context menus"
```

### Task 5: Full Verification And Cleanup

**Files:**
- Modify: `src/components/sidebar/BoardList.css`
- Modify: `src/components/workspace/WorkspaceTabBar.css`
- Modify: `src/components/workspace/WorkspaceTabBar.test.tsx`
- Modify: any tests touched in Tasks 1-4 for final alignment

- [ ] **Step 1: Tighten sidebar and top-bar visual tokens**

```css
/* src/components/sidebar/BoardList.css */
.board-list__title,
.board-list__item-button,
.board-list__empty-title {
  color: var(--app-text);
}

.board-list__item,
.board-list__rename-input,
.board-list__create-button,
.board-list__action-button {
  background: var(--app-surface);
  border-color: var(--app-border);
  color: var(--app-text);
}

.board-list__item-meta,
.board-list__empty {
  color: var(--app-text-muted);
}
```

```css
/* src/components/workspace/WorkspaceTabBar.css */
.workspace-tab-bar {
  gap: 0.25rem;
}

.workspace-tab-bar__tabs {
  align-items: center;
}
```

- [ ] **Step 2: Run the focused verification suite**

Run: `npm test -- src/components/sidebar/Sidebar.test.tsx src/components/workspace/WorkspaceTabBar.test.tsx src/components/AppShell.test.tsx src/components/browser/BrowserPanel.test.tsx electron/main.test.ts electron/preload.test.ts`

Expected: PASS for the follow-up polish slice.

- [ ] **Step 3: Run the broader verification suite**

Run: `npm test -- src/lib/theme-settings.test.ts src/hooks/use-theme-controller.test.tsx src/components/AppShell.test.tsx src/components/workspace/WorkspaceTabBar.test.tsx src/components/canvas/ExcalidrawCanvas.test.tsx src/components/canvas/CanvasPanel.test.tsx electron/preload.test.ts electron/main.test.ts src/components/browser/BrowserPanel.test.tsx src/components/workspace/WorkspaceContainer.test.tsx src/hooks/use-keyboard-shortcuts.test.tsx src/components/sidebar/Sidebar.test.tsx`

Expected: PASS for the full theme and browser slice plus the new sidebar coverage.

Run: `npx tsc --noEmit`

Expected: PASS with no type errors.

Run: `npm run build`

Expected: PASS. Chunk-size warnings are acceptable if the build exits `0`.

Run: `npm run build:main`

Expected: PASS.

- [ ] **Step 4: Commit final cleanup**

```bash
git add src/components/sidebar/Sidebar.tsx src/components/sidebar/Sidebar.css src/components/sidebar/BoardList.css src/components/workspace/WorkspaceTabBar.tsx src/components/workspace/WorkspaceTabBar.css src/components/AppShell.tsx src/components/browser/BrowserPanel.tsx src/components/browser/BrowserPanel.css src/components/browser/BrowserPanel.test.tsx src/components/sidebar/Sidebar.test.tsx src/components/workspace/WorkspaceTabBar.test.tsx src/components/AppShell.test.tsx electron/main.ts electron/ipc/browser.ts electron/main.test.ts electron/preload.ts electron/preload.test.ts src/platform/desktop-api.ts src/types/desktop.d.ts src/hooks/use-theme-controller.ts src/lib/workspace-operations.ts
git commit -m "feat: polish theme menu and browser pane behavior"
```

## Self-review

### Spec coverage

- Sidebar follows app theme: covered in Tasks 1 and 5.
- Browser pane becomes full-bleed and resizes correctly: covered in Tasks 3 and 4.
- Browser chrome becomes compact single-row with icon nav buttons: covered in Task 3.
- Theme switching moves to native `View` menu: covered in Task 2.
- Top-bar `+` moves next to tabs: covered in Tasks 1 and 2.
- Emoji workspace icons disappear from UI and default creation: covered in Task 1.
- Right-click context menus for address input and embedded webpage: covered in Task 4.

### Placeholder scan

- No `TODO`, `TBD`, or “similar to” placeholders remain.
- Every task includes explicit files, commands, and expected outcomes.

### Type consistency

- Theme preference types stay `ThemePreference` throughout renderer, preload, and Electron menu wiring.
- Browser bounds and browser state keep the existing type names already used by the browser bridge.
