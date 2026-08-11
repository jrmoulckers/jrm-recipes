/**
 * Pins the deliberate-override markers on GitHub community health files.
 *
 * Why this exists (#790)
 * ----------------------
 * The backbone rule for health files is: a member repo's own copy overrides the one
 * inherited from `jrmoulckers/.github` and freezes it, so "if you find one in a member
 * repo, delete it; that is the whole fix." The single exception is a deliberate override.
 *
 * That makes the *exception test* the only thing between a correct rule and a destructive
 * outcome, because every step after it is pre-authorized. In #790 the exception test was a
 * `Select-String -SimpleMatch` over English prose, given a regex alternation. PowerShell
 * accepted the regex as a literal string, found it nowhere, and reported 0 repo-specific
 * mentions for a file with 43 of them. The chain "no repo-specific content -> verbatim copy
 * -> delete it" then ran with no further judgement required.
 *
 * So the marker is exact-match testable rather than inferred from content, and the default
 * on a missing marker is FAIL, never "delete by default": a guard whose action is
 * destructive must fail closed toward inaction.
 *
 * Both shapes of health override (#827)
 * -------------------------------------
 * GitHub honours six health kinds, and two of them -- `ISSUE_TEMPLATE/` and
 * `DISCUSSION_TEMPLATE/` -- are directories. The first version of this guard enumerated only
 * filenames and gated on `statSync().isFile()`, so it was blind to both: an unmarked
 * `.github/ISSUE_TEMPLATE/bug.yml` added to the tree left all three tests green.
 *
 * That is #790's own defect one shape over. There the exception test could not see the
 * content it was testing; here it could not see an entire kind of subject. Either way the
 * destructive action stays pre-authorized while the thing standing in front of it reports
 * "nothing here" -- and it would have gone wrong at the moment someone added the first
 * issue template, which is the moment the protection was supposed to begin.
 *
 * A directory cannot carry the marker, having no first twenty lines to put it in. So the two
 * shapes are declared the same way and verified differently:
 *   - file-shaped:      must carry the marker, in itself, naming itself.
 *   - directory-shaped: declaring it in `EXPECTED_OVERRIDES` is the deliberate act, because
 *                       that list is hand-written here and adding to it means editing this
 *                       test. Stated rather than implied, since it is a weaker check.
 * Both shapes are enumerated, so an *undeclared* override of either shape fails immediately.
 *
 * Non-vacuity
 * -----------
 * The per-file loop below is a sweep, and a sweep over an empty set passes while asserting
 * nothing -- the failure mode that recurred three times in this repo's guard work (#746,
 * #751, #754). Three independent defenses:
 *   1. `SECURITY.md` is asserted present by name, a concrete value no empty set satisfies.
 *   2. The number of files actually checked is asserted, so a collapsed enumeration fails.
 *   3. The marker literal is hand-written here and the file list is derived from the tree,
 *      so the two ends of the check are anchored to independent sources.
 *
 * That count is hand-written rather than read off `EXPECTED_OVERRIDES.length`. Once the two
 * shapes diverge, the marker loop no longer visits every expected entry, so deriving its
 * bound from the same list it is checking would compare a number to itself -- the tautology
 * measured in #809, where `expect(checked).toBe(arr.length)` passed with `arr` emptied.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();

/** Directories GitHub resolves community health files from, in its own precedence order. */
const SEARCH_DIRS = ['', '.github', 'docs'];

/** Health files GitHub will prefer over the org-wide copy when present in this repo. */
const HEALTH_FILENAMES = [
  'SECURITY.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SUPPORT.md',
  'GOVERNANCE.md',
  'PULL_REQUEST_TEMPLATE.md',
];

/** The same rule's directory-shaped kinds, which no filename enumeration can reach (#827). */
const HEALTH_DIRNAMES = ['ISSUE_TEMPLATE', 'DISCUSSION_TEMPLATE'];

/**
 * Hand-written, not derived from the file. Deriving the pattern from the thing it is
 * meant to pin is the tautology this repo shipped in #754 and reviewed in #757.
 */
const MARKER_OPEN = '<!-- studio:health-override file=';

/** A marker buried below the fold is not a marker anyone reads before acting. */
const MARKER_MAX_LINE = 20;

/** Files this repo deliberately overrides. Adding one here is a deliberate act. */
const EXPECTED_OVERRIDES = ['SECURITY.md'];

/**
 * How many of those are file-shaped, and so must carry a marker. Hand-written: deriving it
 * from `EXPECTED_OVERRIDES.length` would be the #809 tautology once the shapes diverge.
 */
const EXPECTED_MARKED_FILES = 1;

function findHealthOverrides() {
  const found = [];
  for (const dir of SEARCH_DIRS) {
    for (const name of HEALTH_FILENAMES) {
      const rel = dir ? `${dir}/${name}` : name;
      const abs = join(REPO_ROOT, dir, name);
      if (existsSync(abs) && statSync(abs).isFile()) {
        found.push({ rel, name, abs, kind: 'file' });
      }
    }
    for (const name of HEALTH_DIRNAMES) {
      const rel = dir ? `${dir}/${name}` : name;
      const abs = join(REPO_ROOT, dir, name);
      if (existsSync(abs) && statSync(abs).isDirectory()) {
        found.push({ rel, name, abs, kind: 'directory' });
      }
    }
  }
  return found;
}

describe('community health file overrides', () => {
  const found = findHealthOverrides();

  it('finds the health overrides this repo is known to declare, of either shape', () => {
    // Concrete expected value: cannot be satisfied by an empty or broken enumeration, and
    // an undeclared override of either shape lands here rather than passing unseen (#827).
    expect(
      found.map((f) => f.rel).sort(),
      'An undeclared health override is NOT authority to delete it -- stop and ask. ' +
        'If it is deliberate, declare it in EXPECTED_OVERRIDES; see #790, #827.',
    ).toEqual([...EXPECTED_OVERRIDES].sort());
  });

  it('marks every present file-shaped health override as deliberate', () => {
    let checked = 0;

    for (const file of found.filter((f) => f.kind === 'file')) {
      const source = readFileSync(file.abs, 'utf8');
      const lines = source.split(/\r?\n/);
      const head = lines.slice(0, MARKER_MAX_LINE);
      const markerLine = head.findIndex((line) => line.includes(MARKER_OPEN));

      expect(
        markerLine,
        `${file.rel} has no '${MARKER_OPEN}' marker in its first ${MARKER_MAX_LINE} lines. ` +
          'This is NOT authority to delete it -- an unmarked health file means stop and ask. ' +
          'If the override is deliberate, add the marker; see #790.',
      ).toBeGreaterThanOrEqual(0);

      // The marker must name the file it sits in, so it cannot be pasted in blindly.
      expect(
        head[markerLine],
        `${file.rel}'s override marker does not name ${file.name}`,
      ).toContain(`${MARKER_OPEN}${file.name}`);

      checked += 1;
    }

    // Guards the loop itself: a sweep that ran zero times must not pass. Hand-written per
    // #809 -- `EXPECTED_OVERRIDES.length` would compare the count to its own source.
    expect(checked).toBe(EXPECTED_MARKED_FILES);
    expect(checked).toBeGreaterThan(0);
  });

  it('enumerates every health kind the backbone rule names, so it cannot go blind', () => {
    // Measured (#827, arm F): emptying HEALTH_DIRNAMES restores the original blindness with
    // all other tests still green. The enumeration is hand-written data that nothing else
    // asserts, so the guard had a silent-defeat path -- the vacuity shape one level up from
    // the loop it protects.
    //
    // Duplicate-and-compare inside one file, deliberately: it catches an accidental or
    // drive-by emptying, not a determined edit of both sides. Stated because a check whose
    // limits are not written down gets read as stronger than it is.
    expect([...HEALTH_FILENAMES].sort()).toEqual([
      'CODE_OF_CONDUCT.md',
      'CONTRIBUTING.md',
      'GOVERNANCE.md',
      'PULL_REQUEST_TEMPLATE.md',
      'SECURITY.md',
      'SUPPORT.md',
    ]);
    expect([...HEALTH_DIRNAMES].sort()).toEqual(['DISCUSSION_TEMPLATE', 'ISSUE_TEMPLATE']);
    expect(SEARCH_DIRS).toEqual(['', '.github', 'docs']);
  });

  it("keeps SECURITY.md's override substantive, not a marked-up verbatim copy", () => {
    const source = readFileSync(join(REPO_ROOT, 'SECURITY.md'), 'utf8');

    // `Heirloom` is the measurement that reproduced across two independent sessions in
    // #790 (13 matching lines) when the alternation-based one did not. It is the reason
    // the override is deliberate, so it is what the marker is anchored to.
    const heirloomLines = source.split(/\r?\n/).filter((line) => line.includes('Heirloom'));

    expect(heirloomLines.length).toBeGreaterThanOrEqual(10);

    // The override's own declaration of what it is, in the policy text rather than a comment.
    expect(source).toContain('This policy extends the JRM Studio org-wide security policy');
  });
});
