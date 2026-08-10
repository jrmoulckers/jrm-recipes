import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      shoppingLists: { findFirst: vi.fn(), findMany: vi.fn() },
      shoppingStores: { findMany: vi.fn() },
      shoppingListRestorePoints: { findMany: vi.fn() },
      shoppingIngredientRoutes: { findMany: vi.fn() },
      shoppingIngredientRouteAlternatives: { findMany: vi.fn() },
      userUnitPreferences: { findFirst: vi.fn() },
      customUnits: { findMany: vi.fn() },
    },
  },
}));

vi.mock('~/server/db', () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

import { type User } from '~/server/db/schema';
import { getShoppingListHistory, getShoppingWorkspace, SHOPPING_HISTORY_LIMIT } from './queries';

const user = { id: 'user_1' } as User;

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.query.shoppingIngredientRoutes.findMany.mockResolvedValue([]);
  dbMock.query.shoppingStores.findMany.mockResolvedValue([]);
  dbMock.query.userUnitPreferences.findFirst.mockResolvedValue(null);
  dbMock.query.customUnits.findMany.mockResolvedValue([]);
});

describe('getShoppingListHistory', () => {
  it('rejects a foreign list before reading its snapshots', async () => {
    dbMock.query.shoppingLists.findFirst.mockResolvedValue(undefined);

    await expect(getShoppingListHistory(user, 'foreign')).rejects.toThrow('NOT_FOUND');
    expect(dbMock.query.shoppingListRestorePoints.findMany).not.toHaveBeenCalled();
  });

  it('returns at most 20 recent points with preview items', async () => {
    dbMock.query.shoppingLists.findFirst.mockResolvedValue({ id: 'list_1' });
    dbMock.query.shoppingListRestorePoints.findMany.mockResolvedValue([
      {
        id: 'point_1',
        listId: 'list_1',
        operation: 'remove_completed',
        items: [{ item: 'Milk', position: 0 }],
      },
    ]);

    await expect(getShoppingListHistory(user, 'list_1')).resolves.toEqual([
      {
        id: 'point_1',
        listId: 'list_1',
        operation: 'remove-completed',
        items: [{ item: 'Milk', position: 0 }],
        restorePoints: [{ listId: 'list_1', restorePointId: 'point_1' }],
      },
    ]);
    const options = dbMock.query.shoppingListRestorePoints.findMany.mock
      .calls[0]?.[0] as unknown as {
      limit: number;
      orderBy: unknown[];
      with: { items: { orderBy: unknown[] } };
    };
    expect(options.limit).toBe(SHOPPING_HISTORY_LIMIT);
    expect(options.orderBy).toHaveLength(2);
    expect(options.with.items.orderBy).toHaveLength(2);
  });

  it('links every list snapshot in one grouped operation', async () => {
    dbMock.query.shoppingLists.findFirst.mockResolvedValue({ id: 'source' });
    dbMock.query.shoppingListRestorePoints.findMany
      .mockResolvedValueOnce([
        {
          id: 'source_point',
          listId: 'source',
          operation: 'bulk_move_source',
          operationGroupId: 'group_1',
          items: [{ item: 'Milk', position: 0 }],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'destination_point',
          listId: 'destination',
          operationGroupId: 'group_1',
        },
        {
          id: 'source_point',
          listId: 'source',
          operationGroupId: 'group_1',
        },
      ]);

    const history = await getShoppingListHistory(user, 'source');

    expect(history?.[0]?.restorePoints).toEqual([
      {
        listId: 'destination',
        restorePointId: 'destination_point',
      },
      { listId: 'source', restorePointId: 'source_point' },
    ]);
  });
});

describe('getShoppingWorkspace list selection', () => {
  it('keeps explicit URL selection independent from the saved default', async () => {
    dbMock.query.shoppingLists.findMany.mockResolvedValue([
      {
        id: 'default',
        userId: user.id,
        name: 'Default',
        isDefault: true,
        archivedAt: null,
        items: [],
        stores: [],
      },
      {
        id: 'viewed',
        userId: user.id,
        name: 'Viewed',
        isDefault: false,
        archivedAt: null,
        items: [],
        stores: [],
      },
    ]);

    const workspace = await getShoppingWorkspace(user, 'viewed');

    expect(workspace?.selectedListId).toBe('viewed');
    expect(workspace?.defaultListId).toBe('default');
  });

  it('exposes owned stores and drops links to stores the user lost', async () => {
    dbMock.query.shoppingStores.findMany.mockResolvedValue([{ id: 's-qfc', name: 'QFC' }]);
    dbMock.query.shoppingLists.findMany.mockResolvedValue([
      {
        id: 'default',
        userId: user.id,
        name: 'Default',
        isDefault: true,
        archivedAt: null,
        items: [],
        stores: [
          { listId: 'default', storeId: 's-qfc', position: 0 },
          { listId: 'default', storeId: 's-gone', position: 1 },
        ],
      },
    ]);

    const workspace = await getShoppingWorkspace(user);

    expect(workspace?.stores).toEqual([{ id: 's-qfc', name: 'QFC' }]);
    expect(workspace?.lists[0]?.storeIds).toEqual(['s-qfc']);
  });

  it("exposes package routes and the authenticated user's aggregation settings", async () => {
    dbMock.query.shoppingLists.findMany.mockResolvedValue([
      {
        id: 'store',
        userId: user.id,
        name: 'Store',
        isDefault: true,
        archivedAt: null,
        items: [
          {
            id: 'item_1',
            purchaseQuantity: 2,
            purchaseUnit: 'l',
            packageCount: 2,
          },
        ],
        stores: [],
      },
    ]);
    dbMock.query.shoppingIngredientRoutes.findMany.mockResolvedValue([
      {
        id: 'route_1',
        foodId: 'food_milk',
        normalizedItem: 'milk',
        preferredListId: 'store',
        packageAmount: 1,
        packageUnit: 'l',
        packageLabel: 'Carton',
        packageRounding: true,
      },
    ]);
    dbMock.query.shoppingIngredientRouteAlternatives.findMany.mockResolvedValue([]);
    dbMock.query.userUnitPreferences.findFirst.mockResolvedValue({
      defaultSystem: 'metric',
      volumeUnit: null,
      liquidVolumeUnit: null,
      dryVolumeUnit: null,
      smallVolumeUnit: null,
      massUnit: null,
      temperatureUnit: null,
      autoConvert: true,
      packageRounding: false,
    });

    const workspace = await getShoppingWorkspace(user);

    expect(workspace?.routes[0]).toMatchObject({
      preferredListId: 'store',
      packageAmount: 1,
      packageUnit: 'l',
      packageLabel: 'Carton',
      packageRoundBehavior: 'enable',
    });
    expect(workspace?.selectedList?.items[0]).toMatchObject({
      purchaseQuantity: 2,
      packageCount: 2,
    });
    expect(workspace?.unitPreferences.defaultSystem).toBe('metric');
    expect(workspace?.packageRounding).toBe(false);
  });
});
