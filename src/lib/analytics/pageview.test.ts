import { describe, expect, it } from "vitest";

import { normalizePathname } from "./pageview";

describe("normalizePathname", () => {
  it("passes through static routes unchanged", () => {
    for (const path of [
      "/",
      "/recipes",
      "/recipes/new",
      "/groups",
      "/collections",
      "/journal",
      "/plan",
      "/shopping",
    ]) {
      expect(normalizePathname(path)).toBe(path);
    }
  });

  it("collapses recipe ids to :id", () => {
    expect(normalizePathname("/recipes/abc123def456")).toBe("/recipes/:id");
    expect(normalizePathname("/recipes/abc123/edit")).toBe("/recipes/:id/edit");
    expect(normalizePathname("/recipes/abc123/cook")).toBe("/recipes/:id/cook");
    expect(normalizePathname("/recipes/abc123/print")).toBe(
      "/recipes/:id/print",
    );
  });

  it("collapses collection ids to :id", () => {
    expect(normalizePathname("/collections/xyz789")).toBe("/collections/:id");
  });

  it("collapses group slugs to :slug and keeps static children", () => {
    expect(normalizePathname("/groups/the-smiths")).toBe("/groups/:slug");
    expect(normalizePathname("/groups/the-smiths/settings")).toBe(
      "/groups/:slug/settings",
    );
  });

  it("never leaves a real slug or id in the normalized path", () => {
    const normalized = normalizePathname("/groups/private-family-name/settings");
    expect(normalized).not.toContain("private-family-name");
  });

  it("is resilient to empty input", () => {
    expect(normalizePathname("")).toBe("/");
  });
});
