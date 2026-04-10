import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  attachMock,
  setBoundsMock,
  navigateMock,
  goBackMock,
  goForwardMock,
  reloadMock,
  destroyMock,
  setFocusMock,
} = vi.hoisted(() => ({
  attachMock: vi.fn(),
  setBoundsMock: vi.fn(),
  navigateMock: vi.fn(),
  goBackMock: vi.fn(),
  goForwardMock: vi.fn(),
  reloadMock: vi.fn(),
  destroyMock: vi.fn(),
  setFocusMock: vi.fn(),
}));
let stateListener: ((state: unknown) => void) | undefined;

vi.mock("../../platform/desktop-api", () => ({
  browser: {
    attach: attachMock,
    setBounds: setBoundsMock,
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
    navigateMock.mockReset();
    goBackMock.mockReset();
    goForwardMock.mockReset();
    reloadMock.mockReset();
    destroyMock.mockReset();
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
        "https://www.google.com/search?q=phosphene%20excalidraw%20workflow",
      );
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
    attachMock.mockRejectedValueOnce(new Error("Browser view could not be created"));

    render(<BrowserPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Browser failed to load.");
    expect(screen.getByRole("alert")).toHaveTextContent("Browser view could not be created");
  });

  it("renders an inert shell without attaching the browser bridge", () => {
    render(<BrowserPanel mode="shell" />);

    expect(attachMock).not.toHaveBeenCalled();
    expect(destroyMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("browser-panel-shell")).toBeInTheDocument();
    expect(screen.queryByLabelText("Browser address")).not.toBeInTheDocument();
  });
});
