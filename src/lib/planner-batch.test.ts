import { describe, expect, it } from "vitest";

import {
  formatLeftoversNote,
  isLeftoversNote,
  normalizeBatchMultiple,
  parseLeftoversNote,
} from "./planner-batch";

describe("planner-batch note convention (#380)", () => {
  it("round-trips a leftovers note", () => {
    const note = formatLeftoversNote("Weeknight Chili", 2);
    expect(note).toBe("Leftovers · Weeknight Chili · 2× batch");
    expect(parseLeftoversNote(note)).toEqual({
      title: "Weeknight Chili",
      multiple: 2,
    });
  });

  it("normalizes odd multiples toward supported values", () => {
    expect(normalizeBatchMultiple(1)).toBe(2);
    expect(normalizeBatchMultiple(2)).toBe(2);
    expect(normalizeBatchMultiple(3)).toBe(3);
    expect(normalizeBatchMultiple(9)).toBe(3);
    expect(formatLeftoversNote("Stew", 5)).toBe("Leftovers · Stew · 3× batch");
  });

  it("collapses whitespace in titles", () => {
    expect(formatLeftoversNote("  Big   Batch  Curry ", 3)).toBe(
      "Leftovers · Big Batch Curry · 3× batch",
    );
  });

  it("keeps the note within the 300-char column limit", () => {
    const long = "A".repeat(400);
    const note = formatLeftoversNote(long, 2);
    expect(note.length).toBeLessThanOrEqual(300);
    expect(parseLeftoversNote(note)?.multiple).toBe(2);
  });

  it("rejects notes that are not leftovers", () => {
    expect(parseLeftoversNote(null)).toBeNull();
    expect(parseLeftoversNote("")).toBeNull();
    expect(parseLeftoversNote("Order pizza")).toBeNull();
    expect(parseLeftoversNote("Leftovers · Chili")).toBeNull();
    expect(isLeftoversNote("Prep the marinade tonight")).toBe(false);
    expect(isLeftoversNote("Leftovers · Chili · 2× batch")).toBe(true);
  });

  it("parses a title that itself mentions leftovers", () => {
    const note = formatLeftoversNote("Leftover-Turkey Soup", 2);
    expect(parseLeftoversNote(note)).toEqual({
      title: "Leftover-Turkey Soup",
      multiple: 2,
    });
  });
});
