import { describe, expect, it } from "vitest";

import {
  isOfflineFallbackRequest,
  type OfflineFallbackRequest,
} from "./offline-fallback";

/** Build a minimal request shape; a real `Request` can't set `destination`. */
const makeRequest = (
  destination: Request["destination"],
  headers: Record<string, string> = {},
): OfflineFallbackRequest => ({
  destination,
  headers: new Headers(headers),
});

describe("isOfflineFallbackRequest", () => {
  it("matches hard navigations and reloads (document requests)", () => {
    expect(isOfflineFallbackRequest(makeRequest("document"))).toBe(true);
  });

  it("matches soft App Router navigations that fetch an RSC payload", () => {
    // Client-side navigations don't request a document — they carry `RSC: 1`.
    expect(isOfflineFallbackRequest(makeRequest("", { RSC: "1" }))).toBe(true);
  });

  it("matches RSC prefetch requests too", () => {
    expect(
      isOfflineFallbackRequest(
        makeRequest("", { RSC: "1", "Next-Router-Prefetch": "1" }),
      ),
    ).toBe(true);
  });

  it("ignores non-navigation subresource requests", () => {
    expect(isOfflineFallbackRequest(makeRequest("script"))).toBe(false);
    expect(isOfflineFallbackRequest(makeRequest("image"))).toBe(false);
    expect(isOfflineFallbackRequest(makeRequest("style"))).toBe(false);
    expect(isOfflineFallbackRequest(makeRequest(""))).toBe(false);
  });

  it("ignores a non-'1' RSC header value", () => {
    expect(isOfflineFallbackRequest(makeRequest("", { RSC: "0" }))).toBe(false);
  });

  it("accepts a real Request (structural compatibility)", () => {
    const rsc = new Request("https://heirloom.test/recipes/apple-pie", {
      headers: { RSC: "1" },
    });
    // Constructed requests report an empty destination, so this exercises the
    // RSC-header branch on a genuine Request instance.
    expect(isOfflineFallbackRequest(rsc)).toBe(true);

    const asset = new Request("https://heirloom.test/_next/static/chunk.js");
    expect(isOfflineFallbackRequest(asset)).toBe(false);
  });
});
