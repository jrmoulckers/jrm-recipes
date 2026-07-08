import { describe, expect, it } from "vitest";

import {
  clampPageSize,
  DISCOVER_PAGE_SIZE,
  nextPageOffset,
  toCursorPage,
} from "./pagination";

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

describe("clampPageSize", () => {
  it("falls back for missing or non-finite input", () => {
    expect(clampPageSize(undefined, 20)).toBe(20);
    expect(clampPageSize(null, 20)).toBe(20);
    expect(clampPageSize(Number.NaN, 20)).toBe(20);
    expect(clampPageSize(Number.POSITIVE_INFINITY, 20)).toBe(20);
  });

  it("clamps into the [1, max] window", () => {
    expect(clampPageSize(0, 20)).toBe(1);
    expect(clampPageSize(-5, 20)).toBe(1);
    expect(clampPageSize(1000, 20, 100)).toBe(100);
    expect(clampPageSize(7, 20)).toBe(7);
  });

  it("truncates a fractional page size", () => {
    expect(clampPageSize(7.9, 20)).toBe(7);
  });
});

describe("toCursorPage", () => {
  const rows = [{ v: 5 }, { v: 4 }, { v: 3 }];

  it("keeps every row and returns a null cursor when not over-fetched", () => {
    const page = toCursorPage(rows, 3, (r) => r.v);
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it("trims the sentinel row and yields the last kept row's cursor", () => {
    const page = toCursorPage(rows, 2, (r) => r.v);
    expect(page.items.map((r) => r.v)).toEqual([5, 4]);
    expect(page.nextCursor).toBe(4);
  });

  it("guards a non-positive limit", () => {
    expect(toCursorPage(rows, 0, (r) => r.v)).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it("handles an empty batch", () => {
    expect(toCursorPage([] as { v: number }[], 5, (r) => r.v)).toEqual({
      items: [],
      nextCursor: null,
    });
  });
});
