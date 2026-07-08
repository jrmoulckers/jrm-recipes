import { describe, expect, it } from "vitest";

import robots from "./robots";

describe("robots", () => {
  const result = robots();
  const rule = Array.isArray(result.rules) ? result.rules[0]! : result.rules;
  const disallow = Array.isArray(rule.disallow)
    ? rule.disallow
    : [rule.disallow!];

  it("points at the sitemap", () => {
    expect(String(result.sitemap)).toMatch(/\/sitemap\.xml$/);
  });

  it("allows crawling from the root", () => {
    expect(rule.allow).toBe("/");
    expect(rule.userAgent).toBe("*");
  });

  it("disallows app-only, immersive, editor and private routes", () => {
    expect(disallow).toContain("/api/");
    expect(disallow).toContain("/recipes/new");
    expect(disallow).toContain("/recipes/*/edit");
    expect(disallow).toContain("/recipes/*/cook");
    expect(disallow).toContain("/recipes/*/print");
  });

  it("does not disallow the public recipe or discover surfaces", () => {
    expect(disallow).not.toContain("/recipes");
    expect(disallow).not.toContain("/");
  });
});
