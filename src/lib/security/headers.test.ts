import { describe, expect, it } from "vitest";

import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  clerkFrontendApiHost,
  generateNonce,
  staticSecurityHeaders,
} from "~/lib/security/headers";

/** A pk_live key encoding the FAPI host `clerk.example.com` (host + trailing $). */
const PK_LIVE = "pk_live_" + btoa("clerk.example.com$");
/** A pk_test key encoding a dev host. */
const PK_TEST = "pk_test_" + btoa("upbeat-cat-42.clerk.accounts.dev$");

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

  it("allowlists Cloudinary media and Clerk dev origins", () => {
    expect(csp).toContain("https://res.cloudinary.com");
    expect(csp).toContain("https://img.clerk.com");
    expect(csp).toContain("https://*.clerk.accounts.dev");
  });

  it("allowlists the Cloudinary upload widget + API so uploads work", () => {
    // Regression: strict-dynamic does NOT cover frame-src/connect-src, so the
    // widget iframe + api.cloudinary.com must be listed explicitly (#212).
    expect(csp).toContain("https://upload-widget.cloudinary.com");
    expect(csp).toContain("https://api.cloudinary.com");
    // The upload widget renders in an iframe.
    const frameSrc = csp
      .split(";")
      .find((d) => d.trim().startsWith("frame-src"));
    expect(frameSrc).toContain("https://upload-widget.cloudinary.com");
    // …and calls its API over XHR/fetch.
    const connectSrc = csp
      .split(";")
      .find((d) => d.trim().startsWith("connect-src"));
    expect(connectSrc).toContain("https://api.cloudinary.com");
  });

  it("allowlists the derived Clerk production FAPI host across directives", () => {
    // Regression: a pk_live instance serves FAPI from a custom domain reached by
    // connect-src (no https: fallback) + a session iframe — must be allowlisted
    // or sign-in/session hydration break in production (#212).
    const prod = buildContentSecurityPolicy("n", PK_LIVE);
    for (const directive of [
      "script-src",
      "connect-src",
      "img-src",
      "frame-src",
    ]) {
      const line = prod.split(";").find((d) => d.trim().startsWith(directive));
      expect(line).toContain("https://clerk.example.com");
    }
  });

  it("permits the service worker and its blob workers", () => {
    expect(csp).toContain("worker-src 'self' blob:");
  });

  it("emits valueless directives without a trailing space", () => {
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("upgrade-insecure-requests ");
  });
});

describe("clerkFrontendApiHost", () => {
  it("derives the FAPI host from a pk_live key", () => {
    expect(clerkFrontendApiHost(PK_LIVE)).toBe("clerk.example.com");
  });

  it("derives the FAPI host from a pk_test key", () => {
    expect(clerkFrontendApiHost(PK_TEST)).toBe(
      "upbeat-cat-42.clerk.accounts.dev",
    );
  });

  it("returns null for an absent or malformed key (dev-bypass/e2e)", () => {
    expect(clerkFrontendApiHost(undefined)).toBeNull();
    expect(clerkFrontendApiHost("")).toBeNull();
    expect(clerkFrontendApiHost("not-a-key")).toBeNull();
  });

  it("omits any Clerk prod host when no key is supplied", () => {
    const csp = buildContentSecurityPolicy("n");
    // Only the dev wildcard is present; no bare derived host leaks in.
    expect(csp).toContain("https://*.clerk.accounts.dev");
    expect(csp).not.toContain("https://clerk.example.com");
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
