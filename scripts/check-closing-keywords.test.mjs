import { describe, expect, it } from 'vitest';

import { findViolations } from './check-closing-keywords.mjs';

// The two incidents this guard exists for, verbatim. Both closed a live issue
// that the same text said should stay open.
const PEER_INCIDENT = 'Closes #855 is NOT claimed -- #855 stays open.';
const OWN_GOAL = 'wrote the correct Refs line immediately below it, and closed #855 anyway at';

describe('check-closing-keywords', () => {
  it('catches the negated form that closed #855', () => {
    const found = findViolations(PEER_INCIDENT);
    expect(found).toHaveLength(1);
    expect(found[0].text).toContain('NOT claimed');
  });

  it('catches the past tense, which reads as narration and is not', () => {
    // The conjugation that beat a reader who had just written the rule down.
    // "closed #N" states history; GitHub cannot tell it from an instruction.
    expect(findViolations(OWN_GOAL)).toHaveLength(1);
  });

  it('catches every conjugation GitHub honours', () => {
    for (const keyword of [
      'close',
      'closes',
      'closed',
      'fix',
      'fixes',
      'fixed',
      'resolve',
      'resolves',
      'resolved',
    ]) {
      expect(
        findViolations(`this ${keyword} #12 thing`),
        `${keyword} went undetected`,
      ).toHaveLength(1);
    }
  });

  it('does not skip fenced blocks, because GitHub does not either', () => {
    // A guard that skipped fences would pass the text that closes the issue.
    const body = ['Quoting the incident:', '', '```text', PEER_INCIDENT, '```'].join('\n');
    expect(findViolations(body)).toHaveLength(1);
  });

  it('catches a blockquoted mention', () => {
    expect(findViolations(`> ${PEER_INCIDENT}`)).toHaveLength(1);
  });

  it('catches the full issue URL form', () => {
    expect(
      findViolations(
        'and fixed https://github.com/jrmoulckers/jrm-recipes/issues/855 along the way',
      ),
    ).toHaveLength(1);
  });

  it('allows a declaration standing on its own line', () => {
    expect(findViolations('## Issues\n\nCloses #892\n')).toEqual([]);
    expect(findViolations('Closes #892, #893')).toEqual([]);
    expect(findViolations('Fixes #1.')).toEqual([]);
  });

  it('allows a keyword-free prose mention', () => {
    // The escape hatch the failure message recommends must actually pass.
    expect(findViolations('#855 stays open for the human decision.')).toEqual([]);
    expect(findViolations('Refs #855, #806, #805')).toEqual([]);
    expect(findViolations('Quoting the pattern as Closes #NNN is safe.')).toEqual([]);
  });

  it('does not fire on the words used without a target', () => {
    expect(findViolations('This closes the loop on the earlier finding.')).toEqual([]);
    expect(findViolations('A fix landed in #892.')).toEqual([]);
  });

  it('reports each offending line once, with its number', () => {
    const body = ['fine line', OWN_GOAL, 'also fine', PEER_INCIDENT].join('\n');
    const found = findViolations(body, 'pull request body');
    expect(found.map((v) => v.line)).toEqual([2, 4]);
    expect(found.every((v) => v.source === 'pull request body')).toBe(true);
  });

  it('returns nothing for empty input', () => {
    expect(findViolations('')).toEqual([]);
    expect(findViolations(undefined)).toEqual([]);
  });

  it('excerpts a long line around the match instead of dumping it', () => {
    // A PR body can arrive as one very long line; a report that buries the
    // phrase in a paragraph is a report nobody acts on.
    const long = `${'padding '.repeat(40)}${OWN_GOAL}${' trailing'.repeat(40)}`;
    const [found] = findViolations(long);

    expect(found.text.length).toBeLessThan(200);
    expect(found.text).toContain('closed #855');
    expect(found.text.startsWith('...')).toBe(true);
    expect(found.text.endsWith('...')).toBe(true);
  });

  it('leaves a short line intact', () => {
    const [found] = findViolations(PEER_INCIDENT);
    expect(found.text).toBe(PEER_INCIDENT);
  });
});
