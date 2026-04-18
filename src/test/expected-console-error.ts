import { vi } from "vitest";

export function suppressExpectedConsoleError() {
  return vi.spyOn(console, "error").mockImplementation(() => undefined);
}
