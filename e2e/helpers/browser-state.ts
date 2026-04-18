import type { Page } from "@playwright/test";

export type TrackedBrowserState = {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  lastError: string | null;
};

type BrowserTrackingWindow = Window & {
  __PHOSPHENE_E2E_BROWSER_STATE__?: TrackedBrowserState;
  __PHOSPHENE_E2E_BROWSER_STATE_TRACKING__?: boolean;
  desktop: {
    browser: {
      onStateChanged(callback: (state: TrackedBrowserState) => void): () => void;
    };
  };
};

export function browserStateMatchesLoadedUrl(
  state: TrackedBrowserState | null | undefined,
  expectedUrl: RegExp,
): boolean {
  if (!state) {
    return false;
  }

  return state.lastError === null && state.isLoading === false && expectedUrl.test(state.url);
}

async function ensureBrowserStateTracking(page: Page): Promise<void> {
  await page.evaluate(() => {
    const browserWindow = window as BrowserTrackingWindow;

    if (browserWindow.__PHOSPHENE_E2E_BROWSER_STATE_TRACKING__) {
      return;
    }

    browserWindow.__PHOSPHENE_E2E_BROWSER_STATE_TRACKING__ = true;
    browserWindow.desktop.browser.onStateChanged((state) => {
      browserWindow.__PHOSPHENE_E2E_BROWSER_STATE__ = state;
    });
  });
}

export async function waitForLoadedBrowserUrl(
  page: Page,
  expectedUrl: RegExp,
  timeout = 20_000,
): Promise<TrackedBrowserState> {
  await ensureBrowserStateTracking(page);

  await page.waitForFunction(
    ({ source, flags }) => {
      const browserWindow = window as BrowserTrackingWindow;
      const state = browserWindow.__PHOSPHENE_E2E_BROWSER_STATE__;

      return state ? state.lastError === null && state.isLoading === false && new RegExp(source, flags).test(state.url) : false;
    },
    { source: expectedUrl.source, flags: expectedUrl.flags },
    { timeout },
  );

  const state = await page.evaluate(() => {
    const browserWindow = window as BrowserTrackingWindow;
    return browserWindow.__PHOSPHENE_E2E_BROWSER_STATE__ ?? null;
  });

  if (!state) {
    throw new Error("Browser state was not captured after a successful wait");
  }

  return state;
}
