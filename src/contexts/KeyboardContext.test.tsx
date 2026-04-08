import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../stores/app-store";

import { KeyboardProvider, useKeyboardContext } from "./KeyboardContext";

describe("KeyboardContext", () => {
  beforeEach(() => {
    useAppStore.setState({
      workspaces: [],
      activeWorkspaceId: null,
      boards: [],
      activeBoardId: null,
      boardListRefresh: { workspaceId: null, nonce: 0 },
      focus: "global",
      initialized: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("claims and releases focus through the shared app store", () => {
    const { result } = renderHook(() => useKeyboardContext(), {
      wrapper: ({ children }) => <KeyboardProvider>{children}</KeyboardProvider>,
    });

    expect(result.current.focus).toBe("global");
    expect(result.current.isFocused("canvas")).toBe(false);

    act(() => {
      result.current.claimFocus("canvas");
    });

    expect(result.current.focus).toBe("canvas");
    expect(result.current.isFocused("canvas")).toBe(true);
    expect(useAppStore.getState().focus).toBe("canvas");

    act(() => {
      result.current.releaseFocus();
    });

    expect(result.current.focus).toBe("global");
    expect(useAppStore.getState().focus).toBe("global");
  });

  it("returns focus to global when Escape is pressed", () => {
    render(
      <KeyboardProvider>
        <KeyboardContextProbe />
      </KeyboardProvider>,
    );

    act(() => {
      useAppStore.getState().setFocus("widget");
    });

    expect(useAppStore.getState().focus).toBe("widget");

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(useAppStore.getState().focus).toBe("global");
    expect(screen.getByTestId("focus")).toHaveTextContent("global");
  });

  it("attaches the Escape listener in capture phase", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");

    render(
      <KeyboardProvider>
        <KeyboardContextProbe />
      </KeyboardProvider>,
    );

    expect(addEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function), {
      capture: true,
    });
  });
});

function KeyboardContextProbe() {
  const { focus } = useKeyboardContext();

  return <output data-testid="focus">{focus}</output>;
}
