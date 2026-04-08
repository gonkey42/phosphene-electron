import { describe, expect, it, vi } from "vitest";

describe("generateId", () => {
  it("returns a UUID without dashes", async () => {
    const randomUUID = vi.fn(() => "123e4567-e89b-12d3-a456-426614174000");
    vi.stubGlobal("crypto", { randomUUID });

    const { generateId } = await import("./uuid");

    expect(generateId()).toBe("123e4567e89b12d3a456426614174000");
  });
});
