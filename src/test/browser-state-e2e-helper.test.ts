import { describe, expect, it } from "vitest";

import { browserStateMatchesLoadedUrl } from "../../e2e/helpers/browser-state";

describe("browserStateMatchesLoadedUrl", () => {
  it("matches a fully loaded browser state with a matching URL", () => {
    expect(
      browserStateMatchesLoadedUrl(
        {
          url: "https://example.com/",
          title: "Example Domain",
          canGoBack: false,
          canGoForward: false,
          isLoading: false,
          lastError: null,
        },
        /example\.com/,
      ),
    ).toBe(true);
  });

  it("rejects loading and failed browser states", () => {
    expect(
      browserStateMatchesLoadedUrl(
        {
          url: "https://example.com/",
          title: "Example Domain",
          canGoBack: false,
          canGoForward: false,
          isLoading: true,
          lastError: null,
        },
        /example\.com/,
      ),
    ).toBe(false);

    expect(
      browserStateMatchesLoadedUrl(
        {
          url: "https://example.com/",
          title: "Example Domain",
          canGoBack: false,
          canGoForward: false,
          isLoading: false,
          lastError: "Navigation failed",
        },
        /example\.com/,
      ),
    ).toBe(false);
  });
});
