import { expect, test } from '@playwright/test';

import { unresolvedSeededRecipe } from './recipe-paths';

/**
 * The decision #870 got wrong, asserted directly.
 *
 * These need no browser and no database: they pin the rule that a skip is only
 * ever justified by an absent database. Everything else must fail, because a
 * test that stops running is not a test that passed, and a skip naming a cause
 * nobody checked reads as housekeeping while hiding the condition the spec
 * exists to catch.
 *
 * Deliberately asserting the *skip flag*, not just the message. Asserting only
 * the text would pass against a helper that always skipped, which is precisely
 * the pre-fix behaviour.
 */
test.describe('unresolvedSeededRecipe', () => {
  test('skips only when no database is configured', () => {
    const outcome = unresolvedSeededRecipe(false, 'GET /sitemap.xml answered 500');

    expect(outcome.skip).toBe(true);
    expect(outcome.message).toContain('not_configured');
  });

  test('fails when a database exists, rather than blaming an absent one', () => {
    const outcome = unresolvedSeededRecipe(true, 'GET /sitemap.xml answered 500');

    expect(outcome.skip).toBe(false);
    expect(outcome.message).toContain('real failure');
    // The old message asserted this cause without checking it (#849, #870).
    expect(outcome.message).not.toContain('No database configured');
  });

  test('carries the observed diagnosis into both outcomes', () => {
    const diagnosis = 'GET /sitemap.xml listed 7 URL(s), none ending in "/nonnas-sunday-gravy"';

    for (const configured of [true, false]) {
      expect(unresolvedSeededRecipe(configured, diagnosis).message).toContain(diagnosis);
    }
  });

  test('never reports both outcomes for the same input', () => {
    // Guards the shape itself: exactly one of the two branches must apply, so a
    // future edit cannot make "skip" and "fail" simultaneously true.
    const outcomes = [true, false].map((configured) => unresolvedSeededRecipe(configured, 'probe'));

    expect(outcomes.map((outcome) => outcome.skip)).toEqual([false, true]);
  });
});
