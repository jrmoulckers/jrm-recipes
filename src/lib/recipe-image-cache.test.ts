import { describe, expect, it } from "vitest";

import {
  isRecipeImageRequest,
  RECIPE_IMAGE_CACHE_MAX_AGE_SECONDS,
  RECIPE_IMAGE_CACHE_MAX_ENTRIES,
  type RecipeImageRequest,
} from "./recipe-image-cache";

/** Build a minimal request shape; a real `Request` can't set `destination`. */
const makeRequest = (
  url: string,
  destination: Request["destination"] = "image",
): RecipeImageRequest => ({ url, destination });

/** A `/_next/image` optimizer URL for a given proxied source. */
const optimizerUrl = (source: string): string =>
  `https://heirloom.test/_next/image?url=${encodeURIComponent(source)}&w=1080&q=75`;

describe("isRecipeImageRequest", () => {
  it("matches direct cross-origin Cloudinary image requests", () => {
    expect(
      isRecipeImageRequest(
        makeRequest("https://res.cloudinary.com/demo/image/upload/v1/hero.jpg"),
      ),
    ).toBe(true);
  });

  it("matches Next.js optimizer requests proxying a Cloudinary source", () => {
    // Cook Mode renders with `next/image`, so the browser hits the optimizer
    // rather than Cloudinary directly.
    expect(
      isRecipeImageRequest(
        makeRequest(
          optimizerUrl("https://res.cloudinary.com/demo/image/upload/v1/step-3.jpg"),
        ),
      ),
    ).toBe(true);
  });

  it("ignores Cloudinary videos (only images belong in the bounded cache)", () => {
    expect(
      isRecipeImageRequest(
        makeRequest(
          "https://res.cloudinary.com/demo/video/upload/v1/clip.mp4",
          "video",
        ),
      ),
    ).toBe(false);
  });

  it("ignores a Cloudinary URL fetched with a non-image destination", () => {
    expect(
      isRecipeImageRequest(
        makeRequest("https://res.cloudinary.com/demo/image/upload/v1/hero.jpg", ""),
      ),
    ).toBe(false);
  });

  it("leaves non-Cloudinary optimized images on the default next-image route", () => {
    // e.g. Clerk avatars — still optimized, but not recipe images.
    expect(
      isRecipeImageRequest(
        makeRequest(optimizerUrl("https://img.clerk.com/avatar.png")),
      ),
    ).toBe(false);
  });

  it("ignores optimizer requests for local (same-origin) images", () => {
    expect(
      isRecipeImageRequest(makeRequest(optimizerUrl("/icons/logo.png"))),
    ).toBe(false);
  });

  it("ignores an optimizer request with no url param", () => {
    expect(
      isRecipeImageRequest(
        makeRequest("https://heirloom.test/_next/image?w=640&q=75"),
      ),
    ).toBe(false);
  });

  it("does not match hostnames that merely start with the Cloudinary host", () => {
    expect(
      isRecipeImageRequest(
        makeRequest("https://res.cloudinary.com.evil.example/steal.jpg"),
      ),
    ).toBe(false);
  });

  it("ignores same-origin navigations and other subresources", () => {
    expect(
      isRecipeImageRequest(
        makeRequest("https://heirloom.test/recipes/apple-pie", "document"),
      ),
    ).toBe(false);
    expect(
      isRecipeImageRequest(
        makeRequest("https://heirloom.test/_next/static/chunk.js", "script"),
      ),
    ).toBe(false);
  });

  it("returns false for an unparseable URL", () => {
    expect(isRecipeImageRequest(makeRequest("not a url"))).toBe(false);
  });

  it("accepts a real Request (structural compatibility)", () => {
    // Constructed requests report an empty destination, so this exercises the
    // destination guard on a genuine Request instance.
    const req = new Request(
      "https://res.cloudinary.com/demo/image/upload/v1/hero.jpg",
    );
    expect(isRecipeImageRequest(req)).toBe(false);
  });

  it("exposes bounded cache limits", () => {
    expect(RECIPE_IMAGE_CACHE_MAX_ENTRIES).toBeGreaterThan(0);
    expect(RECIPE_IMAGE_CACHE_MAX_AGE_SECONDS).toBeGreaterThan(0);
  });
});
