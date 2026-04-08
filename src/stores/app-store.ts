import { create } from "zustand";

export type FocusTarget = "canvas" | "browser" | "widget" | "global";

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

  initialized: boolean;
  setInitialized: (initialized: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
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

  initialized: false,
  setInitialized: (initialized) => set({ initialized }),
}));
