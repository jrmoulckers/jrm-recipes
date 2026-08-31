import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rows, select } = vi.hoisted(() => ({
  rows: { value: [] as unknown[] },
  select: vi.fn(),
}));

vi.mock('~/server/db', () => ({
  db: { select },
  isDbConfigured: () => true,
}));

import { getNutritionTargetsOn } from './targets';

describe('getNutritionTargetsOn date batching', () => {
  beforeEach(() => {
    select.mockReset().mockImplementation(() => ({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve(rows.value),
        }),
      }),
    }));
  });

  it('resolves historical and newer dates from one query without rewriting the past', async () => {
    rows.value = [
      {
        id: 'new',
        profileId: 'member-1',
        effectiveFrom: '2026-02-01',
        targets: { calories: 1500 },
      },
      {
        id: 'old',
        profileId: 'member-1',
        effectiveFrom: '2026-01-01',
        targets: { calories: 2000 },
      },
    ];

    const result = await getNutritionTargetsOn(
      ['member-1', 'member-without-target'],
      ['2026-01-15', '2026-02-15'],
      { userId: 'owner-1' },
    );

    expect(result.get('member-1')?.get('2026-01-15')).toMatchObject({
      id: 'old',
      targets: { calories: 2000 },
    });
    expect(result.get('member-1')?.get('2026-02-15')).toMatchObject({
      id: 'new',
      targets: { calories: 1500 },
    });
    expect(result.get('member-without-target')?.get('2026-01-15')).toBeNull();
    expect(result.get('member-without-target')?.get('2026-02-15')).toBeNull();
    expect(select).toHaveBeenCalledTimes(1);
  });
});
