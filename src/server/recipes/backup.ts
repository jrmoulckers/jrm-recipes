import {
  recipeDownloadFilename,
  serializeRecipeMarkdown,
} from "~/components/print/export";
import type { PrintRecipe } from "~/components/print/types";
import { createZip, type ZipEntry } from "~/lib/zip";

export type CookbookArchive = {
  filename: string;
  bytes: Uint8Array;
  /** Number of recipe documents written (excludes README/manifest). */
  recipeCount: number;
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * A stable, collision-free archive path for a recipe's Markdown file. Slugs are
 * unique per recipe, but a defensive de-dup keeps the archive valid even if two
 * rows ever share one (or an empty slug falls back to a titled name).
 */
function uniqueMarkdownName(recipe: PrintRecipe, taken: Set<string>): string {
  const base = recipeDownloadFilename(recipe, "md").replace(/\.md$/, "");
  let candidate = `${base}.md`;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base}-${n}.md`;
    n += 1;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

function readme(recipes: PrintRecipe[], date: Date): string {
  return [
    "# Your Heirloom cookbook",
    "",
    `Exported ${isoDate(date)} — ${recipes.length} ${
      recipes.length === 1 ? "recipe" : "recipes"
    }.`,
    "",
    "This is your complete family cookbook, yours to keep. It needs no",
    "account, app, or internet to read:",
    "",
    "- `recipes/` — one Markdown file per recipe (open in any text editor).",
    "- `recipes.json` — the same recipes as structured data, so a future tool",
    "  (or a future Heirloom) can read everything back in without loss.",
    "",
    "Stories, who a recipe was handed down from, and where it came from are all",
    "included so nothing about your family's history is left behind.",
    "",
  ].join("\n");
}

/**
 * Build a complete, self-contained backup of a family's recipes (issue #420).
 *
 * Every recipe becomes a human-readable Markdown file plus a lossless entry in
 * `recipes.json`, wrapped in a plain ZIP (see {@link createZip}) that any OS can
 * open. Pure and deterministic given `recipes` + `now`, so it is unit-testable
 * and safe to run on the server with no third-party service involved — the whole
 * point of letting a long-time user take their data home.
 */
export function buildCookbookArchive(
  recipes: PrintRecipe[],
  now: Date = new Date(),
): CookbookArchive {
  const taken = new Set<string>();
  const entries: ZipEntry[] = [
    { name: "README.md", data: readme(recipes, now) },
  ];

  for (const recipe of recipes) {
    entries.push({
      name: `recipes/${uniqueMarkdownName(recipe, taken)}`,
      data: serializeRecipeMarkdown(recipe),
    });
  }

  entries.push({
    name: "recipes.json",
    data: `${JSON.stringify(
      { exportedAt: now.toISOString(), version: 1, recipes },
      null,
      2,
    )}\n`,
  });

  return {
    filename: `heirloom-cookbook-${isoDate(now)}.zip`,
    bytes: createZip(entries),
    recipeCount: recipes.length,
  };
}
