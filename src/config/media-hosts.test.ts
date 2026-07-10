import { describe, expect, it } from "vitest";

import { ALLOWED_MEDIA_HOSTS, isAllowedMediaUrl } from "./media-hosts.js";

/**
 * Security contract for the stored-media host allowlist (issue #216). The same
 * list backs `next/image` `remotePatterns`, so these guards also keep rendering
 * and validation in lockstep.
 */
describe("media host allowlist", () => {
  it("accepts Cloudinary and Clerk delivery hosts", () => {
    expect(ALLOWED_MEDIA_HOSTS).toContain("res.cloudinary.com");
    expect(
      isAllowedMediaUrl("https://res.cloudinary.com/demo/image/upload/x.jpg"),
    ).toBe(true);
    expect(isAllowedMediaUrl("https://img.clerk.com/avatar.png")).toBe(true);
  });

  it("rejects off-allowlist hosts (tracking/beacon vector)", () => {
    expect(isAllowedMediaUrl("https://evil.example/pixel.gif")).toBe(false);
    expect(isAllowedMediaUrl("https://169.254.169.254/latest/meta")).toBe(
      false,
    );
    // A look-alike subdomain must not slip through a naive endsWith check.
    expect(
      isAllowedMediaUrl("https://res.cloudinary.com.evil.example/x.jpg"),
    ).toBe(false);
  });

  it("rejects malformed URLs and non-http(s) schemes", () => {
    expect(isAllowedMediaUrl("not a url")).toBe(false);
    expect(isAllowedMediaUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedMediaUrl("data:image/png;base64,AAAA")).toBe(false);
  });
});
