import { describe, expect, it } from "vitest";

import {
  isShareableImage,
  pickSharedUrl,
  safeSharedImageUrl,
  SHARED_IMAGE_MAX_BYTES,
} from "./share-target";

describe("pickSharedUrl", () => {
  it("prefers a direct http(s) url", () => {
    expect(pickSharedUrl("https://example.com/recipe")).toBe(
      "https://example.com/recipe",
    );
    expect(pickSharedUrl("http://example.com/recipe")).toBe(
      "http://example.com/recipe",
    );
  });

  it("checks candidates in order and skips empty ones", () => {
    expect(
      pickSharedUrl(null, "   ", undefined, "https://example.com/a"),
    ).toBe("https://example.com/a");
  });

  it("digs a bare url out of shared free text", () => {
    expect(
      pickSharedUrl("Check this out https://example.com/marinara please"),
    ).toBe("https://example.com/marinara");
  });

  it("falls through url -> text -> title", () => {
    expect(
      pickSharedUrl(null, "no link here", "Grandma https://example.com/x"),
    ).toBe("https://example.com/x");
  });

  it("rejects non-http(s) schemes", () => {
    expect(pickSharedUrl("javascript:alert(1)")).toBeUndefined();
    expect(pickSharedUrl("data:text/html,<h1>hi</h1>")).toBeUndefined();
    expect(pickSharedUrl("ftp://example.com/file")).toBeUndefined();
  });

  it("returns undefined when nothing usable is shared", () => {
    expect(pickSharedUrl(null, undefined, "")).toBeUndefined();
    expect(pickSharedUrl("just some words")).toBeUndefined();
  });
});

describe("isShareableImage", () => {
  it("accepts a reasonably sized image file", () => {
    expect(isShareableImage({ type: "image/jpeg", size: 2_000_000 })).toBe(true);
    expect(isShareableImage({ type: "image/HEIC", size: 1 })).toBe(true);
  });

  it("rejects non-image, empty, and oversize files", () => {
    expect(isShareableImage({ type: "application/pdf", size: 100 })).toBe(false);
    expect(isShareableImage({ type: "image/png", size: 0 })).toBe(false);
    expect(
      isShareableImage({ type: "image/png", size: SHARED_IMAGE_MAX_BYTES + 1 }),
    ).toBe(false);
    expect(isShareableImage(null)).toBe(false);
    expect(isShareableImage(undefined)).toBe(false);
  });
});

describe("safeSharedImageUrl", () => {
  it("accepts only https Cloudinary URLs", () => {
    expect(
      safeSharedImageUrl("https://res.cloudinary.com/demo/image/upload/x.jpg"),
    ).toBe("https://res.cloudinary.com/demo/image/upload/x.jpg");
  });

  it("rejects other hosts, schemes, and junk", () => {
    expect(safeSharedImageUrl("https://evil.example.com/x.jpg")).toBeUndefined();
    expect(
      safeSharedImageUrl("http://res.cloudinary.com/demo/x.jpg"),
    ).toBeUndefined();
    expect(safeSharedImageUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeSharedImageUrl(null)).toBeUndefined();
    expect(safeSharedImageUrl("")).toBeUndefined();
  });
});
