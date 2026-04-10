import { useEffect, useRef, useState } from "react";

import { browser, type BrowserState } from "../../platform/desktop-api";
import { useAppStore } from "../../stores/app-store";

import "./BrowserPanel.css";

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

export function BrowserPanel() {
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const setFocus = useAppStore((state) => state.setFocus);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const isEditingAddressRef = useRef(false);
  const [addressValue, setAddressValue] = useState("");
  const [browserState, setBrowserState] = useState(initialBrowserState);

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
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const updateBounds = () => {
      void browser.setBounds(getBrowserBounds(host));
    };

    void browser.attach(getBrowserBounds(host));
    updateBounds();

    const ResizeObserverImpl = window.ResizeObserver;
    if (typeof ResizeObserverImpl === "function") {
      const observer = new ResizeObserverImpl(() => {
        updateBounds();
      });

      observer.observe(host);

      return () => {
        observer.disconnect();
        void browser.destroy();
      };
    }

    window.addEventListener("resize", updateBounds);

    return () => {
      window.removeEventListener("resize", updateBounds);
      void browser.destroy();
    };
  }, []);

  return (
    <section
      className={`browser-panel browser-panel--${resolvedTheme}`}
      data-testid="browser-panel"
      onPointerDown={() => setFocus("browser")}
    >
      <div className="browser-panel__chrome">
        <form
          aria-label="Browser navigation"
          className="browser-panel__controls"
          onSubmit={(event) => {
            event.preventDefault();
            isEditingAddressRef.current = false;
            setFocus("browser");
            void browser.navigate(normalizeBrowserInput(addressValue));
          }}
        >
          <button type="button" onClick={() => void browser.goBack()} disabled={!browserState.canGoBack}>
            Back
          </button>
          <button
            type="button"
            onClick={() => void browser.goForward()}
            disabled={!browserState.canGoForward}
          >
            Forward
          </button>
          <button type="button" onClick={() => void browser.reload()}>
            Reload
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
            placeholder="Enter URL or search"
          />
          <button className="browser-panel__go" type="submit">
            Go
          </button>
        </form>

        <div className="browser-panel__status" aria-live="polite">
          <span className="browser-panel__title">{browserState.title || "Browser"}</span>
          <span className="browser-panel__url">{browserState.url || "No page loaded"}</span>
        </div>
      </div>

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
