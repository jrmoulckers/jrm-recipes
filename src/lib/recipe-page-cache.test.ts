import { describe, expect, it } from "vitest";

import {
  isRecipePageRequest,
  RECIPE_PAGE_CACHE_MAX_AGE_SECONDS,
  RECIPE_PAGE_CACHE_MAX_ENTRIES,
  RECIPE_PAGE_CACHE_NAME,
  type RecipePageRequest,
} from "./recipe-page-cache";

/** Build a minimal request shape; a real `Request` can't set `destination`. */
const makeRequest = (
  url: string,
  destination: Request["destination"] = "document",
  rscHeader = false,
): RecipePageRequest => ({ url, destination, rscHeader });

const ORIGIN = "https://heirloom.test";

describe("isRecipePageRequest", () => {
  it("matches a recipe detail document navigation", () => {
    expect(
      isRecipePageRequest(makeRequest(`${ORIGIN}/recipes/apple-pie`)),
    ).toBe(true);
  });

  it("matches the Cook Mode document navigation", () => {
    expect(
      isRecipePageRequest(makeRequest(`${ORIGIN}/recipes/apple-pie/cook`)),
    ).toBe(true);
  });

  it("matches an RSC payload request via the RSC header", () => {
    // Soft navigation: destination is the empty string, but the RSC header is set.
    expect(
      isRecipePageRequest(makeRequest(`${ORIGIN}/recipes/apple-pie`, "", true)),
    ).toBe(true);
  });

  it("matches an RSC payload request via the ?_rsc= param", () => {
    expect(
      isRecipePageRequest(
        makeRequest(`${ORIGIN}/recipes/apple-pie/cook?_rsc=abc123`, ""),
      ),
    ).toBe(true);
  });

  it("ignores a recipe subresource that is neither a document nor RSC", () => {
    expect(
      isRecipePageRequest(makeRequest(`${ORIGIN}/recipes/apple-pie`, "script")),
    ).toBe(false);
  });

  it("does not cache the edit page", () => {
    expect(
      isRecipePageRequest(makeRequest(`${ORIGIN}/recipes/apple-pie/edit`)),
    ).toBe(false);
  });

  it("does not cache sibling non-detail routes", () => {
    for (const path of ["/recipes/new", "/recipes/cook-with", "/recipes/tags"]) {
      expect(isRecipePageRequest(makeRequest(`${ORIGIN}${path}`))).toBe(false);
    }
  });

  it("does not cache the recipes index or unrelated pages", () => {
    expect(isRecipePageRequest(makeRequest(`${ORIGIN}/recipes`))).toBe(false);
    expect(isRecipePageRequest(makeRequest(`${ORIGIN}/`))).toBe(false);
    expect(isRecipePageRequest(makeRequest(`${ORIGIN}/settings`))).toBe(false);
  });

  it("does not match deeper paths under a recipe id", () => {
    expect(
      isRecipePageRequest(makeRequest(`${ORIGIN}/recipes/apple-pie/cook/steps`)),
    ).toBe(false);
  });

  it("returns false for an unparseable URL", () => {
    expect(isRecipePageRequest(makeRequest("not a url"))).toBe(false);
  });

  it("exposes a named, bounded cache", () => {
    expect(RECIPE_PAGE_CACHE_NAME).toBe("heirloom-recipes");
    expect(RECIPE_PAGE_CACHE_MAX_ENTRIES).toBeGreaterThan(0);
    expect(RECIPE_PAGE_CACHE_MAX_AGE_SECONDS).toBeGreaterThan(0);
  });
});
