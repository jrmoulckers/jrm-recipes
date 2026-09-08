import { beforeEach, describe, expect, it, vi } from 'vitest';

type ProfileRow = {
  id: string;
  userId: string;
  groupId: string | null;
  nutritionTargets: Array<{ id: string; targets: { calories: number } }>;
  customRestrictions: Array<{ id: string; terms: Array<{ id: string; term: string }> }>;
};

const { state, profilesFindMany, assessmentsFindMany, correctionsFindMany, isDbConfigured, db } =
  vi.hoisted(() => {
    const state = { configured: true };
    const profilesFindMany = vi.fn<(input: unknown) => Promise<ProfileRow[]>>();
    const assessmentsFindMany = vi.fn<(input: unknown) => Promise<Array<{ id: string }>>>();
    const correctionsFindMany = vi.fn<(input: unknown) => Promise<Array<{ id: string }>>>();
    return {
      state,
      profilesFindMany,
      assessmentsFindMany,
      correctionsFindMany,
      isDbConfigured: vi.fn(() => state.configured),
      db: {
        query: {
          memberDietaryProfiles: { findMany: profilesFindMany },
          dietaryAssessments: { findMany: assessmentsFindMany },
          dietaryIngredientCorrections: { findMany: correctionsFindMany },
        },
      },
    };
  });

vi.mock('~/server/db', () => ({ db, isDbConfigured }));

import { getDietaryDataForExport } from './dietary-export';

beforeEach(() => {
  vi.clearAllMocks();
  state.configured = true;
  profilesFindMany.mockResolvedValue([]);
  assessmentsFindMany.mockResolvedValue([]);
  correctionsFindMany.mockResolvedValue([]);
});

describe('getDietaryDataForExport', () => {
  it('returns no dietary data when the database is unavailable', async () => {
    state.configured = false;

    await expect(getDietaryDataForExport('user-1')).resolves.toEqual({
      profiles: [],
      assessments: [],
      corrections: [],
    });
    expect(profilesFindMany).not.toHaveBeenCalled();
  });

  it('includes requester-owned nutrition-target history with profile data', async () => {
    profilesFindMany.mockResolvedValue([
      {
        id: 'profile-owned',
        userId: 'user-1',
        groupId: 'shared-group',
        nutritionTargets: [{ id: 'target-1', targets: { calories: 2200 } }],
        customRestrictions: [{ id: 'restriction-1', terms: [{ id: 'term-1', term: 'example' }] }],
      },
    ]);
    assessmentsFindMany.mockResolvedValue([{ id: 'assessment-1' }]);
    correctionsFindMany.mockResolvedValue([{ id: 'correction-1' }]);

    const result = await getDietaryDataForExport('user-1');

    expect(profilesFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        with: {
          nutritionTargets: true,
          customRestrictions: { with: { terms: true } },
        },
      }),
    );
    expect(result.profiles[0]?.nutritionTargets).toEqual([
      { id: 'target-1', targets: { calories: 2200 } },
    ]);
    expect(result.assessments).toEqual([{ id: 'assessment-1' }]);
    expect(result.corrections).toEqual([{ id: 'correction-1' }]);
  });
});
