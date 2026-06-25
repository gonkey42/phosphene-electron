import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  attachMock,
  setBoundsMock,
  hideMock,
  getStateMock,
  navigateMock,
  goBackMock,
  goForwardMock,
  reloadMock,
  destroyMock,
  showAddressInputMenuMock,
  setFocusMock,
} = vi.hoisted(() => ({
  attachMock: vi.fn(),
  setBoundsMock: vi.fn(),
  hideMock: vi.fn(),
  getStateMock: vi.fn(),
  navigateMock: vi.fn(),
  goBackMock: vi.fn(),
  goForwardMock: vi.fn(),
  reloadMock: vi.fn(),
  destroyMock: vi.fn(),
  showAddressInputMenuMock: vi.fn(),
  setFocusMock: vi.fn(),
}));
let stateListener: ((state: unknown) => void) | undefined;

function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

vi.mock("../../platform/desktop-api", () => ({
  browser: {
    attach: attachMock,
    setBounds: setBoundsMock,
    hide: hideMock,
    getState: getStateMock,
    navigate: navigateMock,
    goBack: goBackMock,
    goForward: goForwardMock,
    reload: reloadMock,
    destroy: destroyMock,
    onStateChanged: (listener: (state: unknown) => void) => {
      stateListener = listener;
      return () => {
        stateListener = undefined;
      };
    },
  },
  contextMenu: {
    showAddressInputMenu: showAddressInputMenuMock,
  },
}));

vi.mock("../../stores/app-store", () => ({
  useAppStore: (
    selector?: (state: { resolvedTheme: "light" | "dark"; setFocus: (focus: string) => void }) => unknown,
  ) =>
    selector
      ? selector({
          resolvedTheme: "light",
          setFocus: setFocusMock,
        })
      : {
          resolvedTheme: "light",
          setFocus: setFocusMock,
        },
}));

import { BrowserPanel } from "./BrowserPanel";

describe("BrowserPanel", () => {
  beforeEach(() => {
    attachMock.mockReset();
    setBoundsMock.mockReset();
    hideMock.mockReset();
    getStateMock.mockReset();
    navigateMock.mockReset();
    goBackMock.mockReset();
    goForwardMock.mockReset();
    reloadMock.mockReset();
    destroyMock.mockReset();
    showAddressInputMenuMock.mockReset();
    attachMock.mockResolvedValue(undefined);
    setBoundsMock.mockResolvedValue(undefined);
    hideMock.mockResolvedValue(undefined);
    getStateMock.mockResolvedValue({
      url: "",
      title: "",
      canGoBack: false,
      canGoForward: false,
      isLoading: false,
      lastError: null,
    });
    showAddressInputMenuMock.mockResolvedValue(undefined);
    stateListener = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  it("navigates to bare hostnames as https urls", async () => {
    render(<BrowserPanel />);

    fireEvent.change(screen.getByLabelText("Browser address"), {
      target: { value: "example.com" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Browser navigation" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("https://example.com");
    });
  });

  it("searches for plain text queries", async () => {
    render(<BrowserPanel />);

    fireEvent.change(screen.getByLabelText("Browser address"), {
      target: { value: "phosphene excalidraw workflow" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Browser navigation" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(
        "https://duckduckgo.com/?q=phosphene%20excalidraw%20workflow",
      );
    });
  });

  it("opens DuckDuckGo home when the address input is submitted empty", async () => {
    render(<BrowserPanel />);

    fireEvent.change(screen.getByLabelText("Browser address"), {
      target: { value: "   " },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Browser navigation" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("https://start.duckduckgo.com/");
    });
  });

  it("clicking Go uses the typed address instead of resetting to the current page", async () => {
    render(<BrowserPanel />);

    act(() => {
      stateListener?.({
        url: "https://start.duckduckgo.com/",
        title: "DuckDuckGo",
        canGoBack: false,
        canGoForward: false,
        isLoading: false,
        lastError: null,
      });
    });

    fireEvent.change(screen.getByLabelText("Browser address"), {
      target: { value: "https://example.com/pasted" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("https://example.com/pasted");
    });
  });

  it("clicking Home navigates to DuckDuckGo home", async () => {
    render(<BrowserPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Home" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("https://start.duckduckgo.com/");
    });
  });

  it("syncs browser state into the address bar when the user is not editing", () => {
    render(<BrowserPanel />);

    act(() => {
      stateListener?.({
        url: "https://docs.example.com",
        title: "Docs",
        canGoBack: false,
        canGoForward: false,
        isLoading: false,
        lastError: null,
      });
    });

    expect(screen.getByLabelText("Browser address")).toHaveValue("https://docs.example.com");
  });

  it("preserves a draft address while browser state updates during editing", () => {
    render(<BrowserPanel />);

    fireEvent.change(screen.getByLabelText("Browser address"), {
      target: { value: "phos" },
    });

    act(() => {
      stateListener?.({
        url: "https://example.com/loaded",
        title: "Loaded",
        canGoBack: false,
        canGoForward: false,
        isLoading: false,
        lastError: null,
      });
    });

    expect(screen.getByLabelText("Browser address")).toHaveValue("phos");

    fireEvent.blur(screen.getByLabelText("Browser address"));

    expect(screen.getByLabelText("Browser address")).toHaveValue("https://example.com/loaded");
  });

  it("renders a fallback alert when attach rejects", async () => {
    const onNativeAttachError = vi.fn();
    attachMock.mockRejectedValueOnce(new Error("Browser view could not be created"));

    render(<BrowserPanel onNativeAttachError={onNativeAttachError} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Browser failed to load.");
    expect(screen.getByRole("alert")).toHaveTextContent("Browser view could not be created");
    expect(onNativeAttachError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("renders a fallback alert when attach throws synchronously", async () => {
    attachMock.mockImplementationOnce(() => {
      throw new Error("Desktop API not available");
    });

    render(<BrowserPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Browser failed to load.");
    expect(screen.getByRole("alert")).toHaveTextContent("Desktop API not available");
  });

  it("renders a fallback alert when navigate rejects", async () => {
    navigateMock.mockRejectedValueOnce(new Error("Navigation failed"));

    render(<BrowserPanel />);

    fireEvent.change(screen.getByLabelText("Browser address"), {
      target: { value: "https://bad.example.test" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Browser navigation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Browser failed to load.");
    expect(screen.getByRole("alert")).toHaveTextContent("Navigation failed");
  });

  it("does not call setBounds during the initial attach", async () => {
    render(<BrowserPanel />);

    await waitFor(() => {
      expect(attachMock).toHaveBeenCalledTimes(1);
    });

    expect(setBoundsMock).not.toHaveBeenCalled();
  });

  it("does not attach or expose tabbable controls while hidden", () => {
    render(<BrowserPanel visible={false} />);

    expect(attachMock).not.toHaveBeenCalled();
    expect(setBoundsMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("browser-panel")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Browser address")).not.toBeInTheDocument();
  });

  it("hydrates cached browser state before attaching a visible panel", async () => {
    const onNativeAttachComplete = vi.fn();
    getStateMock.mockResolvedValueOnce({
      url: "https://cached.example.com",
      title: "Cached",
      canGoBack: true,
      canGoForward: false,
      isLoading: false,
      lastError: null,
    });

    render(<BrowserPanel onNativeAttachComplete={onNativeAttachComplete} />);

    await waitFor(() => {
      expect(getStateMock).toHaveBeenCalledTimes(1);
      expect(attachMock).toHaveBeenCalledTimes(1);
    });
    expect(onNativeAttachComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Browser address")).toHaveValue("https://cached.example.com");
    expect(screen.getByRole("button", { name: "Back" })).not.toBeDisabled();
  });

  it("does not attach when hidden before cached browser state resolves", async () => {
    const cachedState = createDeferred<{
      url: string;
      title: string;
      canGoBack: boolean;
      canGoForward: boolean;
      isLoading: boolean;
      lastError: string | null;
    }>();
    getStateMock.mockReturnValueOnce(cachedState.promise);

    const { unmount } = render(<BrowserPanel />);

    await waitFor(() => {
      expect(getStateMock).toHaveBeenCalledTimes(1);
    });

    unmount();

    await act(async () => {
      cachedState.resolve({
        url: "https://late.example.com",
        title: "Late",
        canGoBack: false,
        canGoForward: false,
        isLoading: false,
        lastError: null,
      });
      await cachedState.promise;
    });

    expect(attachMock).not.toHaveBeenCalled();
  });

  it("does not report native attach failure after unmount", async () => {
    const attachFailure = createDeferred<void>();
    const onNativeAttachError = vi.fn();
    attachMock.mockReturnValueOnce(attachFailure.promise);

    const { unmount } = render(<BrowserPanel onNativeAttachError={onNativeAttachError} />);

    await waitFor(() => {
      expect(attachMock).toHaveBeenCalledTimes(1);
    });

    unmount();

    await act(async () => {
      attachFailure.reject(new Error("late attach failed"));
      await attachFailure.promise.catch(() => undefined);
    });

    expect(onNativeAttachError).not.toHaveBeenCalled();
  });

  it("does not report native attach success after unmount", async () => {
    const attachSuccess = createDeferred<void>();
    const onNativeAttachComplete = vi.fn();
    attachMock.mockReturnValueOnce(attachSuccess.promise);

    const { unmount } = render(<BrowserPanel onNativeAttachComplete={onNativeAttachComplete} />);

    await waitFor(() => {
      expect(attachMock).toHaveBeenCalledTimes(1);
    });

    unmount();

    await act(async () => {
      attachSuccess.resolve();
      await attachSuccess.promise;
    });

    expect(onNativeAttachComplete).not.toHaveBeenCalled();
  });

  it("updates browser bounds when the host size changes during window resize", async () => {
    const originalResizeObserver = window.ResizeObserver;
    class ResizeObserverMock {
      constructor(_callback: ResizeObserverCallback) {}

      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    try {
      // Keep ResizeObserver available so the test exercises the live resize contract.
      window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

      const { container } = render(<BrowserPanel />);

      await waitFor(() => {
        expect(attachMock).toHaveBeenCalledTimes(1);
      });

      const host = container.querySelector(".browser-panel__host");
      expect(host).toBeInstanceOf(HTMLDivElement);

      vi.spyOn(host as HTMLDivElement, "getBoundingClientRect").mockReturnValue({
        x: 12,
        y: 24,
        left: 12,
        top: 24,
        right: 372,
        bottom: 264,
        width: 360,
        height: 240,
        toJSON: () => ({}),
      });

      fireEvent(window, new Event("resize"));

      await waitFor(() => {
        expect(setBoundsMock).toHaveBeenCalledWith(
          {
            x: 12,
            y: 24,
            width: 360,
            height: 240,
          },
          attachMock.mock.calls[0]?.[1],
        );
      });
    } finally {
      window.ResizeObserver = originalResizeObserver;
    }
  });

  it("renders a fallback alert when setBounds rejects after resize", async () => {
    const originalResizeObserver = window.ResizeObserver;
    try {
      // Force the window resize fallback path for environments without ResizeObserver.
      // @ts-expect-error test-only override
      window.ResizeObserver = undefined;
      setBoundsMock.mockRejectedValueOnce(new Error("Browser bounds could not be updated"));

      render(<BrowserPanel />);
      fireEvent(window, new Event("resize"));

      expect(await screen.findByRole("alert")).toHaveTextContent("Browser failed to load.");
      expect(screen.getByRole("alert")).toHaveTextContent("Browser bounds could not be updated");
    } finally {
      window.ResizeObserver = originalResizeObserver;
    }
  });

  it("ignores late resize observer callbacks after teardown", async () => {
    const originalResizeObserver = window.ResizeObserver;
    const disconnectMock = vi.fn();
    let resizeObserverCallback: ResizeObserverCallback | undefined;

    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeObserverCallback = callback;
      }

      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = disconnectMock;
    }

    try {
      window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

      const { container, unmount } = render(<BrowserPanel />);

      await waitFor(() => {
        expect(attachMock).toHaveBeenCalledTimes(1);
      });

      const host = container.querySelector(".browser-panel__host");
      expect(host).toBeInstanceOf(HTMLDivElement);

      vi.spyOn(host as HTMLDivElement, "getBoundingClientRect").mockReturnValue({
        x: 18,
        y: 36,
        left: 18,
        top: 36,
        right: 338,
        bottom: 256,
        width: 320,
        height: 220,
        toJSON: () => ({}),
      });

      unmount();

      expect(disconnectMock).toHaveBeenCalledTimes(1);
      expect(hideMock).toHaveBeenCalledTimes(1);
      expect(hideMock).toHaveBeenCalledWith(attachMock.mock.calls[0]?.[1]);
      expect(destroyMock).not.toHaveBeenCalled();

      act(() => {
        resizeObserverCallback?.([] as ResizeObserverEntry[], {} as ResizeObserver);
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(setBoundsMock).not.toHaveBeenCalled();
    } finally {
      window.ResizeObserver = originalResizeObserver;
    }
  });

  it("shows the native address-input context menu on right click", async () => {
    render(<BrowserPanel />);

    fireEvent.contextMenu(screen.getByLabelText("Browser address"));

    await waitFor(() => {
      expect(showAddressInputMenuMock).toHaveBeenCalledTimes(1);
    });
  });

  it("renders a single-row browser toolbar without the redundant status line", () => {
    const { container } = render(<BrowserPanel />);
    const panel = screen.getByTestId("browser-panel");

    expect(screen.getByRole("form", { name: "Browser navigation" })).toBeInTheDocument();
    expect(panel.querySelector(".browser-panel__controls")).toBeInTheDocument();
    expect(container.querySelector(".browser-panel__chrome")).not.toBeInTheDocument();
    expect(panel.querySelector(".browser-panel__status")).not.toBeInTheDocument();
  });

  it("renders icon-style browser navigation controls", () => {
    render(<BrowserPanel />);

    expect(screen.getByRole("button", { name: "Back" })).toHaveAttribute("data-icon-button", "true");
    expect(screen.getByRole("button", { name: "Forward" })).toHaveAttribute("data-icon-button", "true");
    expect(screen.getByRole("button", { name: "Reload" })).toHaveAttribute("data-icon-button", "true");
  });

  it("preserves the full-bleed compact footprint in shell mode", () => {
    const { container } = render(<BrowserPanel mode="shell" />);
    const panel = screen.getByTestId("browser-panel-shell");

    expect(panel).toHaveClass("browser-panel--shell", "browser-panel--full-bleed");
    expect(panel.querySelector(".browser-panel__controls")).toBeInTheDocument();
    expect(panel.querySelector(".browser-panel__host")).toHaveClass("browser-panel__host--shell");
    expect(container.querySelector(".browser-panel__chrome")).not.toBeInTheDocument();
    expect(panel.querySelector(".browser-panel__status")).not.toBeInTheDocument();
  });

  it("stretches the browser host to the full pane width in live mode", () => {
    render(<BrowserPanel />);

    expect(screen.getByTestId("browser-panel")).toHaveClass("browser-panel--full-bleed");
  });

  it("renders an inert shell without attaching the browser bridge", () => {
    render(<BrowserPanel mode="shell" />);

    expect(attachMock).not.toHaveBeenCalled();
    expect(destroyMock).not.toHaveBeenCalled();
    expect(hideMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("browser-panel-shell")).toBeInTheDocument();
    expect(screen.queryByLabelText("Browser address")).not.toBeInTheDocument();
  });
});
