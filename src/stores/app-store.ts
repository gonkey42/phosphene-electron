import { create } from "zustand";
import { DEFAULT_THEME_PREFERENCE } from "../lib/theme-types";
import type { ResolvedTheme, ThemePreference } from "../lib/theme-types";

export type FocusTarget = "canvas" | "browser" | "widget" | "global";
export type InitializationStatus = "idle" | "loading" | "ready" | "error";

export interface InitializationError {
  title: string;
  detail: string;
}

export type InitializationState =
  | { status: "idle" | "loading" | "ready" }
  | { status: "error"; error: InitializationError };

export interface Workspace {
  id: string;
  name: string;
  icon: string;
  position: number;
}

export interface Board {
  id: string;
  workspaceId: string | null;
  name: string;
  description: string | null;
  position: number;
  updatedAt: string;
}

interface AppState {
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setThemePreference: (preference: ThemePreference) => void;
  setResolvedTheme: (theme: ResolvedTheme) => void;

  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  setActiveWorkspace: (id: string) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;

  boards: Board[];
  activeBoardId: string | null;
  activeBoardPerWorkspace: Record<string, string | null>;
  setActiveBoard: (id: string | null) => void;
  setActiveBoardForWorkspace: (workspaceId: string, boardId: string | null) => void;
  getActiveBoardForWorkspace: (workspaceId: string) => string | null;
  setBoards: (boards: Board[]) => void;
  boardListRefresh: {
    workspaceId: string | null;
    nonce: number;
  };
  requestBoardListRefresh: (workspaceId: string | null) => void;

  focus: FocusTarget;
  setFocus: (focus: FocusTarget) => void;

  status: InitializationStatus;
  initializationError: InitializationError | null;
  initialized: boolean;
  setInitializationState: (state: InitializationState) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  themePreference: DEFAULT_THEME_PREFERENCE,
  resolvedTheme: "light",
  setThemePreference: (preference) => set({ themePreference: preference }),
  setResolvedTheme: (theme) => set({ resolvedTheme: theme }),

  workspaces: [],
  activeWorkspaceId: null,
  setActiveWorkspace: (id) =>
    set((state) => ({
      activeWorkspaceId: id,
      activeBoardId: state.activeBoardPerWorkspace[id] ?? null,
      focus: "global",
    })),
  setWorkspaces: (workspaces) => set({ workspaces }),

  boards: [],
  activeBoardId: null,
  activeBoardPerWorkspace: {},
  setActiveBoard: (id) => set({ activeBoardId: id }),
  setActiveBoardForWorkspace: (workspaceId, boardId) =>
    set((state) => ({
      activeBoardPerWorkspace: {
        ...state.activeBoardPerWorkspace,
        [workspaceId]: boardId,
      },
      ...(state.activeWorkspaceId === workspaceId ? { activeBoardId: boardId } : {}),
    })),
  getActiveBoardForWorkspace: (workspaceId) => get().activeBoardPerWorkspace[workspaceId] ?? null,
  setBoards: (boards) => set({ boards }),
  boardListRefresh: {
    workspaceId: null,
    nonce: 0,
  },
  requestBoardListRefresh: (workspaceId) =>
    set((state) => ({
      boardListRefresh: {
        workspaceId,
        nonce: state.boardListRefresh.nonce + 1,
      },
    })),

  focus: "global",
  setFocus: (focus) => set({ focus }),

  status: "idle",
  initializationError: null,
  initialized: false,
  setInitializationState: (initializationState) =>
    set({
      status: initializationState.status,
      initialized: initializationState.status === "ready",
      initializationError:
        initializationState.status === "error" ? initializationState.error : null,
    }),
}));
