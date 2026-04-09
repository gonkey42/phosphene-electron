import { useSyncExternalStore } from "react";

export interface SharedErrorRetry {
  label: string;
  run: () => void | Promise<void>;
}

export interface SharedErrorRecord {
  id: string;
  channel?: string;
  message: string;
  source?: string;
  error: unknown;
  context?: Record<string, unknown>;
  timestamp: number;
  dismissible: boolean;
  retry?: SharedErrorRetry;
  persistent?: boolean;
}

export interface SharedErrorInput {
  channel?: string;
  message: string;
  source?: string;
  error: unknown;
  context?: Record<string, unknown>;
  dismissible?: boolean;
  retry?: SharedErrorRetry;
  persistent?: boolean;
}

const sharedErrors: SharedErrorRecord[] = [];
const listeners = new Set<() => void>();
let nextErrorId = 0;
let sharedErrorVersion = 0;

function notify() {
  sharedErrorVersion += 1;
  for (const listener of listeners) {
    listener();
  }
}

function cloneSharedErrors() {
  return [...sharedErrors];
}

function upsertSharedError(entry: SharedErrorRecord): SharedErrorRecord {
  if (!entry.channel) {
    sharedErrors.push(entry);
    return entry;
  }

  const existingIndex = sharedErrors.findIndex((record) => record.channel === entry.channel);

  if (existingIndex >= 0) {
    sharedErrors[existingIndex] = {
      ...entry,
      id: sharedErrors[existingIndex].id,
    };
    return sharedErrors[existingIndex];
  }

  sharedErrors.push(entry);
  return entry;
}

export function recordSharedError(errorRecord: SharedErrorInput): SharedErrorRecord {
  const entry = upsertSharedError({
    id: `shared-error-${++nextErrorId}`,
    ...errorRecord,
    dismissible: errorRecord.dismissible ?? !errorRecord.persistent,
    timestamp: Date.now(),
  });

  notify();
  return entry;
}

export function dismissSharedError(id: string): void {
  const nextLength = sharedErrors.length;
  for (let index = sharedErrors.length - 1; index >= 0; index -= 1) {
    if (sharedErrors[index].id === id) {
      sharedErrors.splice(index, 1);
    }
  }

  if (sharedErrors.length !== nextLength) {
    notify();
  }
}

export function clearSharedErrorChannel(channel: string): void {
  const nextLength = sharedErrors.length;
  for (let index = sharedErrors.length - 1; index >= 0; index -= 1) {
    if (sharedErrors[index].channel === channel) {
      sharedErrors.splice(index, 1);
    }
  }

  if (sharedErrors.length !== nextLength) {
    notify();
  }
}

export function getSharedErrors(): SharedErrorRecord[] {
  return cloneSharedErrors();
}

export function clearSharedErrors(): void {
  if (sharedErrors.length === 0) {
    return;
  }

  sharedErrors.length = 0;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSharedErrors(): SharedErrorRecord[] {
  useSyncExternalStore(
    subscribe,
    () => sharedErrorVersion,
    () => sharedErrorVersion,
  );

  return getSharedErrors();
}
