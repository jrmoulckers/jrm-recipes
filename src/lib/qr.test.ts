import { describe, expect, it } from "vitest";

import { buildQrCode } from "~/lib/qr";

const URL = "https://heirloom.example/recipes/grandmas-apple-pie";

describe("buildQrCode", () => {
  it("encodes data into a square module matrix with a quiet-zone margin", () => {
    const qr = buildQrCode(URL);

    // Smallest QR (version 1) is 21×21; anything real is at least that.
    expect(qr.count).toBeGreaterThanOrEqual(21);
    // Default margin is 4 modules on every side.
    expect(qr.size).toBe(qr.count + 8);
    expect(qr.path.length).toBeGreaterThan(0);
  });

  it("is deterministic for identical input", () => {
    expect(buildQrCode(URL)).toEqual(buildQrCode(URL));
  });

  it("offsets the first dark finder module by the margin", () => {
    // The top-left finder pattern makes module (0,0) dark, so with the default
    // margin of 4 the path must begin at grid coordinate (4,4).
    expect(buildQrCode(URL).path.startsWith("M4 4h1v1h-1z")).toBe(true);
    // A custom margin shifts that origin accordingly.
    expect(buildQrCode(URL, { margin: 2 }).path.startsWith("M2 2h1v1h-1z")).toBe(
      true,
    );
  });

  it("honours a custom quiet-zone margin in the viewBox size", () => {
    const qr = buildQrCode(URL, { margin: 1 });
    expect(qr.size).toBe(qr.count + 2);
  });

  it("produces different paths for different payloads", () => {
    const a = buildQrCode(URL);
    const b = buildQrCode("https://heirloom.example/recipes/something-else");
    expect(a.path).not.toBe(b.path);
  });

  it("returns an empty code for empty input", () => {
    const qr = buildQrCode("");
    expect(qr.count).toBe(0);
    expect(qr.path).toBe("");
  });

  it("draws every dark module as a unit square", () => {
    const qr = buildQrCode(URL);
    const squares = qr.path.match(/h1v1h-1z/g) ?? [];
    // One closed unit square per dark module; there is always more than one.
    expect(squares.length).toBeGreaterThan(1);
  });
});
