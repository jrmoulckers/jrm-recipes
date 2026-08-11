import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

/**
 * Asserts the toolchain actually *uses* the vendored configs.
 *
 * Hash verification deliberately does not live here. It moved upstream into
 * `node scripts/vendor-configs.mjs --check` (engineering v0.15.3+), which
 * re-hashes every locked file and refuses to pass on an empty lock — the two
 * assertions this file used to own. Keeping a second copy would mean two
 * definitions of "unchanged" that can disagree, and the local one would be the
 * stale one, so CI runs the upstream check instead.
 *
 * What upstream cannot know is whether this repo still points at the vendored
 * tree. Those are independent failures: every hash can match perfectly while
 * `tsconfig.json` has been rewired back to the removed package, leaving the
 * vendored files pristine, verified, and entirely unused. A drift check reports
 * that as healthy, because from its side it is.
 */
describe('vendored engineering configs', () => {
  it('references the vendored config rather than the removed packages', async () => {
    const [tsconfig, prettier] = await Promise.all([
      readFile('tsconfig.json', 'utf8'),
      readFile('prettier.config.js', 'utf8'),
    ]);

    expect(tsconfig).toContain('./config/engineering/tsconfig/next.json');
    expect(prettier).toContain('./config/engineering/prettier/index.js');
    // The packages are no longer installed, so a stale specifier would only
    // surface as a resolution failure at gate time.
    expect(tsconfig).not.toContain('@jrmoulckers/tsconfig');
    expect(prettier).not.toContain('@jrmoulckers/prettier-config');
  });
});
