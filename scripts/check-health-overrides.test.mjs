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
 * Non-vacuity
 * -----------
 * The per-file loop below is a sweep, and a sweep over an empty set passes while asserting
 * nothing -- the failure mode that recurred three times in this repo's guard work (#746,
 * #751, #754). Three independent defenses:
 *   1. `SECURITY.md` is asserted present by name, a concrete value no empty set satisfies.
 *   2. The number of files actually checked is asserted, so a collapsed enumeration fails.
 *   3. The marker literal is hand-written here and the file list is derived from the tree,
 *      so the two ends of the check are anchored to independent sources.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

/** Directories GitHub resolves community health files from, in its own precedence order. */
const SEARCH_DIRS = ["", ".github", "docs"];

/** Health files GitHub will prefer over the org-wide copy when present in this repo. */
const HEALTH_FILENAMES = [
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SUPPORT.md",
  "GOVERNANCE.md",
  "PULL_REQUEST_TEMPLATE.md",
];

/**
 * Hand-written, not derived from the file. Deriving the pattern from the thing it is
 * meant to pin is the tautology this repo shipped in #754 and reviewed in #757.
 */
const MARKER_OPEN = "<!-- studio:health-override file=";

/** A marker buried below the fold is not a marker anyone reads before acting. */
const MARKER_MAX_LINE = 20;

/** Files this repo deliberately overrides. Adding one here is a deliberate act. */
const EXPECTED_OVERRIDES = ["SECURITY.md"];

function findHealthFiles() {
  const found = [];
  for (const dir of SEARCH_DIRS) {
    for (const name of HEALTH_FILENAMES) {
      const rel = dir ? `${dir}/${name}` : name;
      const abs = join(REPO_ROOT, dir, name);
      if (existsSync(abs) && statSync(abs).isFile()) {
        found.push({ rel, name, abs });
      }
    }
  }
  return found;
}

describe("community health file overrides", () => {
  const found = findHealthFiles();

  it("finds the health files this repo is known to override", () => {
    // Concrete expected value: cannot be satisfied by an empty or broken enumeration.
    expect(found.map((f) => f.rel).sort()).toEqual([...EXPECTED_OVERRIDES].sort());
  });

  it("marks every present health file as a deliberate override", () => {
    let checked = 0;

    for (const file of found) {
      const source = readFileSync(file.abs, "utf8");
      const lines = source.split(/\r?\n/);
      const head = lines.slice(0, MARKER_MAX_LINE);
      const markerLine = head.findIndex((line) => line.includes(MARKER_OPEN));

      expect(
        markerLine,
        `${file.rel} has no '${MARKER_OPEN}' marker in its first ${MARKER_MAX_LINE} lines. ` +
          "This is NOT authority to delete it -- an unmarked health file means stop and ask. " +
          "If the override is deliberate, add the marker; see #790.",
      ).toBeGreaterThanOrEqual(0);

      // The marker must name the file it sits in, so it cannot be pasted in blindly.
      expect(
        head[markerLine],
        `${file.rel}'s override marker does not name ${file.name}`,
      ).toContain(`${MARKER_OPEN}${file.name}`);

      checked += 1;
    }

    // Guards the loop itself: a sweep that ran zero times must not pass.
    expect(checked).toBe(EXPECTED_OVERRIDES.length);
    expect(checked).toBeGreaterThan(0);
  });

  it("keeps SECURITY.md's override substantive, not a marked-up verbatim copy", () => {
    const source = readFileSync(join(REPO_ROOT, "SECURITY.md"), "utf8");

    // `Heirloom` is the measurement that reproduced across two independent sessions in
    // #790 (13 matching lines) when the alternation-based one did not. It is the reason
    // the override is deliberate, so it is what the marker is anchored to.
    const heirloomLines = source
      .split(/\r?\n/)
      .filter((line) => line.includes("Heirloom"));

    expect(heirloomLines.length).toBeGreaterThanOrEqual(10);

    // The override's own declaration of what it is, in the policy text rather than a comment.
    expect(source).toContain(
      "This policy extends the JRM Studio org-wide security policy",
    );
  });
});
