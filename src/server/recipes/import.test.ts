import { afterEach, describe, expect, it, vi } from "vitest";

import {
  importRecipeFromUrl,
  isPublicHost,
  parseDurationToMinutes,
  parseIngredientLine,
  parseIsoDuration,
  parseRecipeFromHtml,
  parseYield,
} from "./import";

describe("parseIsoDuration", () => {
  it("parses hours and minutes", () => {
    expect(parseIsoDuration("PT1H30M")).toBe(90);
    expect(parseIsoDuration("PT45M")).toBe(45);
    expect(parseIsoDuration("PT2H")).toBe(120);
  });
  it("counts days and weeks", () => {
    expect(parseIsoDuration("P1DT2H")).toBe(24 * 60 + 120);
  });
  it("rejects nonsense", () => {
    expect(parseIsoDuration("banana")).toBeUndefined();
    expect(parseIsoDuration("PT0M")).toBeUndefined();
  });
});

describe("parseDurationToMinutes", () => {
  it("handles ISO, text, arrays and numbers", () => {
    expect(parseDurationToMinutes("PT20M")).toBe(20);
    expect(parseDurationToMinutes("1 hour 15 minutes")).toBe(75);
    expect(parseDurationToMinutes("30 mins")).toBe(30);
    expect(parseDurationToMinutes(["", "PT10M"])).toBe(10);
    expect(parseDurationToMinutes(25)).toBe(25);
    expect(parseDurationToMinutes("")).toBeUndefined();
  });
});

describe("parseYield", () => {
  it("splits count and noun", () => {
    expect(parseYield("4 servings")).toEqual({ servings: "4", noun: "servings" });
    expect(parseYield("Serves 6")).toEqual({ servings: "6", noun: "" });
    expect(parseYield(["8 cookies"])).toEqual({ servings: "8", noun: "cookies" });
    expect(parseYield(12)).toEqual({ servings: "12", noun: "" });
  });
});

describe("parseIngredientLine", () => {
  it("extracts quantity, unit and item", () => {
    expect(parseIngredientLine("2 cups all-purpose flour")).toMatchObject({
      quantity: "2",
      unit: "cup",
      item: "all-purpose flour",
      optional: false,
    });
  });
  it("handles fractions and mixed numbers", () => {
    expect(parseIngredientLine("1/2 tsp salt")).toMatchObject({
      quantity: "0.5",
      unit: "tsp",
      item: "salt",
    });
    expect(parseIngredientLine("1 1/2 tablespoons olive oil")).toMatchObject({
      quantity: "1.5",
      unit: "tbsp",
      item: "olive oil",
    });
  });
  it("handles unicode vulgar fractions", () => {
    expect(parseIngredientLine("½ cup sugar")).toMatchObject({
      quantity: "0.5",
      unit: "cup",
      item: "sugar",
    });
  });
  it("captures parenthetical notes and optional flag", () => {
    const r = parseIngredientLine("3 large eggs (room temperature), optional");
    expect(r.quantity).toBe("3");
    expect(r.item).toBe("large eggs");
    expect(r.note).toBe("room temperature");
    expect(r.optional).toBe(true);
  });
  it("keeps unit-less lines intact", () => {
    expect(parseIngredientLine("Salt and pepper to taste")).toMatchObject({
      quantity: "",
      unit: "",
      item: "Salt and pepper to taste",
    });
  });
  it("captures quantity ranges as min/max", () => {
    expect(parseIngredientLine("2 to 3 cups flour")).toMatchObject({
      quantity: "2",
      quantityMax: "3",
      unit: "cup",
      item: "flour",
    });
    expect(parseIngredientLine("1-2 tsp salt")).toMatchObject({
      quantity: "1",
      quantityMax: "2",
      unit: "tsp",
      item: "salt",
    });
    expect(parseIngredientLine("1/2 to 3/4 cup sugar")).toMatchObject({
      quantity: "0.5",
      quantityMax: "0.75",
      unit: "cup",
      item: "sugar",
    });
  });
  it("leaves quantityMax empty for single quantities", () => {
    expect(parseIngredientLine("2 cups flour").quantityMax).toBe("");
  });
});

const SAMPLE_HTML = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebPage", "name": "ignore me" },
    {
      "@type": ["Recipe"],
      "name": "Grandma&#39;s Marinara",
      "description": "A slow-simmered <b>Sunday</b> sauce.",
      "image": ["https://cdn.example.com/marinara.jpg"],
      "author": { "@type": "Person", "name": "Nonna" },
      "recipeYield": "6 servings",
      "prepTime": "PT15M",
      "cookTime": "PT1H30M",
      "recipeCuisine": "Italian",
      "keywords": "sauce, italian, sauce",
      "recipeIngredient": [
        "2 cups crushed tomatoes",
        "1/4 cup olive oil",
        "3 cloves garlic (minced)"
      ],
      "recipeInstructions": [
        { "@type": "HowToStep", "text": "Warm the oil.", "image": "https://cdn.example.com/s1.jpg", "video": { "@type": "VideoObject", "contentUrl": "https://cdn.example.com/v1.mp4" } },
        { "@type": "HowToSection", "name": "Simmer", "itemListElement": [
          { "@type": "HowToStep", "text": "Add tomatoes." },
          { "@type": "HowToStep", "text": "Simmer 90 minutes." }
        ]}
      ]
    }
  ]
}
</script></head><body></body></html>
`;

describe("parseRecipeFromHtml", () => {
  const recipe = parseRecipeFromHtml(SAMPLE_HTML, "https://example.com/marinara");

  it("finds the Recipe node inside @graph", () => {
    expect(recipe).not.toBeNull();
  });
  it("maps scalar fields and decodes entities/HTML", () => {
    expect(recipe?.title).toBe("Grandma's Marinara");
    expect(recipe?.description).toBe("A slow-simmered Sunday sauce.");
    expect(recipe?.coverImageUrl).toBe("https://cdn.example.com/marinara.jpg");
    expect(recipe?.sourceName).toBe("Nonna");
    expect(recipe?.servings).toBe("6");
    expect(recipe?.prepMinutes).toBe("15");
    expect(recipe?.cookMinutes).toBe("90");
    expect(recipe?.cuisine).toBe("Italian");
  });
  it("dedupes keywords into tags", () => {
    expect(recipe?.tags).toBe("sauce, italian");
  });
  it("parses ingredients with quantities and notes", () => {
    expect(recipe?.ingredients).toHaveLength(3);
    expect(recipe?.ingredients[1]).toMatchObject({
      quantity: "0.25",
      unit: "cup",
      item: "olive oil",
    });
    expect(recipe?.ingredients[2]).toMatchObject({
      unit: "cloves",
      item: "garlic",
      note: "minced",
    });
  });
  it("flattens HowToSection steps and keeps step images", () => {
    expect(recipe?.steps).toHaveLength(3);
    expect(recipe?.steps[0]).toMatchObject({
      instruction: "Warm the oil.",
      imageUrl: "https://cdn.example.com/s1.jpg",
    });
    expect(recipe?.steps[2]?.instruction).toBe("Simmer 90 minutes.");
  });
  it("preserves HowToSection names and per-step video URLs", () => {
    expect(recipe?.steps[0]?.section).toBe("");
    expect(recipe?.steps[0]?.videoUrl).toBe("https://cdn.example.com/v1.mp4");
    expect(recipe?.steps[1]?.section).toBe("Simmer");
    expect(recipe?.steps[2]?.section).toBe("Simmer");
  });
  it("returns null when there is no recipe", () => {
    expect(parseRecipeFromHtml("<html></html>", "https://x.com")).toBeNull();
  });
});

describe("isPublicHost", () => {
  it("rejects private IPv6 forms and bracketed IPv6 hosts", () => {
    expect(isPublicHost("::")).toBe(false);
    expect(isPublicHost("::1")).toBe(false);
    expect(isPublicHost("0:0:0:0:0:0:0:1")).toBe(false);
    expect(isPublicHost("[::1]")).toBe(false);
  });

  it("rejects IPv4-mapped IPv6 when the mapped IPv4 is not public", () => {
    expect(isPublicHost("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicHost("::ffff:10.0.0.1")).toBe(false);
    expect(isPublicHost("0:0:0:0:0:ffff:192.168.1.1")).toBe(false);
  });

  it("rejects CGNAT IPv4 addresses", () => {
    expect(isPublicHost("100.64.0.0")).toBe(false);
    expect(isPublicHost("100.127.255.255")).toBe(false);
  });

  it("rejects numeric IPv4 aliases that are not clean dotted quads", () => {
    expect(isPublicHost("2130706433")).toBe(false);
    expect(isPublicHost("0x7f000001")).toBe(false);
    expect(isPublicHost("7f000001")).toBe(false);
    expect(isPublicHost("0177.0.0.1")).toBe(false);
  });

  it("allows normal public hosts", () => {
    expect(isPublicHost("example.com")).toBe(true);
    expect(isPublicHost("93.184.216.34")).toBe(true);
    expect(isPublicHost("100.128.0.1")).toBe(true);
    expect(isPublicHost("::ffff:93.184.216.34")).toBe(true);
    expect(isPublicHost("2606:4700::1111")).toBe(true);
  });

  it("rejects hex-normalized IPv4-mapped IPv6 (as Node emits them)", () => {
    // Node normalizes `[::ffff:127.0.0.1]` to `[::ffff:7f00:1]`.
    expect(isPublicHost("::ffff:7f00:1")).toBe(false);
    expect(isPublicHost("[::ffff:7f00:1]")).toBe(false);
    // ...and a public one still resolves through the hex form.
    expect(isPublicHost("::ffff:5db8:d822")).toBe(true);
  });

  it("rejects trailing-dot (absolute) internal hostnames", () => {
    expect(isPublicHost("localhost.")).toBe(false);
    expect(isPublicHost("sub.localhost.")).toBe(false);
    expect(isPublicHost("printer.local.")).toBe(false);
  });

  it("rejects the whole fe80::/10 link-local range", () => {
    expect(isPublicHost("fe80::1")).toBe(false);
    expect(isPublicHost("fe90::1")).toBe(false);
    expect(isPublicHost("febf::1")).toBe(false);
  });
});

describe("importRecipeFromUrl HTTP errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("suggests a different link for non-retryable 4xx responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));

    await expect(importRecipeFromUrl("https://example.com/missing")).resolves.toEqual({
      ok: false,
      error: "That site returned an error (404). Try a different link.",
    });
  });

  it("suggests trying again shortly for 429 and 5xx responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    await expect(importRecipeFromUrl("https://example.com/rate-limited")).resolves.toEqual({
      ok: false,
      error: "That site returned an error (429). Try again shortly.",
    });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    await expect(importRecipeFromUrl("https://example.com/unavailable")).resolves.toEqual({
      ok: false,
      error: "That site returned an error (503). Try again shortly.",
    });
  });
});

describe("importRecipeFromUrl redirect SSRF guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses to follow a redirect to a private/internal host", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const target = String(input);
      if (target === "https://example.com/recipe")
        return new Response("", {
          status: 302,
          headers: { location: "http://127.0.0.1/latest/meta-data" },
        });
      return new Response("INTERNAL-SECRETS", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(importRecipeFromUrl("https://example.com/recipe")).resolves.toEqual({
      ok: false,
      error: "That address can't be imported.",
    });
    // The internal address must never be requested.
    expect(
      fetchMock.mock.calls.every(([arg]) => !String(arg).includes("127.0.0.1")),
    ).toBe(true);
  });

  it("follows a redirect to another public host", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const target = String(input);
      if (target === "https://example.com/old")
        return new Response("", {
          status: 301,
          headers: { location: "https://recipes.example.org/new" },
        });
      return new Response(SAMPLE_HTML, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await importRecipeFromUrl("https://example.com/old");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recipe.title).toBe("Grandma's Marinara");
  });

  it("stops after too many redirects", async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => {
      n += 1;
      return new Response("", {
        status: 302,
        headers: { location: `https://example.com/hop/${n}` },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(importRecipeFromUrl("https://example.com/loop")).resolves.toEqual({
      ok: false,
      error: "That address can't be imported.",
    });
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6);
  });
});

describe("importRecipeFromUrl DNS-rebinding guard (i194)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a public hostname that resolves to a loopback IP before fetching", async () => {
    const fetchMock = vi.fn(async () => new Response("INTERNAL", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const lookup = vi.fn(async () => [{ address: "127.0.0.1", family: 4 }]);
    await expect(
      importRecipeFromUrl("https://rebind.example/recipe", { lookup }),
    ).resolves.toEqual({ ok: false, error: "That address can't be imported." });
    // No bytes fetched from the internal target.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a hostname that resolves to the cloud metadata IP", async () => {
    const fetchMock = vi.fn(async () => new Response("SECRETS", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const lookup = vi.fn(async () => [
      { address: "169.254.169.254", family: 4 },
    ]);
    await expect(
      importRecipeFromUrl("https://metadata.example/recipe", { lookup }),
    ).resolves.toEqual({ ok: false, error: "That address can't be imported." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects when ANY resolved address is private (mixed A records)", async () => {
    const fetchMock = vi.fn(async () => new Response(SAMPLE_HTML, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const lookup = vi.fn(async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);
    await expect(
      importRecipeFromUrl("https://mixed.example/recipe", { lookup }),
    ).resolves.toEqual({ ok: false, error: "That address can't be imported." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows a hostname that resolves only to public addresses", async () => {
    const fetchMock = vi.fn(async () => new Response(SAMPLE_HTML, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const lookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
    const result = await importRecipeFromUrl(
      "https://recipes.example/marinara",
      { lookup },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recipe.title).toBe("Grandma's Marinara");
    expect(lookup).toHaveBeenCalled();
  });

  it("does not block when the name fails to resolve (no internal target)", async () => {
    const fetchMock = vi.fn(async () => new Response(SAMPLE_HTML, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const lookup = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    });
    const result = await importRecipeFromUrl("https://recipes.example/x", {
      lookup,
    });
    expect(result.ok).toBe(true);
  });
});

describe("importRecipeFromUrl response size limits (i222)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a response whose Content-Length exceeds the cap", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("x", {
          status: 200,
          headers: { "content-length": String(10_000_000) },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await importRecipeFromUrl("https://example.com/huge");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too large/i);
  });

  it("stops reading a streamed body once the byte cap is hit", async () => {
    // A body that would stream far more than the 3 MB cap if fully consumed.
    let pulls = 0;
    const chunk = new TextEncoder().encode("a".repeat(1_000_000));
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 100) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
      },
    });
    const fetchMock = vi.fn(
      async () => new Response(stream, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    // No structured recipe in the garbage body, so it reports "not found" —
    // the point is that it returns promptly without buffering the whole stream.
    const result = await importRecipeFromUrl("https://example.com/stream");
    expect(result.ok).toBe(false);
    // We never pulled anywhere near the full (100 MB) body.
    expect(pulls).toBeLessThanOrEqual(5);
  });
});
