import { describe, expect, it } from 'vitest';

import {
  bulkMoveShoppingItemsInput,
  createShoppingListInput,
  manualItemInput,
  moveShoppingItemInput,
  restoreShoppingListPointInput,
  restoreShoppingListPointsInput,
  saveIngredientPackageInput,
} from './validation';

const id = (suffix: string) => `${'a'.repeat(23)}${suffix}`;

describe('shopping list validation', () => {
  it('requires an explicit list for manual items', () => {
    expect(manualItemInput.safeParse({ item: 'Milk' }).success).toBe(false);
    expect(manualItemInput.safeParse({ listId: id('1'), item: 'Milk' }).success).toBe(true);
  });

  it('trims the list name and normalizes optional stores', () => {
    expect(
      createShoppingListInput.parse({
        name: '  Warehouse  ',
        newStoreNames: ['  Costco  '],
      }),
    ).toEqual({ name: 'Warehouse', storeIds: [], newStoreNames: ['Costco'] });
  });

  it('rejects duplicate alternatives and the preferred list as an alternative', () => {
    expect(
      moveShoppingItemInput.safeParse({
        itemId: id('1'),
        targetListId: id('2'),
        rememberRoute: true,
        alternativeListIds: [id('3'), id('3')],
      }).success,
    ).toBe(false);
    expect(
      moveShoppingItemInput.safeParse({
        itemId: id('1'),
        targetListId: id('2'),
        rememberRoute: true,
        alternativeListIds: [id('2')],
      }).success,
    ).toBe(false);
  });

  it('requires strict database ids for history and rejects duplicate bulk items', () => {
    expect(
      restoreShoppingListPointInput.safeParse({
        listId: 'list_1',
        restorePointId: id('2'),
      }).success,
    ).toBe(false);
    expect(
      restoreShoppingListPointInput.safeParse({
        listId: id('1'),
        restorePointId: id('2'),
      }).success,
    ).toBe(true);
    expect(
      bulkMoveShoppingItemsInput.safeParse({
        itemIds: [id('1'), id('1')],
        targetListId: id('2'),
      }).success,
    ).toBe(false);
  });

  it('requires distinct lists and points for an atomic multi-restore', () => {
    expect(
      restoreShoppingListPointsInput.safeParse({
        restorePoints: [
          { listId: id('1'), restorePointId: id('3') },
          { listId: id('1'), restorePointId: id('4') },
        ],
      }).success,
    ).toBe(false);
    expect(
      restoreShoppingListPointsInput.safeParse({
        restorePoints: [
          { listId: id('1'), restorePointId: id('3') },
          { listId: id('2'), restorePointId: id('4') },
        ],
      }).success,
    ).toBe(true);
  });

  it('validates package pairs and tri-state rounding', () => {
    expect(
      saveIngredientPackageInput.safeParse({
        itemId: id('1'),
        listId: id('2'),
        preferredListId: id('2'),
        packageAmount: 4.5,
      }).success,
    ).toBe(false);
    expect(
      saveIngredientPackageInput.parse({
        itemId: id('1'),
        listId: id('2'),
        preferredListId: id('2'),
        packageAmount: '4.5',
        packageUnit: ' cup ',
        packageLabel: ' Carton ',
        packageRoundBehavior: 'disable',
      }),
    ).toMatchObject({
      packageAmount: 4.5,
      packageUnit: 'cup',
      packageLabel: 'Carton',
      packageRoundBehavior: 'disable',
    });
  });
});
