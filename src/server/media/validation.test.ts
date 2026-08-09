import { describe, expect, it } from "vitest";

import {
  mediaPublicId,
  mediaUrl,
  recordUploadInput,
  updateAltTextInput,
} from "./validation";

describe("mediaUrl", () => {
  it("accepts an allowlisted delivery host", () => {
    expect(
      mediaUrl.safeParse("https://res.cloudinary.com/demo/image/upload/a.jpg")
        .success,
    ).toBe(true);
  });

  it("rejects an off-allowlist host so a stored image can't beacon viewers", () => {
    expect(mediaUrl.safeParse("https://evil.test/track.jpg").success).toBe(
      false,
    );
  });

  it("rejects a non-http scheme", () => {
    expect(mediaUrl.safeParse("javascript:alert(1)").success).toBe(false);
  });
});

describe("mediaPublicId", () => {
  it("accepts a nested heirloom-style id", () => {
    expect(mediaPublicId.safeParse("heirloom/recipes/abc_123-x").success).toBe(
      true,
    );
  });

  it.each(["../secrets", "heirloom/../other", "heirloom/a..b", "a/../b"])(
    "rejects traversal attempt %s",
    (value) => {
      expect(mediaPublicId.safeParse(value).success).toBe(false);
    },
  );

  it("rejects a leading or trailing slash", () => {
    expect(mediaPublicId.safeParse("/heirloom/a").success).toBe(false);
    expect(mediaPublicId.safeParse("heirloom/a/").success).toBe(false);
  });
});

describe("recordUploadInput", () => {
  const url = "https://res.cloudinary.com/demo/image/upload/a.jpg";

  it("accepts a full Cloudinary upload payload", () => {
    const parsed = recordUploadInput.safeParse({
      url,
      publicId: "heirloom/a1",
      width: 1200,
      height: 800,
      bytes: 240_000,
      format: "webp",
      folder: "heirloom/recipes",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a folder outside the heirloom namespace", () => {
    const parsed = recordUploadInput.safeParse({
      url,
      publicId: "heirloom/a1",
      folder: "someone-else",
    });
    expect(parsed.success).toBe(false);
  });

  it("collapses empty alt text to undefined so it clears the column", () => {
    const parsed = recordUploadInput.parse({ url, altText: "   " });
    expect(parsed.altText).toBeUndefined();
  });

  it("rejects alt text beyond the column width", () => {
    const parsed = recordUploadInput.safeParse({
      url,
      altText: "x".repeat(301),
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a negative or zero byte count", () => {
    expect(recordUploadInput.safeParse({ url, bytes: 0 }).success).toBe(false);
    expect(recordUploadInput.safeParse({ url, bytes: -5 }).success).toBe(false);
  });
});

describe("updateAltTextInput", () => {
  it("requires an id", () => {
    expect(updateAltTextInput.safeParse({ altText: "A pie" }).success).toBe(
      false,
    );
  });

  it("allows clearing the description", () => {
    const parsed = updateAltTextInput.parse({ id: "abc", altText: "" });
    expect(parsed.altText).toBeUndefined();
  });
});
