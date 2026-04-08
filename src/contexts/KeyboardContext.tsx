import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";

import { useAppStore, type FocusTarget } from "../stores/app-store";

interface KeyboardContextValue {
  focus: FocusTarget;
  setFocus: (focus: FocusTarget) => void;
  claimFocus: (target: FocusTarget) => void;
  releaseFocus: () => void;
  isFocused: (target: FocusTarget) => boolean;
}

const KeyboardContext = createContext<KeyboardContextValue | null>(null);

export function KeyboardProvider({ children }: { children: ReactNode }) {
  const focus = useAppStore((state) => state.focus);
  const setFocus = useAppStore((state) => state.setFocus);

  const claimFocus = useCallback(
    (target: FocusTarget) => {
      setFocus(target);
    },
    [setFocus],
  );

  const releaseFocus = useCallback(() => {
    setFocus("global");
  }, [setFocus]);

  const isFocused = useCallback((target: FocusTarget) => focus === target, [focus]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || focus === "global") {
        return;
      }

      releaseFocus();
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [focus, releaseFocus]);

  return (
    <KeyboardContext.Provider
      value={{
        focus,
        setFocus,
        claimFocus,
        releaseFocus,
        isFocused,
      }}
    >
      {children}
    </KeyboardContext.Provider>
  );
}

export function useKeyboardContext(): KeyboardContextValue {
  const context = useContext(KeyboardContext);

  if (!context) {
    throw new Error("useKeyboardContext must be used within a KeyboardProvider");
  }

  return context;
}
