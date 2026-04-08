import { useEffect } from "react";

export interface CancellationToken {
  cancelled: boolean;
}

type EffectCallback = (token: CancellationToken) => void | (() => void);

/**
 * Like useEffect, but passes a cancellation token to the callback.
 * The token's `cancelled` property becomes `true` when the effect is cleaned up
 * (unmount or dependency change). Use it to guard async continuations instead
 * of a manual `let cancelled = false` pattern.
 */
export function useCancellableEffect(effect: EffectCallback, deps: React.DependencyList): void {
  useEffect(() => {
    const token: CancellationToken = { cancelled: false };
    const cleanup = effect(token);

    return () => {
      token.cancelled = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
