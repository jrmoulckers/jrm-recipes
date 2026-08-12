import { describe, expect, it } from 'vitest';

import { closingTargets, evaluateHumanAction, findViolations } from './check-closing-keywords.mjs';

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

  it('catches a colon between the keyword and the target, which GitHub honours', () => {
    // `\s+` alone read these as prose. GitHub closes on `Closes: #9`, so the
    // shape the guard exists to catch was passing it (#923).
    expect(findViolations('it closes: #855 anyway')).toHaveLength(1);
    expect(findViolations('narrative that fixed:  #855 here')).toHaveLength(1);
    expect(findViolations('and resolved:#855 in passing')).toHaveLength(1);
  });

  it('still allows a colon declaration on its own line', () => {
    expect(findViolations('Closes: #123')).toHaveLength(0);
  });

  it('allows a closing reference in a list item, which is a declaration too', () => {
    expect(findViolations('- Closes #123')).toHaveLength(0);
    expect(findViolations('* Closes #123')).toHaveLength(0);
    expect(findViolations('1. Closes #123')).toHaveLength(0);
  });

  it('still catches prose inside a list item', () => {
    expect(findViolations('- Closes #123 because it fixes the thing')).toHaveLength(1);
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

// #859 asked a human to decide whether the AGENTS.md author gate is reworded
// upstream. PR #860 closed it with `Closes #859`, and the request went with it.
const NEEDS_HUMAN = [
  '## Summary',
  '',
  'Documents the trap locally.',
  '',
  '## Needs Human Action',
  '',
  'A human should decide whether it is reworded upstream.',
].join('\n');

const open = (over = {}) => ({
  number: 859,
  state: 'open',
  title: 'Every agent session is the same GitHub user',
  body: NEEDS_HUMAN,
  isPullRequest: false,
  ...over,
});

describe('closingTargets', () => {
  it('collects the issues a body would close', () => {
    expect(closingTargets('Closes #859\n\nFixes #12')).toEqual([12, 859]);
  });

  it('ignores a reference that does not close', () => {
    expect(closingTargets('Refs #859, #821')).toEqual([]);
  });

  it('takes prose mentions too, because GitHub acts on them', () => {
    expect(closingTargets('and closed #855 anyway')).toEqual([855]);
  });

  it('takes the colon form, so the human-action check still sees the target', () => {
    // This is the sharper half of #923: with `\s+` the colon form produced no
    // targets at all, so `Closes: #859` closed a "Needs Human Action" issue
    // without the second check ever evaluating it.
    expect(closingTargets('Closes: #859')).toEqual([859]);
    expect(closingTargets('it closes: #855 anyway')).toEqual([855]);
  });

  it('deduplicates', () => {
    expect(closingTargets('Closes #855\nResolves #855')).toEqual([855]);
  });

  it('leaves cross-repository URL closes alone', () => {
    // The number belongs to another repository; looking it up here would read
    // an unrelated issue and could block on it.
    expect(closingTargets('Closes https://github.com/jrmoulckers/.github/issues/308')).toEqual([]);
  });
});

describe('evaluateHumanAction', () => {
  it('blocks an open issue that still asks for a human', () => {
    const { blocked, checked } = evaluateHumanAction([open()]);
    expect(blocked.map((b) => b.number)).toEqual([859]);
    expect(checked).toBe(1);
  });

  it('allows an open issue with no such section', () => {
    const { blocked, checked } = evaluateHumanAction([open({ body: '## Summary\n\nJust work.' })]);
    expect(blocked).toEqual([]);
    expect(checked).toBe(1);
  });

  it('ignores an already closed issue, which discards nothing new', () => {
    const { blocked, checked } = evaluateHumanAction([open({ state: 'closed' })]);
    expect(blocked).toEqual([]);
    expect(checked).toBe(0);
  });

  it('ignores a pull request', () => {
    const { blocked } = evaluateHumanAction([open({ isPullRequest: true })]);
    expect(blocked).toEqual([]);
  });

  it('skips an unreadable entry rather than failing on it', () => {
    // A guard against a silent failure must not become a source of spurious red
    // (#796). Unknown is not clean, so it is reported as skipped.
    const { blocked, skipped, checked } = evaluateHumanAction([{ number: 7, error: 'gh: 404' }]);
    expect(blocked).toEqual([]);
    expect(skipped.map((s) => s.number)).toEqual([7]);
    expect(checked).toBe(0);
  });

  it('matches the heading at any level and ignores case', () => {
    expect(evaluateHumanAction([open({ body: '### needs human action' })]).blocked).toHaveLength(1);
  });

  it('does not match a heading that only mentions the phrase', () => {
    const body = '## Needs Human Action was removed\n\nAll done.';
    expect(evaluateHumanAction([open({ body })]).blocked).toEqual([]);
  });

  it('reports every blocked issue, not just the first', () => {
    const { blocked } = evaluateHumanAction([open(), open({ number: 855 })]);
    expect(blocked.map((b) => b.number)).toEqual([859, 855]);
  });
});
