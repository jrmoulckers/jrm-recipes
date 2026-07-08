import { describe, expect, it } from "vitest";

import { shareMessageWithUrl, shareText } from "~/lib/share-text";

describe("shareText", () => {
  it("names the cook when an author is known", () => {
    expect(shareText({ title: "Apple Pie", author: "Grandma" })).toBe(
      "Apple Pie, from Grandma's kitchen. Made with Heirloom.",
    );
  });

  it("falls back gracefully when the author is missing", () => {
    expect(shareText({ title: "Apple Pie" })).toBe(
      "Apple Pie — a family recipe on Heirloom.",
    );
    expect(shareText({ title: "Apple Pie", author: "   " })).toBe(
      "Apple Pie — a family recipe on Heirloom.",
    );
  });

  it("appends the url for the clipboard fallback", () => {
    expect(
      shareMessageWithUrl(
        { title: "Apple Pie" },
        "https://heirloom.app/recipes/apple-pie",
      ),
    ).toBe(
      "Apple Pie — a family recipe on Heirloom. https://heirloom.app/recipes/apple-pie",
    );
  });

  it("stays free of hashtags and promo fluff", () => {
    const text = shareText({ title: "Apple Pie", author: "Grandma" });
    expect(text).not.toContain("#");
    expect(text.toLowerCase()).not.toContain("download");
  });
});
