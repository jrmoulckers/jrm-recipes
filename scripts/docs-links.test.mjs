import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Guards relative links in this repo's own Markdown against silent rot.
 *
 * A link whose target no longer exists passes every gate we run: lint,
 * format:check, typecheck, tests and build all read the link as ordinary prose.
 * The failure only surfaces for a reader, which is the one audience that cannot
 * file a build failure. Renaming a record is the usual trigger — the rename is
 * the visible change, and the inbound references are the invisible one.
 *
 * That is not hypothetical across the studio: a sibling repo renamed eleven ADRs
 * with a fully green pipeline and left 48 stale targets behind it.
 *
 * Scope is deliberately this repo's own docs. Files under `.github/` are
 * generated from the `jrmoulckers/.github` backbone and a local edit to them is
 * drift that the next sync discards, so a break there is neither ours to cause
 * nor ours to repair — asserting over it would produce a red gate with no legal
 * fix.
 *
 * Anchors are not resolved. Only the file half of a target is checked, so
 * `./x.md#missing-heading` passes; verifying headings needs a Markdown parse and
 * would trade a cheap, certain check for an expensive, fuzzy one.
 */

// Two destination forms are legal in Markdown: an angle-wrapped destination,
// which may itself contain parentheses, and a bare one, which may not. Next.js
// route groups put literal parens in paths (`src/app/(main)/...`), so the
// angle-wrapped form is load-bearing here rather than exotic — matching only the
// bare form truncates those targets at the first paren and reports a file that
// does exist as missing.
const LINK = /\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

function trackedMarkdown() {
  return execFileSync('git', ['ls-files', '-z', '*.md'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((file) => !file.startsWith('.github/'));
}

describe('markdown link targets', () => {
  it('resolve on disk relative to the file that references them', async () => {
    const files = trackedMarkdown();

    // Anti-vacuity: if the glob, the filter or `git ls-files` ever stops
    // returning anything, this suite would assert over nothing and pass.
    expect(files.length).toBeGreaterThan(0);

    const broken = [];
    let checked = 0;

    for (const file of files) {
      const text = await readFile(file, 'utf8');

      for (const match of text.matchAll(LINK)) {
        const destination = match[1] ?? match[2];
        if (!destination || EXTERNAL.test(destination)) continue;

        const [target] = destination.split('#');
        if (!target) continue;

        checked += 1;
        if (!existsSync(resolve(dirname(file), target))) {
          broken.push(`${file} -> ${destination}`);
        }
      }
    }

    // Anti-vacuity again, one level down: the files could all be found and the
    // link pattern still match nothing, for instance after a bad edit here.
    expect(checked).toBeGreaterThan(0);
    expect(broken).toEqual([]);
  });
});
