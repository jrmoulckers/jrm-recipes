import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

/**
 * Guards the `@jrmoulckers/*` version ranges against the caret trap.
 *
 * On a `0.x` package a caret pins the *minor*, not the major: `^0.10.0` is
 * `>=0.10.0 <0.11.0`, so it can never reach `0.11.0`. Every fix upstream ships
 * as a minor while these packages are pre-1.0, which means a caret silently
 * freezes this repo on whatever minor it was written against and reports
 * nothing — install succeeds, lint passes, and the tree just stops receiving
 * fixes.
 *
 * This is not hypothetical here. PR #897 set `>=0.10.0 <1.0.0` and shipped
 * `^0.10.0`, because `pnpm update <pkg>` rewrites the manifest specifier to a
 * caret after it resolves. So the commit that raised the floor is the commit
 * that reintroduced the trap, and the usual remedy — widen the range, then run
 * an explicit update — silently undoes its own first step.
 *
 * Checking the resolved version in `node_modules` does not catch it: after that
 * update the resolution was correct and only the manifest was wrong. The range
 * has to be read as text, which is what this does.
 */
describe('@jrmoulckers dependency ranges', () => {
  it('uses comparator ranges so a 0.x minor is reachable', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8'));
    const specifiers = Object.entries({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }).filter(([name]) => name.startsWith('@jrmoulckers/'));

    // Anti-vacuity: a rename or removal upstream must fail loudly rather than
    // leaving this suite asserting over an empty list and reporting success.
    expect(specifiers.length).toBeGreaterThan(0);

    for (const [name, range] of specifiers) {
      expect(`${name}: ${range}`).toMatch(/: >=\d+\.\d+\.\d+ <\d+\.\d+\.\d+$/);
    }
  });
});
