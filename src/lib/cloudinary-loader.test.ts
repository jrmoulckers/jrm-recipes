import { describe, expect, it } from "vitest";

import { cloudinaryLoader, isCloudinaryUrl } from "./cloudinary-loader";

const CLOUD =
  "https://res.cloudinary.com/heirloom/image/upload/v1699999999/heirloom/cover.jpg";

describe("isCloudinaryUrl", () => {
  it("recognizes Cloudinary image-upload URLs", () => {
    expect(isCloudinaryUrl(CLOUD)).toBe(true);
  });

  it("rejects other hosts and delivery types", () => {
    expect(isCloudinaryUrl("https://img.clerk.com/abc.png")).toBe(false);
    expect(isCloudinaryUrl("https://example.com/photo.jpg")).toBe(false);
    expect(
      isCloudinaryUrl(
        "https://res.cloudinary.com/heirloom/video/upload/v1/x.mp4",
      ),
    ).toBe(false);
  });

  it("rejects relative / non-URL sources", () => {
    expect(isCloudinaryUrl("/local/photo.jpg")).toBe(false);
    expect(isCloudinaryUrl("not a url")).toBe(false);
  });
});

describe("cloudinaryLoader", () => {
  it("injects f_auto,q_auto,c_limit and the responsive width", () => {
    const out = cloudinaryLoader({ src: CLOUD, width: 640 });
    expect(out).toBe(
      "https://res.cloudinary.com/heirloom/image/upload/f_auto,q_auto,c_limit,w_640/v1699999999/heirloom/cover.jpg",
    );
  });

  it("threads an explicit quality through", () => {
    const out = cloudinaryLoader({ src: CLOUD, width: 828, quality: 70 });
    expect(out).toContain("q_70");
    expect(out).toContain("w_828");
  });

  it("preserves the version and the full nested public id", () => {
    const out = cloudinaryLoader({ src: CLOUD, width: 1080 });
    expect(out).toContain("/v1699999999/heirloom/cover.jpg");
    expect(
      out.startsWith("https://res.cloudinary.com/heirloom/image/upload/"),
    ).toBe(true);
  });

  it("leaves non-Cloudinary URLs untouched (Clerk avatars, pasted URLs)", () => {
    const clerk = "https://img.clerk.com/user_123.png";
    expect(cloudinaryLoader({ src: clerk, width: 96 })).toBe(clerk);
    const pasted = "https://example.com/my-photo.jpg";
    expect(cloudinaryLoader({ src: pasted, width: 640 })).toBe(pasted);
  });

  it("only rewrites the first upload segment", () => {
    // Contrived public id that itself contains the segment text — must not drop
    // the trailing path.
    const weird =
      "https://res.cloudinary.com/heirloom/image/upload/v1/a-image-upload-b.jpg";
    const out = cloudinaryLoader({ src: weird, width: 400 });
    expect(out).toBe(
      "https://res.cloudinary.com/heirloom/image/upload/f_auto,q_auto,c_limit,w_400/v1/a-image-upload-b.jpg",
    );
  });
});
