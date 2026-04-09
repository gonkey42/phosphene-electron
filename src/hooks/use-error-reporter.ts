import { useCallback } from "react";
import { recordSharedError, type SharedErrorRecord, type SharedErrorRetry } from "./shared-error-store";

export interface ErrorReportOptions {
  channel?: string;
  dismissible?: boolean;
  persistent?: boolean;
  retry?: SharedErrorRetry;
}

export function useErrorReporter(componentName?: string) {
  return useCallback(
    (
      message: string,
      error: unknown,
      context?: Record<string, unknown>,
      options?: ErrorReportOptions,
    ): SharedErrorRecord => {
      const entry = recordSharedError({
        message,
        source: componentName,
        error,
        context,
        channel: options?.channel,
        dismissible: options?.dismissible,
        persistent: options?.persistent,
        retry: options?.retry,
      });

      const prefix = entry.source ? `[${entry.source}] ` : "";
      console.error(`${prefix}${entry.message}`, {
        error: entry.error,
        context: entry.context,
        timestamp: entry.timestamp,
      });

      return entry;
    },
    [componentName],
  );
}
