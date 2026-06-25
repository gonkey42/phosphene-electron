import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browserBounds = {
  x: 1,
  y: 2,
  width: 320,
  height: 240,
};

function installDesktop() {
  const desktop = {
    browser: {
      attach: vi.fn().mockResolvedValue(undefined),
      setBounds: vi.fn().mockResolvedValue(undefined),
      hide: vi.fn().mockResolvedValue(undefined),
      getState: vi.fn(),
      navigate: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: vi.fn(),
      destroy: vi.fn(),
      onStateChanged: vi.fn(),
    },
  };

  Object.defineProperty(window, "desktop", {
    configurable: true,
    value: desktop,
  });

  return desktop;
}

describe("desktop-api browser bridge", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "desktop");
  });

  it("uses the current browser owner token for unqualified renderer hide requests", async () => {
    const desktop = installDesktop();
    const { browser } = await import("./desktop-api");

    await browser.attach(browserBounds, "owner-1");
    await browser.hide();

    expect(desktop.browser.attach).toHaveBeenCalledWith(browserBounds, "owner-1");
    expect(desktop.browser.hide).toHaveBeenCalledWith("owner-1");
  });

  it("does not let stale owner cleanup clear the current browser owner token", async () => {
    const desktop = installDesktop();
    const { browser } = await import("./desktop-api");

    await browser.attach(browserBounds, "owner-1");
    await browser.attach(browserBounds, "owner-2");
    await browser.hide("owner-1");
    await browser.hide();

    expect(desktop.browser.hide).toHaveBeenNthCalledWith(1, "owner-1");
    expect(desktop.browser.hide).toHaveBeenNthCalledWith(2, "owner-2");
  });

  it("uses the current browser owner token for unqualified bounds updates", async () => {
    const desktop = installDesktop();
    const { browser } = await import("./desktop-api");

    await browser.attach(browserBounds, "owner-1");
    await browser.setBounds(browserBounds);

    expect(desktop.browser.setBounds).toHaveBeenCalledWith(browserBounds, "owner-1");
  });
});
