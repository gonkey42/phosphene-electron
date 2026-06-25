import { useCallback, useEffect, useMemo, useRef } from "react";
import type { FocusEventHandler, KeyboardEventHandler, MouseEventHandler } from "react";

import { useAppStore } from "../stores/app-store";
import type { DeleteEligibility, DeleteTarget } from "../stores/app-store";

export const DELETE_ARM_TIMEOUT_MS = 5_000;

interface UseSafeDeleteOptions {
  target: DeleteTarget;
  eligibility?: DeleteEligibility;
  onConfirm: (target: DeleteTarget, token: string) => Promise<unknown> | unknown;
}

interface SafeDeleteButtonProps {
  "aria-busy"?: true;
  "aria-pressed": boolean;
  onBlur: FocusEventHandler<HTMLElement>;
  onClick: MouseEventHandler<HTMLElement>;
  onKeyDown: KeyboardEventHandler<HTMLElement>;
}

interface UseSafeDeleteResult {
  isArmed: boolean;
  isPending: boolean;
  buttonProps: SafeDeleteButtonProps;
  activate: () => void;
  cancel: (reason?: string) => void;
}

const allowedEligibility: DeleteEligibility = { state: "allowed" };

export function useSafeDelete({
  target,
  eligibility = allowedEligibility,
  onConfirm,
}: UseSafeDeleteOptions): UseSafeDeleteResult {
  const targetKey = useMemo(() => getDeleteTargetKey(target), [target]);
  const isArmed = useAppStore((state) => state.isDeleteArmed(target));
  const armedDeleteToken = useAppStore((state) => state.armedDeleteToken);
  const deletePendingToken = useAppStore((state) => state.deletePendingToken);
  const storeEligibility = useAppStore((state) => state.deleteEligibility);
  const isPending = isArmed && Boolean(armedDeleteToken) && deletePendingToken === armedDeleteToken;
  const targetRef = useRef(target);
  const targetKeyRef = useRef(targetKey);
  const eligibilityRef = useRef(eligibility);
  const onConfirmRef = useRef(onConfirm);
  const armedDeleteTokenRef = useRef(armedDeleteToken);

  targetRef.current = target;
  targetKeyRef.current = targetKey;
  eligibilityRef.current = eligibility;
  onConfirmRef.current = onConfirm;
  armedDeleteTokenRef.current = armedDeleteToken;

  const cancel = useCallback((reason?: string) => {
    const state = useAppStore.getState();

    if (state.isDeleteArmed(targetRef.current)) {
      state.cancelArmedDelete(reason);
    }
  }, []);

  const activate = useCallback(() => {
    const state = useAppStore.getState();
    const blockReason = getBlockingEligibilityReason(
      eligibilityRef.current,
      state.deleteEligibility,
    );

    if (blockReason) {
      if (state.isDeleteArmed(targetRef.current)) {
        state.cancelArmedDelete(blockReason);
      }
      return;
    }

    if (state.deletePendingToken) {
      return;
    }

    if (!state.isDeleteArmed(targetRef.current)) {
      state.armDeleteTarget(targetRef.current);
      return;
    }

    const token = state.armedDeleteToken;
    if (!token || !state.markDeletePending(token)) {
      return;
    }

    void (async () => {
      try {
        await onConfirmRef.current(targetRef.current, token);
      } catch {
        // Delete callbacks report their own errors; this hook owns state cleanup.
      } finally {
        useAppStore.getState().clearDeletePending(token);
      }
    })();
  }, []);

  const handleClick = useCallback<MouseEventHandler<HTMLElement>>(
    (event) => {
      if (event.detail > 1) {
        return;
      }

      activate();
    },
    [activate],
  );

  const handleKeyDown = useCallback<KeyboardEventHandler<HTMLElement>>(
    (event) => {
      if (event.key === "Escape") {
        cancel();
        return;
      }

      if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") {
        return;
      }

      event.preventDefault();

      if (event.repeat) {
        return;
      }

      activate();
    },
    [activate, cancel],
  );

  const handleBlur = useCallback<FocusEventHandler<HTMLElement>>((event) => {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    const state = useAppStore.getState();
    if (state.isDeleteArmed(targetRef.current)) {
      state.cancelArmedDelete();
    }
  }, []);

  useEffect(() => {
    if (!isArmed || !armedDeleteToken) {
      return;
    }

    const token = armedDeleteToken;
    const timeoutId = window.setTimeout(() => {
      const state = useAppStore.getState();

      if (
        state.armedDeleteToken === token &&
        state.deletePendingToken !== token &&
        state.armedDeleteTarget &&
        getDeleteTargetKey(state.armedDeleteTarget) === targetKeyRef.current
      ) {
        state.cancelArmedDelete();
      }
    }, DELETE_ARM_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [armedDeleteToken, isArmed, targetKey]);

  useEffect(() => {
    if (!isArmed || !armedDeleteToken) {
      return;
    }

    const token = armedDeleteToken;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      const state = useAppStore.getState();
      if (
        state.armedDeleteToken === token &&
        state.armedDeleteTarget &&
        getDeleteTargetKey(state.armedDeleteTarget) === targetKeyRef.current
      ) {
        event.preventDefault();
        state.cancelArmedDelete();
      }
    };

    window.addEventListener("keydown", handleEscape, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleEscape, { capture: true });
    };
  }, [armedDeleteToken, isArmed, targetKey]);

  useEffect(() => {
    if (!isArmed || !armedDeleteToken) {
      return;
    }

    const blockReason = getBlockingEligibilityReason(eligibility, storeEligibility);
    if (!blockReason) {
      return;
    }

    const state = useAppStore.getState();
    if (
      state.armedDeleteToken === armedDeleteToken &&
      state.armedDeleteTarget &&
      getDeleteTargetKey(state.armedDeleteTarget) === targetKey
    ) {
      state.cancelArmedDelete(blockReason);
    }
  }, [armedDeleteToken, eligibility, isArmed, storeEligibility, targetKey]);

  useEffect(() => {
    const mountedTargetKey = targetKey;

    return () => {
      const token = armedDeleteTokenRef.current;
      const state = useAppStore.getState();

      if (
        token &&
        state.armedDeleteToken === token &&
        state.armedDeleteTarget &&
        getDeleteTargetKey(state.armedDeleteTarget) === mountedTargetKey
      ) {
        state.cancelArmedDelete();
      }
    };
  }, [targetKey]);

  return {
    isArmed,
    isPending,
    buttonProps: {
      "aria-busy": isPending ? true : undefined,
      "aria-pressed": isArmed,
      onBlur: handleBlur,
      onClick: handleClick,
      onKeyDown: handleKeyDown,
    },
    activate,
    cancel,
  };
}

function getBlockingEligibilityReason(
  localEligibility: DeleteEligibility,
  storeEligibility: DeleteEligibility,
): string | null {
  if (localEligibility.state !== "allowed") {
    return localEligibility.reason;
  }

  if (storeEligibility.state !== "allowed") {
    return storeEligibility.reason;
  }

  return null;
}

function getDeleteTargetKey(target: DeleteTarget): string {
  if (target.kind === "workspace") {
    return `workspace:${target.id}`;
  }

  return `board:${target.workspaceId ?? ""}:${target.id}`;
}
