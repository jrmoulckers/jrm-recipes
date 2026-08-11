import { describe, expect, it } from 'vitest';

import { formatPlanWarnings } from './plan-safety-copy';
import { type PlanSafetyWarning } from './dietary-match';

describe('formatPlanWarnings', () => {
  it('returns null when there are no warnings', () => {
    expect(formatPlanWarnings([], 'en-US')).toBeNull();
  });

  it("summarizes a single member's allergen conflict", () => {
    const warnings: PlanSafetyWarning[] = [
      { memberId: 'm1', memberName: 'Mom', allergens: ['dairy'], diets: [] },
    ];
    const msg = formatPlanWarnings(warnings, 'en-US');
    expect(msg).toContain('dairy');
    expect(msg).toContain('unsafe for Mom');
  });

  it("includes diet conflicts phrased as 'not <diet>'", () => {
    const warnings: PlanSafetyWarning[] = [
      { memberId: 'm1', memberName: 'Kid', allergens: [], diets: ['vegan'] },
    ];
    const msg = formatPlanWarnings(warnings, 'en-US');
    expect(msg).toContain('not vegan');
    expect(msg).toContain('unsafe for Kid');
  });

  it('aggregates duplicate member warnings across recipes (union, no dupes)', () => {
    const warnings: PlanSafetyWarning[] = [
      { memberId: 'm1', memberName: 'Mom', allergens: ['dairy'], diets: [] },
      { memberId: 'm1', memberName: 'Mom', allergens: ['wheat'], diets: [] },
    ];
    const msg = formatPlanWarnings(warnings, 'en-US') ?? '';
    // Both allergens surface once, under a single "Mom" clause.
    expect(msg).toContain('dairy');
    expect(msg).toContain('wheat');
    expect(msg.match(/unsafe for Mom/g)).toHaveLength(1);
  });
});
