import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { recipeCreators } from '~/server/db/schema/recipes';

/**
 * The revocation fan-out must name the namespace it is revoking (#668, #698).
 *
 * When an owner removes a co-creator, or a co-creator leaves, the row is gone
 * before the cache is busted — so the revoked path can no longer be discovered
 * from the database and has to be passed to `revalidateRecipePaths` explicitly.
 * That is the cache half of revocation: without it the ex-creator's page can
 * keep being served from the Next cache after access was withdrawn.
 *
 * Why a source-level check, and why here:
 *
 * `revalidate.test.ts` already covers the *function* ("busts an already-removed
 * creator's path when passed explicitly"). Nothing covered the *call site*, and
 * `creators-actions.ts` had no test of any kind. The two-identity e2e journey
 * cannot cover it either — measured, not assumed: dropping the argument leaves
 * all seven of its tests green, because every route is dynamic today (#193 —
 * `cookies()` in the root layout), so no cached entry exists to go stale. The
 * gap therefore closes the moment #193 makes these routes cacheable, which is
 * exactly when the bug would start leaking pages. A guard that only works after
 * the regression becomes exploitable is not a guard.
 *
 * So this asserts the wiring the way the repo already asserts absences it
 * cannot execute (see `creator-escalation.test.ts`).
 */

const SOURCE_PATH = 'src/server/recipes/creators-actions.ts';
const source = readFileSync(SOURCE_PATH, 'utf8');

/**
 * Comment-stripped source.
 *
 * The doc comment above the fan-out mentions the removed namespace by name, so
 * a check reading raw text would be satisfied by the prose explaining the rule
 * rather than by the code obeying it.
 */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('revocation fan-out wiring', () => {
  it("passes the removed creator's namespace to the path revalidation", () => {
    // Not a bare `removal.removed`: the point is that it reaches the
    // revalidation call, not merely that the field is read somewhere.
    const call = /revalidateRecipePaths\(([\s\S]{0,200}?)\)\s*;/.exec(code)?.[1];

    expect(call, `no revalidateRecipePaths call found in ${SOURCE_PATH}`).toBeDefined();
    expect(call).toContain('removal.removed');
  });

  it('fans out on both revocation paths, not just one', () => {
    // Removal (owner-initiated) and leave (creator-initiated) revoke exactly the
    // same access, so a fan-out on only one of them revokes only half the time.
    expect(code).toContain('removeRecipeCreator');
    expect(code).toContain('leaveRecipeAsCreator');
    expect(code.match(/fanOut\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('reads a real module, so the checks above cannot pass vacuously', () => {
    // Every assertion here is over a string read from disk: an empty or renamed
    // file would make `toContain` fail, but a *silently truncated* read would
    // too, and this states the premise rather than leaving it implied.
    expect(source.length).toBeGreaterThan(500);
    expect(code).toContain('fanOut');

    // And the table the whole mechanism exists for is really the one imported
    // here, so a rename upstream surfaces as a failure rather than as a check
    // quietly guarding a module nobody calls any more.
    expect(recipeCreators).toBeDefined();
  });
});
