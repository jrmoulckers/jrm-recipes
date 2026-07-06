import { describe, expect, it } from "vitest";

import { DISCOVER_PAGE_SIZE, nextPageOffset } from "./pagination";

describe("nextPageOffset", () => {
  it("advances by the page size when a full page is returned", () => {
    expect(nextPageOffset(0, 24, 24)).toBe(24);
    expect(nextPageOffset(24, 24, 24)).toBe(48);
    expect(nextPageOffset(48, 12, 12)).toBe(60);
  });

  it("returns null when a short page signals the end of the feed", () => {
    expect(nextPageOffset(0, 10, 24)).toBeNull();
    expect(nextPageOffset(24, 5, 24)).toBeNull();
  });

  it("returns null for an empty page", () => {
    expect(nextPageOffset(0, 0, 24)).toBeNull();
    expect(nextPageOffset(48, 0, 24)).toBeNull();
  });

  it("stays in sync with the default page size", () => {
    expect(nextPageOffset(0, DISCOVER_PAGE_SIZE, DISCOVER_PAGE_SIZE)).toBe(
      DISCOVER_PAGE_SIZE,
    );
    expect(
      nextPageOffset(
        DISCOVER_PAGE_SIZE,
        DISCOVER_PAGE_SIZE - 1,
        DISCOVER_PAGE_SIZE,
      ),
    ).toBeNull();
  });

  it("guards against a non-positive limit", () => {
    expect(nextPageOffset(0, 0, 0)).toBeNull();
    expect(nextPageOffset(10, 5, -1)).toBeNull();
  });
});
