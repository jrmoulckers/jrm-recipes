import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, localeDirection } from "~/config/i18n";
import en from "~/messages/en.json";
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

  it("sets lang and dir for the default locale", () => {
    expect(m.lang).toBe(DEFAULT_LOCALE);
    expect(m.dir).toBe(localeDirection(DEFAULT_LOCALE));
  });

  it("sources description and shortcut labels from the catalog", () => {
    expect(m.description).toBe(en.metadata.description);

    const byUrl = Object.fromEntries(
      (m.shortcuts ?? []).map((s) => [s.url, s]),
    );
    expect(byUrl["/recipes/new"]?.name).toBe(
      en.metadata.shortcuts.newRecipe.name,
    );
    expect(byUrl["/plan"]?.name).toBe(en.metadata.shortcuts.plan.name);
    expect(byUrl["/shopping"]?.name).toBe(en.metadata.shortcuts.shopping.name);
  });

  it("does not lock orientation to portrait", () => {
    expect(m.orientation).not.toBe("portrait");
  });

  it("declares an app-like windowing profile", () => {
    // Ordered fallback chain that degrades from standalone, never to a raw tab.
    expect(m.display).toBe("standalone");
    expect(m.display_override).toEqual(["standalone", "minimal-ui"]);
    // Re-launches focus the existing window instead of duplicating it.
    expect(m.launch_handler?.client_mode).toBe("navigate-existing");
  });

  it("advertises wide + narrow screenshots for the rich install dialog", () => {
    const screenshots = m.screenshots ?? [];
    expect(screenshots.some((s) => s.form_factor === "wide")).toBe(true);
    expect(screenshots.some((s) => s.form_factor === "narrow")).toBe(true);
    for (const shot of screenshots) {
      expect(shot.src.startsWith("/screenshots/")).toBe(true);
      expect(shot.type).toBe("image/png");
      expect(shot.sizes).toMatch(/^\d+x\d+$/);
      expect(shot.label).toBeTruthy();
    }
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
