import { describe, expect, it } from "vitest";

import {
  buildWarmCookBundleMessage,
  cookImageUrlsToWarm,
  cookImageWidths,
  cookPagePath,
  isWarmCookBundleMessage,
  WARM_COOK_BUNDLE_MESSAGE_TYPE,
} from "./cook-warm";

/** Stand-in for the Cloudinary loader: encodes src + width deterministically. */
const fakeTransform = (src: string, width: number): string =>
  `${src}@w${width}`;

describe("cookPagePath", () => {
  it("builds the Cook Mode route for a slug or id", () => {
    expect(cookPagePath("apple-pie")).toBe("/recipes/apple-pie/cook");
  });
});

describe("cookImageWidths", () => {
  it("picks the smallest device-size rung that covers cssWidth * DPR", () => {
    // 390px phone at DPR 3 → needs 1170 → rung 1200 (+ next up 1920).
    expect(cookImageWidths(390, 3)).toEqual([1200, 1920]);
  });

  it("covers a desktop viewport", () => {
    // 1440 * 1 → 1440 → rung 1920 (already the top; next-up clamps to itself).
    expect(cookImageWidths(1440, 1)).toEqual([1920]);
  });

  it("clamps absurd DPR and non-finite input", () => {
    expect(cookImageWidths(320, 12)).toEqual([1080, 1200]); // dpr clamped to 3
    expect(cookImageWidths(Number.NaN, Number.NaN)).toEqual([640, 750]);
  });
});

describe("cookImageUrlsToWarm", () => {
  it("transforms each non-blank source at each target width, de-duplicated", () => {
    const urls = cookImageUrlsToWarm(
      [
        "https://res.cloudinary.com/x/image/upload/v1/a.jpg",
        "",
        null,
        undefined,
      ],
      390,
      3,
      fakeTransform,
    );
    expect(urls).toEqual([
      "https://res.cloudinary.com/x/image/upload/v1/a.jpg@w1200",
      "https://res.cloudinary.com/x/image/upload/v1/a.jpg@w1920",
    ]);
  });

  it("returns nothing when there are no usable sources", () => {
    expect(cookImageUrlsToWarm([null, "  "], 800, 2, fakeTransform)).toEqual(
      [],
    );
  });
});

describe("buildWarmCookBundleMessage / isWarmCookBundleMessage", () => {
  it("round-trips a well-formed message", () => {
    const message = buildWarmCookBundleMessage({
      slug: "apple-pie",
      imageUrls: ["https://res.cloudinary.com/x/a.jpg@w1200"],
    });
    expect(message.type).toBe(WARM_COOK_BUNDLE_MESSAGE_TYPE);
    expect(message.pageUrls).toEqual(["/recipes/apple-pie/cook"]);
    expect(isWarmCookBundleMessage(message)).toBe(true);
  });

  it("rejects foreign / malformed payloads", () => {
    expect(isWarmCookBundleMessage(null)).toBe(false);
    expect(isWarmCookBundleMessage("SKIP_WAITING")).toBe(false);
    expect(isWarmCookBundleMessage({ type: "other" })).toBe(false);
    expect(
      isWarmCookBundleMessage({
        type: WARM_COOK_BUNDLE_MESSAGE_TYPE,
        pageUrls: "no",
        imageUrls: [],
      }),
    ).toBe(false);
  });
});
