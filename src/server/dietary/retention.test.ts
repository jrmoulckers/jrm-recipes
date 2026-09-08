import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, state } = vi.hoisted(() => {
  const state = {
    results: [[{ id: 'assessment-1' }], [{ id: 'correction-1' }, { id: 'correction-2' }]],
    calls: [] as string[],
  };
  const tableName = (value: unknown) =>
    (value as Record<symbol, string>)?.[Symbol.for('drizzle:Name')] ?? 'unknown';
  const db = {
    delete: vi.fn((table: unknown) => {
      const name = tableName(table);
      const chain = {
        where: vi.fn(() => chain),
        returning: vi.fn(async () => {
          state.calls.push(name);
          return state.results.shift() ?? [];
        }),
      };
      return chain;
    }),
    transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(db)),
  };
  return { db, state };
});

vi.mock('~/server/db', () => ({ db }));

import { DIETARY_HISTORY_RETENTION_DAYS, purgeExpiredDietaryHistory } from './retention';

beforeEach(() => {
  vi.clearAllMocks();
  state.results = [[{ id: 'assessment-1' }], [{ id: 'correction-1' }, { id: 'correction-2' }]];
  state.calls = [];
});

describe('purgeExpiredDietaryHistory', () => {
  it('deletes invalidated assessments before revoked corrections', async () => {
    const result = await purgeExpiredDietaryHistory(new Date('2026-09-08T00:00:00.000Z'));

    expect(DIETARY_HISTORY_RETENTION_DAYS).toBe(30);
    expect(state.calls).toEqual(['dietary_assessments', 'dietary_ingredient_corrections']);
    expect(result).toEqual({ assessmentsDeleted: 1, correctionsDeleted: 2 });
  });
});
