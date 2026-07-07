import { describe, expect, it } from "vitest";

import manifest from "./manifest";

describe("manifest", () => {
  const m = manifest();

  it("exposes high-intent shortcuts to static routes", () => {
    expect(Array.isArray(m.shortcuts)).toBe(true);
    const shortcuts = m.shortcuts ?? [];
    expect(shortcuts.length).toBeGreaterThanOrEqual(3);

    const urls = shortcuts.map((s) => s.url);
    expect(urls).toContain("/recipes/new");
    expect(urls).toContain("/shopping");

    for (const shortcut of shortcuts) {
      expect(shortcut.name).toBeTruthy();
      expect(shortcut.url.startsWith("/")).toBe(true);
    }
  });

  it("does not lock orientation to portrait", () => {
    expect(m.orientation).not.toBe("portrait");
  });

  it("declares a well-formed GET share_target", () => {
    expect(m.share_target).toBeDefined();
    expect(m.share_target?.action).toBe("/import");
    expect(String(m.share_target?.method).toUpperCase()).toBe("GET");
    expect(m.share_target?.params).toEqual({
      title: "title",
      text: "text",
      url: "url",
    });
  });
});
