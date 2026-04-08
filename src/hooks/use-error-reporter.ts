import { useCallback } from "react";

export function useErrorReporter(componentName?: string) {
  return useCallback(
    (message: string, error: unknown) => {
      const prefix = componentName ? `[${componentName}] ` : "";
      console.error(`${prefix}${message}`, error);
    },
    [componentName],
  );
}
