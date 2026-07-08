import { describe, expect, it } from "vitest";

import {
  firstSearchParam,
  parseCollectionParams,
  parseHandleParams,
  parseRecipeParams,
  parseSlugParams,
  parseTokenParams,
} from "./route-params";

describe("route-params contract (#208)", () => {
  describe("firstSearchParam", () => {
    it("passes a single value through", () => {
      expect(firstSearchParam("newest")).toBe("newest");
    });
    it("collapses a repeated value to the first entry", () => {
      expect(firstSearchParam(["a", "b"])).toBe("a");
    });
    it("returns undefined for absent or empty repeated values", () => {
      expect(firstSearchParam(undefined)).toBeUndefined();
      expect(firstSearchParam([])).toBeUndefined();
    });
  });

  describe("param parsers", () => {
    it("awaits and returns the validated recipe id/slug segment", async () => {
      await expect(parseRecipeParams(Promise.resolve({ id: "rec_1" }))).resolves.toEqual({
        id: "rec_1",
      });
    });
    it("validates each keyed segment shape", async () => {
      await expect(
        parseCollectionParams(Promise.resolve({ id: "col_1" })),
      ).resolves.toEqual({ id: "col_1" });
      await expect(
        parseSlugParams(Promise.resolve({ slug: "smith-family" })),
      ).resolves.toEqual({ slug: "smith-family" });
      await expect(
        parseHandleParams(Promise.resolve({ handle: "chef-jo" })),
      ).resolves.toEqual({ handle: "chef-jo" });
      await expect(
        parseTokenParams(Promise.resolve({ token: "tok_abc" })),
      ).resolves.toEqual({ token: "tok_abc" });
    });
    it("rejects an empty dynamic segment at the boundary", async () => {
      await expect(parseRecipeParams(Promise.resolve({ id: "" }))).rejects.toThrow();
    });
  });
});
