import { describe, expect, it } from "vitest";

import { shouldRemoveUserDataDirOnCleanup } from "../../e2e/helpers/launch";

describe("shouldRemoveUserDataDirOnCleanup", () => {
  it("removes temp user data directories by default", () => {
    expect(shouldRemoveUserDataDirOnCleanup()).toBe(true);
  });

  it("preserves a caller-provided user data directory by default", () => {
    expect(
      shouldRemoveUserDataDirOnCleanup({
        userDataDir: "/tmp/phosphene-e2e-persist",
      }),
    ).toBe(false);
  });

  it("allows callers to force cleanup for a provided user data directory", () => {
    expect(
      shouldRemoveUserDataDirOnCleanup({
        userDataDir: "/tmp/phosphene-e2e-persist",
        removeUserDataDirOnCleanup: true,
      }),
    ).toBe(true);
  });
});
