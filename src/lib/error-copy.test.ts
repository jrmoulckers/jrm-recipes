import { describe, expect, it } from "vitest";

import { DEFAULT_ERROR_COPY, friendlyError } from "./error-copy";

describe("friendlyError", () => {
  it("maps known codes to warm, action-oriented copy", () => {
    expect(friendlyError("NOT_AUTHENTICATED")).toBe(
      "Please sign in to do that.",
    );
    expect(friendlyError("RATE_LIMITED")).toBe(
      "You're going a little fast — try again in a moment.",
    );
    expect(friendlyError("FORBIDDEN")).toBe(
      "You don't have permission to do that.",
    );
  });

  it("matches known codes case-insensitively", () => {
    expect(friendlyError("rate_limited")).toBe(
      "You're going a little fast — try again in a moment.",
    );
  });

  it("passes through an already-friendly message unchanged", () => {
    const msg = "Give your recipe a title";
    expect(friendlyError(msg)).toBe(msg);
    expect(friendlyError("  Please fix the highlighted fields.  ")).toBe(
      "Please fix the highlighted fields.",
    );
  });

  it("never leaks an unmapped bare code", () => {
    expect(friendlyError("E_SOME_INTERNAL_THING")).toBe(DEFAULT_ERROR_COPY);
    expect(friendlyError("BAD_SNAPSHOT")).toBe(DEFAULT_ERROR_COPY);
  });

  it("returns the warm fallback for empty, blank, or non-string input", () => {
    expect(friendlyError("")).toBe(DEFAULT_ERROR_COPY);
    expect(friendlyError("   ")).toBe(DEFAULT_ERROR_COPY);
    expect(friendlyError(undefined)).toBe(DEFAULT_ERROR_COPY);
    expect(friendlyError(null)).toBe(DEFAULT_ERROR_COPY);
    expect(friendlyError({ nope: true })).toBe(DEFAULT_ERROR_COPY);
  });

  it("unwraps an Error instance's message", () => {
    expect(friendlyError(new Error("NOT_AUTHENTICATED"))).toBe(
      "Please sign in to do that.",
    );
    expect(friendlyError(new Error("Something specific happened"))).toBe(
      "Something specific happened",
    );
  });

  it("honours a custom fallback and never returns an empty string", () => {
    expect(friendlyError("", "Couldn't save your note")).toBe(
      "Couldn't save your note",
    );
    expect(friendlyError("", "   ")).toBe(DEFAULT_ERROR_COPY);
  });
});
