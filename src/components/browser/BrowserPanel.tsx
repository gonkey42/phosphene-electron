import { useEffect, useRef, useState } from "react";

import { browser, contextMenu, type BrowserState } from "../../platform/desktop-api";
import { useAppStore } from "../../stores/app-store";

import "./BrowserPanel.css";

type BrowserPanelMode = "live" | "shell";

const DEFAULT_HOME_URL = "https://start.duckduckgo.com/";
const DEFAULT_SEARCH_BASE = "https://duckduckgo.com/?q=";
let browserOwnerSequence = 0;

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
    return DEFAULT_HOME_URL;
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

function shouldPreserveDraftOnBlur(nextTarget: EventTarget | null) {
  return nextTarget instanceof HTMLElement && nextTarget.dataset.browserKeepDraft === "true";
}

function createBrowserOwnerToken() {
  browserOwnerSequence += 1;
  return `browser-panel-${browserOwnerSequence}`;
}

type BrowserPanelProps = {
  mode?: BrowserPanelMode;
  visible?: boolean;
  onNativeAttachComplete?: () => void;
  onNativeAttachError?: (error: unknown) => void;
};

export function BrowserPanel({
  mode = "live",
  visible = true,
  onNativeAttachComplete,
  onNativeAttachError,
}: BrowserPanelProps) {
  if (mode === "shell") {
    return <BrowserPanelShell />;
  }

  if (!visible) {
    return null;
  }

  return (
    <LiveBrowserPanel
      onNativeAttachComplete={onNativeAttachComplete}
      onNativeAttachError={onNativeAttachError}
    />
  );
}

function LiveBrowserPanel({
  onNativeAttachComplete,
  onNativeAttachError,
}: {
  onNativeAttachComplete?: () => void;
  onNativeAttachError?: (error: unknown) => void;
}) {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const setFocus = useAppStore((state) => state.setFocus);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const ownerTokenRef = useRef<string | null>(null);
  const isEditingAddressRef = useRef(false);
  const isMountedRef = useRef(false);
  const effectGenerationRef = useRef(0);
  const [addressValue, setAddressValue] = useState("");
  const [browserState, setBrowserState] = useState(initialBrowserState);
  ownerTokenRef.current ??= createBrowserOwnerToken();

  const reportBrowserError = (error: unknown, fallbackMessage: string) => {
    if (!isMountedRef.current) {
      return;
    }

    setBrowserState((currentState) => ({
      ...currentState,
      lastError: error instanceof Error ? error.message : fallbackMessage,
    }));
  };

  const navigateTo = (targetUrl: string, fallbackMessage: string) => {
    isEditingAddressRef.current = false;
    setFocus("browser");

    return Promise.resolve(browser.navigate(targetUrl)).catch((error) => {
      reportBrowserError(error, fallbackMessage);
    });
  };

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
    effectGenerationRef.current += 1;
    const effectGeneration = effectGenerationRef.current;
    const isCurrentEffect = () => effectGenerationRef.current === effectGeneration;

    const host = hostRef.current;
    if (!host) {
      return;
    }

    const runBrowserTask = (
      task: () => Promise<void>,
      options: {
        fallbackMessage?: string;
        onError?: (error: unknown) => void;
      } = {},
    ) => {
      if (!isCurrentEffect()) {
        return Promise.resolve();
      }

      return Promise.resolve()
        .then(() => {
          if (!isCurrentEffect()) {
            return;
          }

          return task();
        })
        .catch((error) => {
          if (isCurrentEffect()) {
            reportBrowserError(error, options.fallbackMessage ?? "Browser view could not be created");
            options.onError?.(error);
          }
        });
    };

    const syncBounds = () =>
      runBrowserTask(() => browser.setBounds(getBrowserBounds(host), ownerTokenRef.current ?? undefined));

    void runBrowserTask(async () => {
      const state = await browser.getState();
      if (isCurrentEffect()) {
        setBrowserState((currentState) => (currentState.lastError ? currentState : state));
        if (!isEditingAddressRef.current) {
          setAddressValue(state.url);
        }
      }

      if (!isCurrentEffect()) {
        return;
      }

      await browser.attach(getBrowserBounds(host), ownerTokenRef.current ?? undefined);
      if (isCurrentEffect()) {
        onNativeAttachComplete?.();
      }
    }, { onError: onNativeAttachError });

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
      effectGenerationRef.current += 1;
      observer?.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      void Promise.resolve(browser.hide(ownerTokenRef.current ?? undefined)).catch(() => undefined);
    };
  }, [onNativeAttachComplete, onNativeAttachError]);

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
          void navigateTo(normalizeBrowserInput(addressValue), "Browser navigation failed");
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
        <button className="browser-panel__action" data-browser-keep-draft="true" type="submit">
          Go
        </button>
        <input
          aria-label="Browser address"
          className="browser-panel__address"
          value={addressValue}
          onChange={(event) => {
            isEditingAddressRef.current = true;
            setAddressValue(event.target.value);
          }}
          onBlur={(event) => {
            isEditingAddressRef.current = false;

            if (shouldPreserveDraftOnBlur(event.relatedTarget)) {
              return;
            }

            setAddressValue(browserState.url);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            void contextMenu.showAddressInputMenu();
          }}
          placeholder="Enter URL or search"
        />
        <button
          className="browser-panel__action"
          data-browser-keep-draft="true"
          type="button"
          onClick={() => {
            setAddressValue(DEFAULT_HOME_URL);
            void navigateTo(DEFAULT_HOME_URL, "Browser navigation failed");
          }}
        >
          Home
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
        <div className="browser-panel__shell-control browser-panel__action browser-panel__action--shell">Go</div>
        <div className="browser-panel__shell-control browser-panel__address browser-panel__address--shell">
          Preserving layout while workspace exits
        </div>
        <div className="browser-panel__shell-control browser-panel__action browser-panel__action--shell">Home</div>
      </div>
      <div className="browser-panel__host browser-panel__host--shell" />
    </section>
  );
}
