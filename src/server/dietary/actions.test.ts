import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  revalidatePathMock,
  requireUserMock,
  createCustomRestrictionMock,
  updateCustomRestrictionMock,
  deleteCustomRestrictionMock,
  copyCustomRestrictionMock,
  saveCorrectionMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  requireUserMock: vi.fn(),
  createCustomRestrictionMock: vi.fn(),
  updateCustomRestrictionMock: vi.fn(),
  deleteCustomRestrictionMock: vi.fn(),
  copyCustomRestrictionMock: vi.fn(),
  saveCorrectionMock: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
vi.mock('~/server/auth', () => ({ requireUser: requireUserMock }));
vi.mock('~/server/db', () => ({ isDbConfigured: () => true }));
vi.mock('./assessments', () => ({
  saveDietaryIngredientCorrection: saveCorrectionMock,
}));
vi.mock('./mutations', () => ({
  copyCustomDietaryRestriction: copyCustomRestrictionMock,
  createCustomDietaryRestriction: createCustomRestrictionMock,
  createMemberProfile: vi.fn(),
  deleteCustomDietaryRestriction: deleteCustomRestrictionMock,
  deleteMemberProfile: vi.fn(),
  deleteNutritionTarget: vi.fn(),
  setNutritionTarget: vi.fn(),
  updateCustomDietaryRestriction: updateCustomRestrictionMock,
  updateMemberProfile: vi.fn(),
}));

import {
  copyCustomDietaryRestrictionAction,
  createCustomDietaryRestrictionAction,
  deleteCustomDietaryRestrictionAction,
  saveDietaryIngredientCorrectionAction,
  updateCustomDietaryRestrictionAction,
} from './actions';

const restrictionInput = {
  name: '  Nightshades  ',
  severity: 'strict-avoidance' as const,
  subjectScope: 'self' as const,
  terms: [
    { term: ' tomato ', source: 'exact' as const, approved: true },
    { term: 'aubergine', source: 'suggested' as const, approved: false },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: 'owner_1' });
  createCustomRestrictionMock.mockResolvedValue({ id: 'restriction_1' });
  copyCustomRestrictionMock.mockResolvedValue({ id: 'restriction_copy' });
});

describe('custom dietary restriction actions', () => {
  it('validates, authenticates, saves, and revalidates settings plus recipes', async () => {
    await expect(
      createCustomDietaryRestrictionAction('profile_1', restrictionInput),
    ).resolves.toEqual({ ok: true, id: 'restriction_1' });
    expect(createCustomRestrictionMock).toHaveBeenCalledWith(
      'profile_1',
      {
        name: 'Nightshades',
        severity: 'strict-avoidance',
        terms: [
          { term: 'tomato', source: 'exact', approved: true },
          { term: 'aubergine', source: 'suggested', approved: false },
        ],
      },
      { id: 'owner_1' },
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings/dietary');
    expect(revalidatePathMock).toHaveBeenCalledWith('/recipes');
  });

  it('rejects invalid exact terms before auth or mutation', async () => {
    const result = await createCustomDietaryRestrictionAction('profile_1', {
      ...restrictionInput,
      terms: [{ term: 'tomato', source: 'exact', approved: false }],
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'Please fix the highlighted fields.',
    });
    expect(requireUserMock).not.toHaveBeenCalled();
    expect(createCustomRestrictionMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('wires update, delete, and copy through the authenticated owner', async () => {
    await expect(
      updateCustomDietaryRestrictionAction('restriction_1', restrictionInput),
    ).resolves.toEqual({ ok: true, id: 'restriction_1' });
    await expect(deleteCustomDietaryRestrictionAction('restriction_1')).resolves.toEqual({
      ok: true,
      id: 'restriction_1',
    });
    await expect(
      copyCustomDietaryRestrictionAction('restriction_1', 'profile_2', 'self'),
    ).resolves.toEqual({ ok: true, id: 'restriction_copy' });

    expect(updateCustomRestrictionMock).toHaveBeenCalledWith('restriction_1', expect.any(Object), {
      id: 'owner_1',
    });
    expect(deleteCustomRestrictionMock).toHaveBeenCalledWith('restriction_1', {
      id: 'owner_1',
    });
    expect(copyCustomRestrictionMock).toHaveBeenCalledWith('restriction_1', 'profile_2', {
      id: 'owner_1',
    });
  });

  it('requires a self-subject declaration before create, update, or copy', async () => {
    const { subjectScope: _subjectScope, ...unconfirmed } = restrictionInput;

    await expect(
      createCustomDietaryRestrictionAction('profile_1', unconfirmed),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { subjectScope: expect.any(Array) },
    });
    await expect(
      updateCustomDietaryRestrictionAction('restriction_1', unconfirmed),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { subjectScope: expect.any(Array) },
    });
    await expect(
      copyCustomDietaryRestrictionAction('restriction_1', 'profile_2', undefined),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { subjectScope: expect.any(Array) },
    });

    expect(requireUserMock).not.toHaveBeenCalled();
    expect(createCustomRestrictionMock).not.toHaveBeenCalled();
    expect(updateCustomRestrictionMock).not.toHaveBeenCalled();
    expect(copyCustomRestrictionMock).not.toHaveBeenCalled();
  });

  it('does not reveal whether a failed restriction is missing or foreign', async () => {
    updateCustomRestrictionMock.mockRejectedValueOnce(new Error('NOT_FOUND'));
    updateCustomRestrictionMock.mockRejectedValueOnce(new Error('FORBIDDEN'));

    const missing = await updateCustomDietaryRestrictionAction(
      'missing_restriction',
      restrictionInput,
    );
    const foreign = await updateCustomDietaryRestrictionAction(
      'foreign_restriction',
      restrictionInput,
    );

    expect(missing).toEqual(foreign);
    expect(missing).toEqual({
      ok: false,
      error: "We couldn't save that dietary restriction.",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe('saveDietaryIngredientCorrectionAction', () => {
  const correction = {
    ingredientId: 'ingredient_1',
    ruleId: 'allergen:peanut',
    customRestrictionId: null,
    finding: 'present' as const,
    correctedFoodId: null,
  };

  it('delegates validation and authorization to the core service', async () => {
    await expect(saveDietaryIngredientCorrectionAction(correction)).resolves.toEqual({
      ok: true,
      id: 'ingredient_1',
    });
    expect(saveCorrectionMock).toHaveBeenCalledWith('owner_1', correction);
    expect(revalidatePathMock).toHaveBeenCalledWith('/recipes');
    expect(revalidatePathMock).toHaveBeenCalledWith('/recipes/[cook]/[recipe]', 'page');
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/settings/dietary');
  });

  it('rejects malformed corrections before authentication', async () => {
    const result = await saveDietaryIngredientCorrectionAction({
      ...correction,
      ingredientId: '',
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'Please fix the highlighted fields.',
    });
    expect(requireUserMock).not.toHaveBeenCalled();
    expect(saveCorrectionMock).not.toHaveBeenCalled();
  });

  it('uses the same response for invalid, missing, and unauthorized corrections', async () => {
    for (const code of ['INVALID', 'NOT_FOUND', 'FORBIDDEN']) {
      saveCorrectionMock.mockRejectedValueOnce(new Error(code));
      await expect(saveDietaryIngredientCorrectionAction(correction)).resolves.toEqual({
        ok: false,
        error: "We couldn't save that dietary correction.",
      });
    }
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
