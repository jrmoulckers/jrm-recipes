import { describe, expect, it } from "vitest";

import { imageConfig } from "./next-image.js";

/**
 * Perf contract for the next/image optimizer (issue #183). These guard the
 * acceptance criteria so a future edit can't silently drop AVIF, the long cache
 * TTL, or re-introduce the oversized default size rungs.
 */
describe("next/image optimizer config", () => {
  it("prefers AVIF, then WebP", () => {
    expect(imageConfig.formats).toEqual(["image/avif", "image/webp"]);
  });

  it("caches optimized variants for ~31 days", () => {
    // 31 days in seconds.
    expect(imageConfig.minimumCacheTTL).toBe(31 * 24 * 60 * 60);
  });

  it("drops the oversized 2048/3840 device rungs", () => {
    expect(imageConfig.deviceSizes).toBeDefined();
    const sizes = imageConfig.deviceSizes ?? [];
    expect(sizes).not.toContain(2048);
    expect(sizes).not.toContain(3840);
    // Still covers desktop hero at 1x (100vw on a large viewport).
    expect(Math.max(...sizes)).toBe(1920);
  });

  it("keeps imageSizes below the smallest deviceSize", () => {
    const smallestDevice = Math.min(...(imageConfig.deviceSizes ?? [640]));
    for (const size of imageConfig.imageSizes ?? []) {
      expect(size).toBeLessThan(smallestDevice);
    }
  });

  it("still allowlists the Cloudinary and Clerk image hosts", () => {
    const hosts = (imageConfig.remotePatterns ?? []).map((p) => p.hostname);
    expect(hosts).toContain("res.cloudinary.com");
    expect(hosts).toContain("img.clerk.com");
  });
});
