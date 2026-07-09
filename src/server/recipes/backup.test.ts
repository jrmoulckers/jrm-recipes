import { describe, expect, it } from "vitest";

import type { PrintRecipe } from "~/components/print/types";

import { buildCookbookArchive } from "./backup";

function recipe(overrides: Partial<PrintRecipe> = {}): PrintRecipe {
  return {
    id: "r1",
    slug: "banana-bread",
    title: "Banana Bread",
    description: "Grandma's loaf.",
    coverImageUrl: null,
    visibility: "private",
    servings: 8,
    servingsNoun: "slices",
    prepMinutes: 10,
    cookMinutes: 55,
    totalMinutes: 65,
    difficulty: null,
    cuisine: null,
    sourceName: null,
    sourceUrl: null,
    notes: null,
    story: null,
    handedDownFrom: null,
    originYear: null,
    originPlace: null,
    author: { name: "Nonna" },
    ingredients: [],
    steps: [],
    tags: [],
    ...overrides,
  };
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("buildCookbookArchive", () => {
  const date = new Date("2024-03-09T12:00:00Z");

  it("names the archive with the export date and counts recipes", () => {
    const archive = buildCookbookArchive([recipe()], date);
    expect(archive.filename).toBe("heirloom-cookbook-2024-03-09.zip");
    expect(archive.recipeCount).toBe(1);
    expect(archive.bytes.length).toBeGreaterThan(22);
  });

  it("includes a README, a per-recipe Markdown file, and a JSON manifest", () => {
    const text = decode(buildCookbookArchive([recipe()], date).bytes);
    expect(text).toContain("README.md");
    expect(text).toContain("recipes/banana-bread.md");
    expect(text).toContain("recipes.json");
    // Markdown body is stored verbatim.
    expect(text).toContain("# Banana Bread");
  });

  it("carries story and provenance into the exported Markdown (#377/#381)", () => {
    const text = decode(
      buildCookbookArchive(
        [
          recipe({
            story: "Baked every Sunday since the war.",
            handedDownFrom: "Great-Aunt Rosa",
            originPlace: "Naples",
            originYear: "1946",
          }),
        ],
        date,
      ).bytes,
    );
    expect(text).toContain("## Story");
    expect(text).toContain("Handed down from Great-Aunt Rosa");
    expect(text).toContain("Origin: Naples, 1946");
    expect(text).toContain("Baked every Sunday since the war.");
  });

  it("de-duplicates archive paths when slugs collide", () => {
    const text = decode(
      buildCookbookArchive(
        [
          recipe({ id: "a", slug: "loaf", title: "Loaf" }),
          recipe({ id: "b", slug: "loaf", title: "Loaf" }),
        ],
        date,
      ).bytes,
    );
    expect(text).toContain("recipes/loaf.md");
    expect(text).toContain("recipes/loaf-2.md");
  });

  it("produces a valid (openable) archive for a user with no recipes", () => {
    const archive = buildCookbookArchive([], date);
    expect(archive.recipeCount).toBe(0);
    const text = decode(archive.bytes);
    expect(text).toContain("README.md");
    expect(text).toContain("recipes.json");
  });
});
