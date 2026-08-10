import { describe, expect, it } from "vitest";

import { cloudinaryRefFromUrl } from "./public-id";

describe("cloudinaryRefFromUrl", () => {
  it("recovers the public id from a plain delivery URL", () => {
    expect(
      cloudinaryRefFromUrl(
        "https://res.cloudinary.com/heirloom/image/upload/v1699999999/heirloom/cover.jpg",
      ),
    ).toEqual({ publicId: "heirloom/cover", resourceType: "image" });
  });

  it("ignores transformation segments", () => {
    expect(
      cloudinaryRefFromUrl(
        "https://res.cloudinary.com/heirloom/image/upload/f_auto,q_auto,c_limit,w_640/v1/heirloom/recipes/a1.jpg",
      ),
    ).toEqual({ publicId: "heirloom/recipes/a1", resourceType: "image" });
  });

  it("handles a URL with no version and no transforms", () => {
    expect(
      cloudinaryRefFromUrl(
        "https://res.cloudinary.com/demo/image/upload/a.jpg",
      ),
    ).toEqual({ publicId: "a", resourceType: "image" });
  });

  it("keeps the video resource type so destroy targets the right store", () => {
    expect(
      cloudinaryRefFromUrl(
        "https://res.cloudinary.com/heirloom/video/upload/v1/heirloom/steps/clip.mp4",
      ),
    ).toEqual({ publicId: "heirloom/steps/clip", resourceType: "video" });
  });

  it("refuses URLs on other hosts", () => {
    expect(
      cloudinaryRefFromUrl("https://example.com/image/upload/v1/a.jpg"),
    ).toBeNull();
    // Suffix attack: a hostname that merely ends with the Cloudinary host.
    expect(
      cloudinaryRefFromUrl(
        "https://res.cloudinary.com.evil.example/image/upload/v1/a.jpg",
      ),
    ).toBeNull();
  });

  it("refuses delivery types we have no delete authority over", () => {
    // `fetch` proxies a remote origin; destroying it would target bytes we
    // never uploaded.
    expect(
      cloudinaryRefFromUrl(
        "https://res.cloudinary.com/demo/image/fetch/https://elsewhere.example/a.jpg",
      ),
    ).toBeNull();
  });

  it("refuses traversal in the derived public id", () => {
    // `new URL` resolves `..` away, so without a raw-string guard this would
    // parse to the public id `other/a` — a crafted stored URL retargeting a
    // destroy at a folder the departing user never owned.
    expect(
      cloudinaryRefFromUrl(
        "https://res.cloudinary.com/demo/image/upload/v1/heirloom/../other/a.jpg",
      ),
    ).toBeNull();
    // Percent-encoded form of the same attack.
    expect(
      cloudinaryRefFromUrl(
        "https://res.cloudinary.com/demo/image/upload/v1/heirloom/%2e%2e/other/a.jpg",
      ),
    ).toBeNull();
  });

  it("returns null rather than guessing on malformed input", () => {
    expect(cloudinaryRefFromUrl("not a url")).toBeNull();
    expect(cloudinaryRefFromUrl("")).toBeNull();
    expect(
      cloudinaryRefFromUrl("https://res.cloudinary.com/demo/image/upload/"),
    ).toBeNull();
  });
});
