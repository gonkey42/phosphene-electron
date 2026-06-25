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
  icon: string | null;
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

export type DeleteTarget =
  | { kind: "workspace"; id: string; label: string }
  | { kind: "board"; id: string; workspaceId: string | null; label: string };

export type DeleteEligibility =
  | { state: "allowed" }
  | { state: "blocked"; reason: string }
  | { state: "unknown"; reason: string };

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

  armedDeleteTarget: DeleteTarget | null;
  armedDeleteToken: string | null;
  deletePendingToken: string | null;
  deleteAnnouncement: string | null;
  deleteEligibility: DeleteEligibility;
  setDeleteEligibility: (eligibility: DeleteEligibility) => void;
  armDeleteTarget: (target: DeleteTarget) => string;
  cancelArmedDelete: (reason?: string) => void;
  markDeletePending: (token: string) => boolean;
  clearDeletePending: (token: string) => void;
  isDeleteArmed: (target: DeleteTarget) => boolean;
}

let deleteTokenSequence = 0;

function createDeleteToken() {
  deleteTokenSequence += 1;
  return `delete-${deleteTokenSequence}`;
}

function isSameDeleteTarget(left: DeleteTarget | null, right: DeleteTarget): boolean {
  if (!left || left.kind !== right.kind || left.id !== right.id) {
    return false;
  }

  if (left.kind === "board" && right.kind === "board") {
    return left.workspaceId === right.workspaceId;
  }

  return true;
}

function getArmedDeleteAnnouncement(target: DeleteTarget): string {
  const targetKind = target.kind === "workspace" ? "workspace" : "board";
  return `Delete ${targetKind} "${target.label}"? Activate again within 5 seconds to confirm.`;
}

function getDeleteCancellationAnnouncement(reason: string): string {
  return `Delete canceled. ${reason}`;
}

function clearArmedDeleteState() {
  return {
    armedDeleteTarget: null,
    armedDeleteToken: null,
    deleteAnnouncement: null,
  };
}

function getCancelableArmedDeleteState(
  state: Pick<AppState, "armedDeleteToken" | "deletePendingToken">,
  reason?: string,
) {
  if (state.armedDeleteToken && state.deletePendingToken === state.armedDeleteToken) {
    return {};
  }

  return {
    ...clearArmedDeleteState(),
    deleteAnnouncement: reason ? getDeleteCancellationAnnouncement(reason) : null,
  };
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
      ...getCancelableArmedDeleteState(state),
    })),
  setWorkspaces: (workspaces) => set({ workspaces }),

  boards: [],
  activeBoardId: null,
  activeBoardPerWorkspace: {},
  setActiveBoard: (id) =>
    set((state) => ({ activeBoardId: id, ...getCancelableArmedDeleteState(state) })),
  setActiveBoardForWorkspace: (workspaceId, boardId) =>
    set((state) => ({
      activeBoardPerWorkspace: {
        ...state.activeBoardPerWorkspace,
        [workspaceId]: boardId,
      },
      ...(state.activeWorkspaceId === workspaceId ? { activeBoardId: boardId } : {}),
      ...getCancelableArmedDeleteState(state),
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

  armedDeleteTarget: null,
  armedDeleteToken: null,
  deletePendingToken: null,
  deleteAnnouncement: null,
  deleteEligibility: { state: "allowed" },
  setDeleteEligibility: (eligibility) =>
    set((state) => ({
      deleteEligibility: eligibility,
      ...(eligibility.state === "allowed" || !state.armedDeleteTarget
        ? {}
        : getCancelableArmedDeleteState(state, eligibility.reason)),
    })),
  armDeleteTarget: (target) => {
    const token = createDeleteToken();
    set({
      armedDeleteTarget: target,
      armedDeleteToken: token,
      deleteAnnouncement: getArmedDeleteAnnouncement(target),
    });
    return token;
  },
  cancelArmedDelete: (reason) =>
    set((state) => {
      if (!state.armedDeleteTarget && !state.armedDeleteToken) {
        return {};
      }

      return getCancelableArmedDeleteState(state, reason);
    }),
  markDeletePending: (token) => {
    const state = get();

    if (state.deletePendingToken || state.armedDeleteToken !== token) {
      return false;
    }

    set({
      deletePendingToken: token,
      deleteAnnouncement: null,
    });
    return true;
  },
  clearDeletePending: (token) =>
    set((state) => {
      if (state.deletePendingToken !== token) {
        return {};
      }

      if (state.armedDeleteToken !== token) {
        return {
          deletePendingToken: null,
        };
      }

      return {
        ...clearArmedDeleteState(),
        deletePendingToken: null,
      };
    }),
  isDeleteArmed: (target) => isSameDeleteTarget(get().armedDeleteTarget, target),
}));
