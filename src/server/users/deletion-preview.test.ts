import { beforeEach, describe, expect, it, vi } from 'vitest';

const { state, db, retention, custody } = vi.hoisted(() => {
  const state = {
    configured: true,
    results: [] as unknown[][],
    retention: {
      ownedRecipeIds: [] as string[],
      ownedToDeleteIds: [] as string[],
      ownedToUnclaimIds: [] as string[],
      ownerlessToDeleteIds: [] as string[],
      retainedCoCreatedRecipeIds: [] as string[],
      retainedRecipes: [] as {
        recipeId: string;
        ownerId: string | null;
        createdAt: Date;
        wasOwnedByDepartingUser: boolean;
      }[],
    },
    retainedMediaCount: 0,
  };

  const chain = () => {
    const c = {
      from: vi.fn(() => c),
      innerJoin: vi.fn(() => c),
      leftJoin: vi.fn(() => c),
      groupBy: vi.fn(() => c),
      where: vi.fn(() => c),
      then: (resolve: (value: unknown) => unknown) => resolve(state.results.shift() ?? []),
    };
    return c;
  };

  return {
    state,
    db: { select: vi.fn(() => chain()) },
    retention: {
      planAccountRecipeRetention: vi.fn(async () => state.retention),
    },
    custody: {
      planRetainedMediaTransfers: vi.fn(async () => ({
        departingUserId: 'u1',
        transfers: Array.from({ length: state.retainedMediaCount }, () => ({})),
        toUsers: 0,
        toRecipes: 0,
      })),
    },
  };
});

vi.mock('~/server/db', () => ({
  db,
  isDbConfigured: () => state.configured,
}));
vi.mock('~/server/users/recipe-retention', () => retention);
vi.mock('~/server/media/custody', () => custody);

const { getDeletionPreview, previewTotal } = await import('./deletion-preview');

function queue(...counts: number[]) {
  // The sixth probe is the sole-owner-group lookup and returns rows, not a count.
  state.results = counts.map((value, index) => (index === 5 ? [] : [{ value }]));
}

beforeEach(() => {
  state.configured = true;
  state.results = [];
  state.retention = {
    ownedRecipeIds: [],
    ownedToDeleteIds: [],
    ownedToUnclaimIds: [],
    ownerlessToDeleteIds: [],
    retainedCoCreatedRecipeIds: [],
    retainedRecipes: [],
  };
  state.retainedMediaCount = 0;
  vi.clearAllMocks();
});

describe('getDeletionPreview', () => {
  it('returns a zeroed preview when there is no database', async () => {
    state.configured = false;
    const preview = await getDeletionPreview('u1');

    expect(preview.ownedRecipeCount).toBe(0);
    expect(preview.unclaimedRecipeCount).toBe(0);
    expect(preview.soleOwnerGroups).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('separates deleted recipes from recipes that become unclaimed', async () => {
    state.retention = {
      ownedRecipeIds: Array.from({ length: 214 }, (_, index) => `owned-${index}`),
      ownedToDeleteIds: Array.from({ length: 200 }, (_, index) => `deleted-${index}`),
      ownedToUnclaimIds: Array.from({ length: 14 }, (_, index) => `unclaimed-${index}`),
      ownerlessToDeleteIds: ['orphan'],
      retainedCoCreatedRecipeIds: ['shared-1', 'shared-2', 'shared-3'],
      retainedRecipes: [],
    };
    state.retainedMediaCount = 4;
    queue(1, 9, 92, 17, 6, 0, 0);
    const preview = await getDeletionPreview('u1');

    expect(preview.ownedRecipeCount).toBe(214);
    expect(preview.deletedOwnedRecipeCount).toBe(200);
    expect(preview.unclaimedRecipeCount).toBe(14);
    expect(preview.coCreatedRecipeCount).toBe(3);
    expect(preview.deletedSharedRecipeCount).toBe(1);
    expect(preview.pendingInviteCount).toBe(1);
    expect(preview.retainedVersionCount).toBe(9);
    expect(preview.retainedMediaCount).toBe(4);
    expect(preview.cookLogEntryCount).toBe(92);
    expect(preview.reviewCount).toBe(17);
    expect(preview.collectionCount).toBe(6);
  });

  it('reports whether a live subscription exists', async () => {
    queue(0, 0, 0, 0, 0, 0, 1);
    expect((await getDeletionPreview('u1')).hasActiveSubscription).toBe(true);

    queue(0, 0, 0, 0, 0, 0, 0);
    expect((await getDeletionPreview('u1')).hasActiveSubscription).toBe(false);
  });

  it('sums only rows that disappear rather than retained shared content', () => {
    expect(
      previewTotal({
        ownedRecipeCount: 10,
        deletedOwnedRecipeCount: 6,
        unclaimedRecipeCount: 4,
        coCreatedRecipeCount: 99,
        deletedSharedRecipeCount: 3,
        pendingInviteCount: 99,
        retainedVersionCount: 99,
        retainedMediaCount: 99,
        cookLogEntryCount: 5,
        reviewCount: 2,
        collectionCount: 1,
        soleOwnerGroups: [],
        hasActiveSubscription: false,
      }),
    ).toBe(17);
  });
});
