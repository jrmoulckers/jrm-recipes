import { describe, expect, it } from "vitest";

import {
  ROTATION_MIN,
  ROTATION_WINDOW_DAYS,
  selectBackInRotation,
} from "./rotation";

const NOW = new Date("2026-07-30T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => NOW - n * DAY;

type R = { id: string };
const recipe = (id: string): R => ({ id });

describe("selectBackInRotation (#426)", () => {
  it("keeps never-cooked and stale favorites, dropping recently-cooked ones", () => {
    const recipes = [recipe("a"), recipe("b"), recipe("c")];
    const cooked = new Map<string, number>([
      ["b", daysAgo(40)], // stale -> kept
      ["c", daysAgo(5)], // recent -> dropped
    ]);
    const result = selectBackInRotation(recipes, cooked, { now: NOW });
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("orders never-cooked first, then oldest-cooked ascending", () => {
    const recipes = [recipe("b"), recipe("a"), recipe("d")];
    const cooked = new Map<string, number>([
      ["b", daysAgo(40)],
      ["d", daysAgo(60)],
      // a never cooked
    ]);
    const result = selectBackInRotation(recipes, cooked, { now: NOW });
    expect(result.map((r) => r.id)).toEqual(["a", "d", "b"]);
  });

  it("preserves input order among never-cooked ties", () => {
    const recipes = [recipe("x"), recipe("y"), recipe("z")];
    const result = selectBackInRotation(recipes, new Map(), { now: NOW });
    expect(result.map((r) => r.id)).toEqual(["x", "y", "z"]);
  });

  it("respects the recency window boundary", () => {
    const recipes = [recipe("edge")];
    // Exactly at the window is still "recent" (not strictly older than cutoff).
    const atWindow = selectBackInRotation(
      recipes,
      new Map([["edge", daysAgo(ROTATION_WINDOW_DAYS)]]),
      { now: NOW },
    );
    expect(atWindow).toHaveLength(0);
    const pastWindow = selectBackInRotation(
      recipes,
      new Map([["edge", daysAgo(ROTATION_WINDOW_DAYS + 1)]]),
      { now: NOW },
    );
    expect(pastWindow.map((r) => r.id)).toEqual(["edge"]);
  });

  it("caps the result at the limit", () => {
    const recipes = ["a", "b", "c", "d", "e"].map(recipe);
    const result = selectBackInRotation(recipes, new Map(), { now: NOW, limit: 2 });
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("exposes sane tuning defaults", () => {
    expect(ROTATION_WINDOW_DAYS).toBe(28);
    expect(ROTATION_MIN).toBe(3);
  });
});
