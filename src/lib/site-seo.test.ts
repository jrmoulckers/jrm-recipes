import { describe, expect, it } from "vitest";

import { buildOrganizationJsonLd, buildWebSiteJsonLd } from "./site-seo";
import { serializeJsonLd } from "./recipe-seo";

describe("buildWebSiteJsonLd", () => {
  it("declares a WebSite with a SearchAction on the recipe search", () => {
    const jsonLd = buildWebSiteJsonLd();

    expect(jsonLd["@type"]).toBe("WebSite");
    expect(jsonLd.name).toBe("Heirloom");
    expect(String(jsonLd.url)).toMatch(/^https?:\/\//);

    const action = jsonLd.potentialAction as Record<string, unknown>;
    expect(action["@type"]).toBe("SearchAction");
    expect(action["query-input"]).toBe("required name=search_term_string");

    const target = action.target as Record<string, unknown>;
    expect(target["@type"]).toBe("EntryPoint");
    // Targets the real search param (q) with the required placeholder.
    expect(String(target.urlTemplate)).toContain("/recipes?q={search_term_string}");
    expect(String(target.urlTemplate)).toMatch(/^https?:\/\//);
  });
});

describe("buildOrganizationJsonLd", () => {
  it("declares an Organization with absolute url and logo", () => {
    const jsonLd = buildOrganizationJsonLd();

    expect(jsonLd["@type"]).toBe("Organization");
    expect(jsonLd.name).toBe("Heirloom");
    expect(String(jsonLd.url)).toMatch(/^https?:\/\//);
    expect(String(jsonLd.logo)).toMatch(/^https?:\/\/.+\/icons\/icon-512\.png$/);
  });

  it("serializes without a script breakout", () => {
    const out = serializeJsonLd([
      buildWebSiteJsonLd(),
      buildOrganizationJsonLd(),
    ]);
    expect(out).not.toContain("</script>");
    expect(() => JSON.parse(out.replace(/\\u003c/g, "<"))).not.toThrow();
  });
});
