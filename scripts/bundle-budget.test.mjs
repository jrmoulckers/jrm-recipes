import { describe, expect, it } from "vitest";

import {
  evaluateBudgets,
  parseFirstLoadJs,
  toKb,
} from "./check-bundle-budget.mjs";

// A representative slice of `next build` output, including ANSI colour codes,
// route groups, dynamic segments, and a byte-sized (not kB) Size column.
const SAMPLE_BUILD_OUTPUT = [
  "Route (app)                                Size     First Load JS",
  "┌ ƒ /                                      3.84 kB         120 kB",
  "├ ƒ /recipes                               11.6 kB         202 kB",
  "├ ƒ /recipes/[id]                          19.7 kB         234 kB",
  "├ ƒ /recipes/[id]/edit                       145 B         157 kB",
  "├ ○ /manifest.webmanifest                      0 B            0 B",
  "\u001b[90m└ ƒ /api/health\u001b[39m                          0 B            0 B",
  "+ First Load JS shared by all              104 kB",
].join("\n");

describe("parseFirstLoadJs (#206)", () => {
  const parsed = parseFirstLoadJs(SAMPLE_BUILD_OUTPUT);

  it("reads the last size column (First Load JS) per route", () => {
    expect(parsed.get("/")).toBeCloseTo(120);
    expect(parsed.get("/recipes")).toBeCloseTo(202);
    expect(parsed.get("/recipes/[id]")).toBeCloseTo(234);
  });

  it("handles dynamic segments and byte-sized Size columns", () => {
    // 157 kB is the First Load JS even though Size is 145 B on that row.
    expect(parsed.get("/recipes/[id]/edit")).toBeCloseTo(157);
  });

  it("strips ANSI colour codes before parsing", () => {
    expect(parsed.has("/api/health")).toBe(true);
  });

  it("ignores the header and shared-JS summary lines", () => {
    expect(parsed.has("/manifest.webmanifest")).toBe(true);
    // No bare "Route" or "+ First Load JS" keys leak in as routes.
    for (const key of parsed.keys()) {
      expect(key.startsWith("/")).toBe(true);
    }
  });
});

describe("toKb (#206)", () => {
  it("normalises B, kB, and MB to kB", () => {
    expect(toKb(2048, "B")).toBeCloseTo(2);
    expect(toKb(120, "kB")).toBe(120);
    expect(toKb(1, "MB")).toBe(1024);
  });
});

describe("evaluateBudgets (#206)", () => {
  const budgets = { "/": 135, "/recipes": 220 };

  it("passes when every tracked route is within budget", () => {
    const measured = new Map([
      ["/", 120],
      ["/recipes", 202],
    ]);
    const { failed, rows } = evaluateBudgets(measured, budgets);
    expect(failed).toBe(false);
    expect(rows.every((r) => r.status === "ok")).toBe(true);
  });

  it("fails when a tracked route exceeds its budget", () => {
    const measured = new Map([
      ["/", 120],
      ["/recipes", 240],
    ]);
    const { failed, rows } = evaluateBudgets(measured, budgets);
    expect(failed).toBe(true);
    expect(rows.find((r) => r.route === "/recipes")?.status).toBe("OVER");
  });

  it("fails when a tracked route is missing from the build output", () => {
    const measured = new Map([["/", 120]]);
    const { failed, rows } = evaluateBudgets(measured, budgets);
    expect(failed).toBe(true);
    expect(rows.find((r) => r.route === "/recipes")?.status).toBe("MISSING");
  });
});
