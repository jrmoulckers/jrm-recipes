import { describe, expect, it } from "vitest";

import { RESOURCE_HINT_ORIGINS, preconnectOrigins } from "./resource-hints";

describe("preconnectOrigins", () => {
  it("always preconnects the image CDN", () => {
    expect(preconnectOrigins(false)).toContain(
      RESOURCE_HINT_ORIGINS.cloudinary,
    );
    expect(preconnectOrigins(true)).toContain(RESOURCE_HINT_ORIGINS.cloudinary);
  });

  it("omits the Clerk avatar origin when auth is not configured", () => {
    expect(preconnectOrigins(false)).not.toContain(RESOURCE_HINT_ORIGINS.clerk);
    expect(preconnectOrigins(false)).toEqual([
      RESOURCE_HINT_ORIGINS.cloudinary,
    ]);
  });

  it("adds the Clerk avatar origin only when auth is configured", () => {
    expect(preconnectOrigins(true)).toContain(RESOURCE_HINT_ORIGINS.clerk);
    expect(preconnectOrigins(true)).toHaveLength(2);
  });

  it("uses absolute https origins (valid preconnect hrefs)", () => {
    for (const origin of preconnectOrigins(true)) {
      expect(origin).toMatch(/^https:\/\//);
      expect(() => new URL(origin)).not.toThrow();
    }
  });
});
