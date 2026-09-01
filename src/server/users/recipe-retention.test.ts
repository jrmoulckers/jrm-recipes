import { describe, expect, it } from 'vitest';

import { classifyAccountRecipeRetention } from './recipe-retention';

const createdAt = new Date('2020-01-01T00:00:00.000Z');

describe('classifyAccountRecipeRetention', () => {
  it('unclaims owned recipes only when another accepted creator remains', () => {
    const plan = classifyAccountRecipeRetention(
      'departing',
      [
        { id: 'shared', createdAt },
        { id: 'solo', createdAt },
      ],
      [],
      new Set(['shared']),
    );

    expect(plan.ownedToUnclaimIds).toEqual(['shared']);
    expect(plan.ownedToDeleteIds).toEqual(['solo']);
    expect(plan.retainedRecipes[0]).toMatchObject({
      recipeId: 'shared',
      ownerId: null,
      wasOwnedByDepartingUser: true,
    });
  });

  it('retains another owner’s recipe and public ownerless archival content', () => {
    const plan = classifyAccountRecipeRetention(
      'departing',
      [],
      [
        { recipeId: 'owned-elsewhere', authorId: 'owner', visibility: 'private', createdAt },
        { recipeId: 'public-orphan', authorId: null, visibility: 'public', createdAt },
      ],
      new Set(),
    );

    expect(plan.retainedCoCreatedRecipeIds).toEqual(['owned-elsewhere', 'public-orphan']);
    expect(plan.ownerlessToDeleteIds).toEqual([]);
  });

  it('deletes private, group, and unlisted ownerless recipes with no creator left', () => {
    const memberships = ['private', 'group', 'unlisted'].map((visibility) => ({
      recipeId: visibility,
      authorId: null,
      visibility,
      createdAt,
    }));
    const plan = classifyAccountRecipeRetention('departing', [], memberships, new Set());

    expect(plan.ownerlessToDeleteIds).toEqual(['private', 'group', 'unlisted']);
    expect(plan.retainedRecipes).toEqual([]);
  });

  it('retains a non-public ownerless recipe when another accepted creator remains', () => {
    const plan = classifyAccountRecipeRetention(
      'departing',
      [],
      [{ recipeId: 'family', authorId: null, visibility: 'group', createdAt }],
      new Set(['family']),
    );

    expect(plan.ownerlessToDeleteIds).toEqual([]);
    expect(plan.retainedRecipes).toHaveLength(1);
  });
});
