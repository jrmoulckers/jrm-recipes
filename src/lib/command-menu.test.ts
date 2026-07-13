import { describe, expect, it } from "vitest";

import { filterNavCommands, wrapIndex } from "./command-menu";

const items = [
  { label: "Home", href: "/" },
  { label: "Recipes", href: "/recipes" },
  { label: "Shopping", href: "/shopping" },
];

describe("filterNavCommands", () => {
  it("returns every item for an empty or whitespace query", () => {
    expect(filterNavCommands(items, "")).toHaveLength(3);
    expect(filterNavCommands(items, "   ")).toHaveLength(3);
  });

  it("matches case-insensitively on a substring of the label", () => {
    expect(filterNavCommands(items, "rec")).toEqual([
      { label: "Recipes", href: "/recipes" },
    ]);
    expect(filterNavCommands(items, "SHOP")).toEqual([
      { label: "Shopping", href: "/shopping" },
    ]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterNavCommands(items, "zzz")).toEqual([]);
  });

  it("does not mutate or alias the source array", () => {
    const all = filterNavCommands(items, "");
    expect(all).not.toBe(items);
    all.pop();
    expect(items).toHaveLength(3);
  });
});

describe("wrapIndex", () => {
  it("returns -1 for an empty list", () => {
    expect(wrapIndex(0, 0)).toBe(-1);
    expect(wrapIndex(3, 0)).toBe(-1);
  });

  it("passes through in-range indexes", () => {
    expect(wrapIndex(0, 3)).toBe(0);
    expect(wrapIndex(2, 3)).toBe(2);
  });

  it("wraps past the end back to the start", () => {
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(4, 3)).toBe(1);
  });

  it("wraps before the start to the end", () => {
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(-2, 3)).toBe(1);
  });
});
