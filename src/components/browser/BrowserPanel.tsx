import { useEffect, useRef, useState } from "react";

import { browser, contextMenu, type BrowserState } from "../../platform/desktop-api";
import { useAppStore } from "../../stores/app-store";

import "./BrowserPanel.css";

type BrowserPanelMode = "live" | "shell";

const DEFAULT_SEARCH_BASE = "https://www.google.com/search?q=";

const initialBrowserState: BrowserState = {
  url: "",
  title: "",
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
  lastError: null,
};

function normalizeBrowserInput(rawValue: string): string {
  const value = rawValue.trim();
  if (!value) {
    return "https://www.google.com";
  }

  try {
    return new URL(value).toString();
  } catch {
    // Continue to heuristic handling below.
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(value)) {
    return `https://${value}`;
  }

  return `${DEFAULT_SEARCH_BASE}${encodeURIComponent(value)}`;
}

function getBrowserBounds(host: HTMLDivElement) {
  const rect = host.getBoundingClientRect();

  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

type BrowserPanelProps = {
  mode?: BrowserPanelMode;
};

export function BrowserPanel({ mode = "live" }: BrowserPanelProps) {
  if (mode === "shell") {
    return <BrowserPanelShell />;
  }

  return <LiveBrowserPanel />;
}

function LiveBrowserPanel() {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const setFocus = useAppStore((state) => state.setFocus);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const isEditingAddressRef = useRef(false);
  const isDisposedRef = useRef(false);
  const [addressValue, setAddressValue] = useState("");
  const [browserState, setBrowserState] = useState(initialBrowserState);

  const reportBrowserError = (error: unknown, fallbackMessage: string) => {
    if (isDisposedRef.current) {
      return;
    }

    setBrowserState((currentState) => ({
      ...currentState,
      lastError: error instanceof Error ? error.message : fallbackMessage,
    }));
  };

  useEffect(() => {
    const unsubscribe = browser.onStateChanged((state) => {
      setBrowserState(state);
      if (!isEditingAddressRef.current) {
        setAddressValue(state.url);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    isDisposedRef.current = false;

    const host = hostRef.current;
    if (!host) {
      return;
    }

    const runBrowserTask = (task: () => Promise<void>) => {
      if (isDisposedRef.current) {
        return Promise.resolve();
      }

      return Promise.resolve()
        .then(() => {
          if (isDisposedRef.current) {
            return;
          }

          return task();
        })
        .catch((error) => {
          reportBrowserError(error, "Browser view could not be created");
        });
    };

    const syncBounds = () => runBrowserTask(() => browser.setBounds(getBrowserBounds(host)));

    void runBrowserTask(() => browser.attach(getBrowserBounds(host)));

    const handleWindowResize = () => {
      void syncBounds();
    };

    const observer =
      typeof window.ResizeObserver === "function"
        ? new window.ResizeObserver(() => {
            void syncBounds();
          })
        : null;

    observer?.observe(host);
    window.addEventListener("resize", handleWindowResize);

    return () => {
      isDisposedRef.current = true;
      observer?.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      void browser.destroy();
    };
  }, []);

  return (
    <section
      className={`browser-panel browser-panel--${resolvedTheme} browser-panel--full-bleed`}
      data-testid="browser-panel"
      onPointerDown={() => setFocus("browser")}
    >
      <form
        aria-label="Browser navigation"
        className="browser-panel__controls"
        onSubmit={(event) => {
          event.preventDefault();
          isEditingAddressRef.current = false;
          setFocus("browser");
          void Promise.resolve(browser.navigate(normalizeBrowserInput(addressValue))).catch((error) => {
            reportBrowserError(error, "Browser navigation failed");
          });
        }}
      >
        <button
          type="button"
          aria-label="Back"
          data-icon-button="true"
          onClick={() => void browser.goBack()}
          disabled={!browserState.canGoBack}
        >
          ←
        </button>
        <button
          type="button"
          aria-label="Forward"
          data-icon-button="true"
          onClick={() => void browser.goForward()}
          disabled={!browserState.canGoForward}
        >
          →
        </button>
        <button type="button" aria-label="Reload" data-icon-button="true" onClick={() => void browser.reload()}>
          ↻
        </button>
        <input
          aria-label="Browser address"
          className="browser-panel__address"
          value={addressValue}
          onChange={(event) => {
            isEditingAddressRef.current = true;
            setAddressValue(event.target.value);
          }}
          onBlur={() => {
            isEditingAddressRef.current = false;
            setAddressValue(browserState.url);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            void contextMenu.showAddressInputMenu();
          }}
          placeholder="Enter URL or search"
        />
        <button className="browser-panel__go" type="submit">
          Go
        </button>
      </form>

      {browserState.lastError ? (
        <div className="browser-panel__error" role="alert">
          <p>Browser failed to load.</p>
          <p>{browserState.lastError}</p>
        </div>
      ) : null}

      <div ref={hostRef} className="browser-panel__host" />
    </section>
  );
}

function BrowserPanelShell() {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);

  return (
    <section
      className={`browser-panel browser-panel--${resolvedTheme} browser-panel--shell browser-panel--full-bleed`}
      data-testid="browser-panel-shell"
      aria-hidden="true"
    >
      <div className="browser-panel__controls browser-panel__controls--shell">
        <div className="browser-panel__shell-control" data-icon-button="true">
          ←
        </div>
        <div className="browser-panel__shell-control" data-icon-button="true">
          →
        </div>
        <div className="browser-panel__shell-control" data-icon-button="true">
          ↻
        </div>
        <div className="browser-panel__shell-control browser-panel__address browser-panel__address--shell">
          Preserving layout while workspace exits
        </div>
        <div className="browser-panel__shell-control browser-panel__go browser-panel__go--shell">Go</div>
      </div>
      <div className="browser-panel__host browser-panel__host--shell" />
    </section>
  );
}
