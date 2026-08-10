import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const mutations = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "mutations.ts"),
  "utf8",
);

/**
 * Guard on how far co-creator authority is allowed to reach inside this module.
 *
 * This test was originally written to assert that co-creators could read a
 * recipe but never write to it. #685 deliberately widened that: an accepted
 * co-creator may now edit the recipe body. The guard is narrowed to the
 * properties that survived rather than deleted, because the reason it existed
 * has not gone away, it has changed shape.
 *
 * What it was protecting: while every recipe had exactly one author, "delete the
 * recipes where `author_id = U`" provably erased all of U's free text, which is
 * what the erasure path in `~/server/users/erasure.ts` relies on. Now that a
 * co-creator can edit a recipe they do not own, U's prose can live in somebody
 * else's `recipes.story`/`notes` and in `recipe_versions` snapshots authored by
 * other people, where an author-scoped delete cannot reach it. That gap is real
 * and is tracked on #678. It is a known outstanding item, not something this
 * file can assert away.
 *
 * What this file still asserts, and what a later change must not quietly break:
 *
 * 1. There is exactly **one** creator-based write gate. Every reference to
 *    `recipeCreators` in this module lives either in the namespace-occupancy
 *    probe or in `assertRecipeEditAccess`. A new write path that grows its own
 *    inline creator lookup is what makes authority impossible to audit, and it
 *    fails here.
 * 2. Widening stopped at the recipe body. Deletion, restore, share-link
 *    rotation and version reverts are still owner-only, expressed as an
 *    `authorId` predicate in SQL. Those are the operations where a co-creator
 *    acting alone would be destructive or would push the recipe outward.
 *
 * The check is deliberately source-level: the property is "no *other* write path
 * consults `recipeCreators`", and the only way to assert an absence across every
 * mutation is to read the module rather than one call.
 *
 * #720: spans are contiguous, so a top-level declaration this model does not
 * recognise is absorbed into the preceding span and inherits its sanction. An
 * arrow-declared write path next to `assertRecipeEditAccess` therefore read as
 * being *inside* it, and its private creator lookup passed. The fix is not to
 * enumerate more function shapes — that repeats the same under-reach one shape
 * later — but to detect the absorption itself, below.
 */

/** Top-level function spans in `mutations.ts`, keyed by name. */
const spans = (() => {
  const declaration = /\n(?:export )?(?:async )?function (\w+)/g;
  const found: { name: string; at: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(mutations)) !== null) {
    found.push({ name: match[1]!, at: match.index });
  }
  return new Map(
    found.map(({ name, at }, index) => [
      name,
      { start: at, end: found[index + 1]?.at ?? mutations.length },
    ]),
  );
})();

function spanOf(name: string) {
  const span = spans.get(name);
  expect(span, `expected mutations.ts to declare ${name}`).toBeDefined();
  return span!;
}

function bodyOf(name: string): string {
  const span = spanOf(name);
  return mutations.slice(span.start, span.end);
}

/**
 * The owner-only SQL predicate, named once because two checks disagree about it
 * on purpose: the owner-only mutations must contain it, and `updateRecipe` must
 * not (#724).
 *
 * Sharing the literal is what keeps the negative check honest. A negative
 * assertion over source text passes whenever the string is absent, and a
 * misspelled string is always absent — so on its own it can be rotted by a typo
 * into a check that never fires and is never noticed. Written once, the four
 * owner-only assertions below require this exact text to appear, so a typo is
 * loud there and the negative check inherits their anchor rather than needing a
 * probe of its own.
 */
const OWNER_PREDICATE = "eq(recipes.authorId,";

describe("co-creator write escalation", () => {
  /**
   * The span model is faithful: no span has absorbed a declaration (#720).
   *
   * Every check in this file sanctions or inspects code *by span*, and spans run
   * from one recognised declaration to the next, so they tile the module to EOF.
   * A declaration the `declaration` regex does not match is not a boundary — it
   * is swallowed by the span above it. Next to a sanctioned function that grants
   * a rogue write path the sanction; next to an owner-only one it lets a
   * neighbour's `authorId` predicate satisfy an assertion about a body that no
   * longer has one.
   *
   * This asserts the cause rather than either symptom, and does it without
   * enumerating function shapes — extending the regex to arrows would just move
   * the hole to `class`, `let` or `export default`. Inside a real function body
   * every line is indented, so a binding keyword in column zero means the span
   * covers something the model never saw.
   *
   * It is also self-testing: if the declaration regex rots, spans collapse into
   * each other, swallow many column-zero bindings and this fires. A guard that
   * cannot silently stop working is worth more than one that needs a second
   * guard to watch it.
   */
  it("has no span that swallowed an unrecognised declaration", () => {
    const binding =
      /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class)\b/;

    // Both model checks iterate `spans`, so an empty map passes them by doing
    // nothing — and an empty map is exactly what a dead model produces. The
    // rest of the file fails loudly in that case because it routes through
    // `spanOf`, which means these two are non-vacuous only by neighbour, on a
    // dependency nothing marks or preserves (#746).
    expect(spans.size).toBeGreaterThan(0);

    for (const [name, span] of spans) {
      const [, ...rest] = mutations.slice(span.start + 1, span.end).split("\n");
      const absorbed = rest.filter((line) => binding.test(line));

      expect(
        absorbed,
        `the span for ${name} contains a top-level declaration, so the span model did not recognise it and ${name}'s span has swallowed it. Anything asserted about ${name} — including any sanction — now silently covers that code too. Teach \`declaration\` to recognise the form rather than widening the sanction.`,
      ).toEqual([]);
    }
  });

  /**
   * The span model is faithful in the other direction too: no span was cut
   * short (#742).
   *
   * The check above detects the model recognising too *few* boundaries. This
   * one detects too many. `declaration` matches on a newline, so a column-zero
   * `function name` inside a template literal or string is also a boundary, and
   * it splits the enclosing function's span in two. Every check here reads
   * `bodyOf`, which is the head of that split, so everything past the split
   * point escapes inspection while remaining live code.
   *
   * That is the exact mirror of absorption: one makes a span cover code it
   * should not, the other stops it covering code it should. Both make `bodyOf`
   * wrong, and the column-zero check cannot see this one — after a split every
   * line of the tail is indented, so it presents no binding to detect.
   *
   * Demonstrated on #742: an owner predicate placed after a spurious boundary
   * inside `updateRecipe` left all eight checks green, including the assertion
   * that `updateRecipe` does not contain that predicate; moving the same line
   * before the boundary failed it.
   *
   * Asserted as the consequence — a function span ends where a function ends —
   * rather than by enumerating the causes (templates, strings, comments), for
   * the same reason the check above prefers column-zero bindings to matching
   * arrow syntax.
   */
  it("has no span that was cut short by a spurious boundary", () => {
    // Non-vacuity, as above (#746): a dead model yields no spans, and a loop
    // over no spans asserts nothing.
    expect(spans.size).toBeGreaterThan(0);

    for (const [name, span] of spans) {
      const lines = mutations.slice(span.start, span.end).split("\n");

      // Trailing blank lines and the next declaration's comment block belong to
      // this span but sit after the closing brace.
      let last = lines.length - 1;
      while (last >= 0) {
        const text = lines[last]!.trim();
        if (
          text === "" ||
          text.startsWith("//") ||
          text.startsWith("/*") ||
          text.startsWith("*")
        ) {
          last--;
          continue;
        }
        break;
      }

      expect(
        last >= 0 ? lines[last]! : "",
        `the span for ${name} does not end at a closing brace in column zero, so \`declaration\` matched something that is not a top-level declaration — most likely a column-zero binding inside a template literal or string — and split ${name} in two. Everything after that point is still live code but is invisible to every check in this file, including the negative ones. Narrow \`declaration\` rather than adjusting this assertion.`,
      ).toMatch(/^\}/);
    }
  });

  it("confines every recipeCreators reference to the two sanctioned gates", () => {
    // `slugTaken` (#679) must see a creator's slug because it occupies that
    // creator's namespace, and `assertRecipeEditAccess` (#685) is the single
    // place a co-creator is admitted to a write path. Anywhere else means some
    // mutation grew a private notion of who counts as a creator.
    const sanctioned = ["slugTaken", "assertRecipeEditAccess"].map(spanOf);
    const importsEnd = mutations.indexOf('from "~/server/db/schema"');
    const occurrences = [...mutations.matchAll(/recipeCreators/g)]
      .map((match) => match.index)
      .filter((at) => at > importsEnd);

    expect(occurrences.length).toBeGreaterThan(0);
    for (const at of occurrences) {
      expect(
        sanctioned.some((span) => at >= span.start && at < span.end),
        `recipeCreators referenced outside slugTaken and assertRecipeEditAccess at index ${at}`,
      ).toBe(true);
    }
  });

  it("admits co-creators to the recipe body through the shared gate only", () => {
    const body = bodyOf("updateRecipe");
    expect(body).toContain("assertRecipeEditAccess(");
    // The gate is a lookup rather than a filter, so `updateRecipe` no longer
    // carries an `authorId` predicate. Dropping the gate must not silently
    // leave the row unguarded, so assert the two together.
    expect(body).not.toContain(OWNER_PREDICATE);
  });

  it("requires an accepted creator row, never a pending invitation", () => {
    const body = bodyOf("assertRecipeEditAccess");
    expect(body).toContain('eq(recipeCreators.status, "accepted")');
    // An unauthorised editor is indistinguishable from a missing recipe, so the
    // failure cannot be used to probe which recipe ids exist.
    expect(body).toContain('DomainError("NOT_FOUND")');
  });

  it.each([
    ["revertRecipe", "version reverts"],
    ["deleteRecipe", "deletion"],
    ["restoreRecipe", "restore"],
    ["setShareLinkState", "share-link rotation"],
  ])("still scopes %s (%s) to the owner", (fn) => {
    expect(bodyOf(fn)).toContain(OWNER_PREDICATE);
  });
});
