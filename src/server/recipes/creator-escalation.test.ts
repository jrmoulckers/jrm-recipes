import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const mutations = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "mutations.ts"),
  "utf8",
);

/**
 * Guard on the one thing #668 deliberately did **not** ship: co-creators can
 * read a recipe, but they still cannot write to it.
 *
 * This is not caution for its own sake. Today every recipe has exactly one
 * author, so "delete the recipes where `author_id = U`" provably erases all of
 * U's free text — which is what #678's right-to-erasure work relies on. The
 * moment a creator can edit a recipe they do not own, their prose lands in
 * somebody else's `recipes.story`/`notes` *and* in every `recipe_versions`
 * snapshot, where no column-level scrub can find it. Widening writes therefore
 * has to happen together with contribution provenance, not before it.
 *
 * The check is deliberately source-level: the property is "no write path
 * consults `recipeCreators`", and the only way to assert absence across every
 * mutation is to look at the module rather than at one call. It is meant to
 * fail loudly during the change that widens writes, as a prompt to revisit
 * #678, not to make that change hard.
 */
describe("co-creator write escalation", () => {
  it("only reads recipeCreators for slug occupancy, never as a write gate", () => {
    // The one legitimate reference is the namespace-occupancy probe inside
    // `slugTaken` (#679): a creator's slug occupies their namespace, so
    // allocation must see it. Anywhere else in this module would mean a
    // creator had been let into a write path.
    const slugTaken = mutations.indexOf("async function slugTaken");
    const nextFn = mutations.indexOf("\nexport async function ", slugTaken);
    const importsEnd = mutations.indexOf('from "~/server/db/schema"');
    const occurrences = [...mutations.matchAll(/recipeCreators/g)]
      .map((match) => match.index)
      .filter((at) => at > importsEnd);
    expect(occurrences.length).toBeGreaterThan(0);
    for (const at of occurrences) {
      expect(at).toBeGreaterThan(slugTaken);
      expect(at).toBeLessThan(nextFn);
    }
  });

  it.each([
    ["updateRecipe", "content edits"],
    ["revertRecipe", "version reverts"],
    ["deleteRecipe", "deletion"],
    ["restoreRecipe", "restore"],
    ["setShareLinkState", "share-token rotation"],
  ])("still scopes %s (%s) to the author", (fn) => {
    const start = mutations.indexOf(`export async function ${fn}`);
    expect(start).toBeGreaterThan(-1);
    const next = mutations.indexOf("\nexport async function ", start + 1);
    const body = mutations.slice(start, next === -1 ? undefined : next);
    expect(body).toContain("eq(recipes.authorId,");
  });
});
