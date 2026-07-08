import { describe, expect, it } from "vitest";

import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  generateNonce,
  staticSecurityHeaders,
} from "~/lib/security/headers";

describe("buildContentSecurityPolicy", () => {
  const csp = buildContentSecurityPolicy("abc123");

  it("binds scripts to the given nonce with strict-dynamic", () => {
    expect(csp).toContain("script-src");
    expect(csp).toContain("'nonce-abc123'");
    expect(csp).toContain("'strict-dynamic'");
  });

  it("locks down framing, base-uri, and objects", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("default-src 'self'");
  });

  it("allowlists Cloudinary media and Clerk origins", () => {
    expect(csp).toContain("https://res.cloudinary.com");
    expect(csp).toContain("https://img.clerk.com");
    expect(csp).toContain("https://*.clerk.accounts.dev");
  });

  it("permits the service worker and its blob workers", () => {
    expect(csp).toContain("worker-src 'self' blob:");
  });

  it("emits valueless directives without a trailing space", () => {
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("upgrade-insecure-requests ");
  });
});

describe("staticSecurityHeaders", () => {
  it("includes the full defense-in-depth header set", () => {
    const headers = staticSecurityHeaders();
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
  });
});

describe("applySecurityHeaders", () => {
  it("sets CSP plus every static header on the Headers object", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, buildContentSecurityPolicy("n"));
    expect(headers.get("Content-Security-Policy")).toContain("'nonce-n'");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Strict-Transport-Security")).toBeTruthy();
  });
});

describe("generateNonce", () => {
  it("produces a unique, non-empty base64 value each call", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
    // Valid base64 round-trips through atob without throwing.
    expect(() => atob(a)).not.toThrow();
  });
});
