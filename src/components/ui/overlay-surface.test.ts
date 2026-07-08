import { describe, expect, it } from "vitest";

import { OVERLAY_PADDING, OVERLAY_SURFACE } from "./overlay-surface";

describe("overlay-surface convention (issue #104)", () => {
  it("shares one radius, border, fill, and elevation across surfaces", () => {
    expect(OVERLAY_SURFACE).toContain("rounded-xl");
    expect(OVERLAY_SURFACE).toContain("border");
    expect(OVERLAY_SURFACE).toContain("border-border");
    expect(OVERLAY_SURFACE).toContain("bg-popover");
    expect(OVERLAY_SURFACE).toContain("text-popover-foreground");
    expect(OVERLAY_SURFACE).toContain("shadow-token-lg");
  });

  it("exposes a documented padding scale by density", () => {
    expect(OVERLAY_PADDING.menu).toBe("p-1.5");
    expect(OVERLAY_PADDING.popover).toBe("p-4");
    expect(OVERLAY_PADDING.dialog).toBe("p-6");
  });

  it("uses semantic tokens only (no hard-coded colors)", () => {
    expect(OVERLAY_SURFACE).not.toMatch(/#[0-9a-f]{3,6}/i);
    expect(OVERLAY_SURFACE).not.toMatch(/\b(?:white|black|gray-\d)\b/);
  });
});
