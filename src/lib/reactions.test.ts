import { describe, expect, it } from "vitest";

import {
  hasReacted,
  reactionGlyph,
  toggleReactionState,
  type ReactionCount,
} from "./reactions";

describe("toggleReactionState (issue #342)", () => {
  it("adds a brand-new reaction the viewer hasn't used", () => {
    const next = toggleReactionState([], "love");
    expect(next).toEqual([{ emoji: "love", count: 1, reacted: true }]);
  });

  it("increments an existing emoji the viewer had not reacted to", () => {
    const counts: ReactionCount[] = [
      { emoji: "love", count: 2, reacted: false },
    ];
    expect(toggleReactionState(counts, "love")).toEqual([
      { emoji: "love", count: 3, reacted: true },
    ]);
  });

  it("removes the viewer's reaction and drops the emoji when it hits zero", () => {
    const counts: ReactionCount[] = [
      { emoji: "yum", count: 1, reacted: true },
    ];
    expect(toggleReactionState(counts, "yum")).toEqual([]);
  });

  it("decrements but keeps the emoji when others still reacted", () => {
    const counts: ReactionCount[] = [
      { emoji: "clap", count: 3, reacted: true },
    ];
    expect(toggleReactionState(counts, "clap")).toEqual([
      { emoji: "clap", count: 2, reacted: false },
    ]);
  });

  it("keeps the fixed emoji order after a toggle", () => {
    const counts: ReactionCount[] = [
      { emoji: "party", count: 1, reacted: false },
    ];
    const next = toggleReactionState(counts, "love");
    expect(next.map((c) => c.emoji)).toEqual(["love", "party"]);
  });

  it("does not mutate the input array", () => {
    const counts: ReactionCount[] = [
      { emoji: "love", count: 1, reacted: false },
    ];
    toggleReactionState(counts, "love");
    expect(counts).toEqual([{ emoji: "love", count: 1, reacted: false }]);
  });
});

describe("hasReacted", () => {
  it("is true only for an active reaction with a positive count", () => {
    const counts: ReactionCount[] = [
      { emoji: "love", count: 1, reacted: true },
      { emoji: "yum", count: 2, reacted: false },
    ];
    expect(hasReacted(counts, "love")).toBe(true);
    expect(hasReacted(counts, "yum")).toBe(false);
    expect(hasReacted(counts, "fire")).toBe(false);
  });
});

describe("reactionGlyph", () => {
  it("maps a key to its glyph", () => {
    expect(reactionGlyph("love")).toBe("❤️");
    expect(reactionGlyph("fire")).toBe("🔥");
  });
});
