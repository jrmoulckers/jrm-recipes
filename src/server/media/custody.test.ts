import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('~/server/db', () => ({ db: {} }));

import { buildRetainedMediaTransferPlan, type RetainedRecipeMediaClassification } from './custody';

const URL = 'https://res.cloudinary.com/demo/image/upload/heirloom/shared.jpg';
const asset = {
  id: 'asset-1',
  url: URL,
  publicId: 'heirloom/shared',
  resourceType: 'image' as const,
};

function recipe(
  recipeId: string,
  ownerId: string | null,
  createdAt: string,
  wasOwnedByDepartingUser = false,
): RetainedRecipeMediaClassification {
  return {
    recipeId,
    ownerId,
    createdAt: new Date(createdAt),
    wasOwnedByDepartingUser,
  };
}

describe('retained media custody planning', () => {
  it('chooses the owner of the oldest retained owned recipe', () => {
    const plan = buildRetainedMediaTransferPlan(
      'departing',
      [
        recipe('newer', 'owner-new', '2025-01-01'),
        recipe('oldest-ownerless', null, '2020-01-01'),
        recipe('older', 'owner-old', '2021-01-01'),
      ],
      [
        { recipeId: 'newer', url: URL },
        { recipeId: 'oldest-ownerless', url: URL },
        { recipeId: 'older', url: URL },
      ],
      [asset],
    );

    expect(plan.transfers).toEqual([
      expect.objectContaining({
        assetId: 'asset-1',
        destination: { kind: 'user', userId: 'owner-old' },
      }),
    ]);
    expect(plan.toUsers).toBe(1);
  });

  it('uses the oldest ownerless recipe as system custodian', () => {
    const plan = buildRetainedMediaTransferPlan(
      'departing',
      [recipe('new', null, '2025-01-01'), recipe('old', null, '2021-01-01')],
      [
        { recipeId: 'new', url: URL },
        { recipeId: 'old', url: URL },
      ],
      [asset],
    );

    expect(plan.transfers[0]?.destination).toEqual({ kind: 'recipe', recipeId: 'old' });
    expect(plan.toRecipes).toBe(1);
  });

  it('leaves assets with no retained recipe reference for verified purge', () => {
    const plan = buildRetainedMediaTransferPlan(
      'departing',
      [recipe('kept', 'owner', '2021-01-01')],
      [],
      [asset],
    );
    expect(plan.transfers).toEqual([]);
  });

  it('materializes bookkeeping for a retained legacy URL', () => {
    const plan = buildRetainedMediaTransferPlan(
      'departing',
      [recipe('kept', null, '2021-01-01', true)],
      [{ recipeId: 'kept', url: URL }],
      [],
    );
    expect(plan.transfers[0]).toMatchObject({
      assetId: null,
      publicId: 'heirloom/shared',
      destination: { kind: 'recipe', recipeId: 'kept' },
    });
  });

  it('keeps a retained raw caption public id intact for custody transfer', () => {
    const captionUrl =
      'https://res.cloudinary.com/demo/raw/upload/v1/heirloom/captions/step.en.vtt';
    const plan = buildRetainedMediaTransferPlan(
      'departing',
      [recipe('kept', null, '2021-01-01', true)],
      [{ recipeId: 'kept', url: captionUrl }],
      [],
    );

    expect(plan.transfers[0]).toMatchObject({
      publicId: 'heirloom/captions/step.en.vtt',
      resourceType: 'raw',
      destination: { kind: 'recipe', recipeId: 'kept' },
    });
  });

  it("does not claim an owner's unbookkept media during a co-creator deletion", () => {
    const plan = buildRetainedMediaTransferPlan(
      'departing-contributor',
      [recipe('owners-recipe', 'actual-owner', '2021-01-01', false)],
      [{ recipeId: 'owners-recipe', url: URL }],
      [],
    );

    expect(plan.transfers).toEqual([]);
    expect(plan.toUsers).toBe(0);
  });
});
