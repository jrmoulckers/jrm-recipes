import { describe, expect, it } from 'vitest';

import {
  aggregateShoppingList,
  categorize,
  describeQuantity,
  formatShoppingListText,
  groupByCategory,
  isPantryStaple,
  mergeShoppingItems,
  normalizeItemName,
  PANTRY_STAPLES,
  scaleFactor,
  toShoppingItems,
  type AggregatedItem,
  type ShoppingCategory,
  type ShoppingItemInput,
  type ShoppingTextItem,
} from './shopping-list';

function byItem<T extends { item: string }>(items: T[], name: string) {
  return items.filter((i) => i.item.toLowerCase() === name.toLowerCase());
}

function makeItem(item: string, category: ShoppingCategory): AggregatedItem {
  return {
    key: item.toLowerCase(),
    item,
    foodId: null,
    quantity: 1,
    quantityMax: null,
    unit: null,
    requiredBaseQuantity: 1,
    requiredBaseQuantityMax: null,
    requiredBaseUnit: null,
    purchaseQuantity: null,
    purchaseUnit: null,
    packageCount: null,
    packageAmount: null,
    packageUnit: null,
    packageLabel: null,
    dimension: null,
    category,
    optional: false,
    hasOptional: false,
    recipeIds: [],
    allergens: [],
  };
}

describe('scaleFactor', () => {
  it('scales by the ratio of desired to base servings', () => {
    expect(scaleFactor(4, 8)).toBe(2);
    expect(scaleFactor(4, 2)).toBe(0.5);
    expect(scaleFactor(3, 3)).toBe(1);
  });

  it('falls back to 1 when servings are missing or zero', () => {
    expect(scaleFactor(null, 8)).toBe(1);
    expect(scaleFactor(4, null)).toBe(1);
    expect(scaleFactor(0, 8)).toBe(1);
    expect(scaleFactor(4, 0)).toBe(1);
    expect(scaleFactor(undefined, undefined)).toBe(1);
  });

  it('defaults desired to base when only base is given', () => {
    expect(scaleFactor(4, undefined)).toBe(1);
  });
});

describe('normalizeItemName', () => {
  it('lowercases, trims and collapses whitespace', () => {
    expect(normalizeItemName('  Olive   Oil ')).toBe('olive oil');
    expect(normalizeItemName('EGGS')).toBe('eggs');
  });
});

describe('categorize', () => {
  it.each([
    ['Flour', 'Pantry'],
    ['granulated sugar', 'Pantry'],
    ['Chicken thighs', 'Meat & Seafood'],
    ['Whole milk', 'Dairy & Eggs'],
    ['Eggs', 'Dairy & Eggs'],
    ['Yellow onion', 'Produce'],
    ['Fresh basil', 'Spices & Seasonings'],
    ['Salt', 'Spices & Seasonings'],
    ['Sourdough bread', 'Bakery'],
    ['Frozen peas', 'Frozen'],
    ['Orange juice', 'Beverages'],
    ['Unobtainium', 'Other'],
  ])('puts %s in %s', (item, category) => {
    expect(categorize(item)).toBe(category);
  });

  it('does not match keywords inside longer words', () => {
    // "corn" (Produce) must not swallow "cornstarch" (Pantry).
    expect(categorize('cornstarch')).toBe('Pantry');
  });
});

describe('categorize. Specificity & word boundaries (sp04)', () => {
  it.each([
    // Broad, earlier rules used to win over more specific, later ones.
    ['coconut milk', 'Pantry'], // was Dairy & Eggs via "milk"
    ['tomato paste', 'Pantry'], // was Produce via "tomato"
    ['stock cube', 'Pantry'], // was Beverages via "stock"
    ['bell pepper', 'Produce'], // was Spices & Seasonings via "pepper"
    ['red bell pepper', 'Produce'],
    ['peanut butter', 'Pantry'], // was Dairy & Eggs via "butter"
  ])('routes %s to %s (most specific keyword wins)', (item, category) => {
    expect(categorize(item)).toBe(category);
  });

  it('still resolves single-word collisions by rule priority', () => {
    // Both keywords are single words, so the broad-aisle-first order decides:
    // "broth"/"stock" (Beverages) keep winning over "chicken" (Meat).
    expect(categorize('chicken broth')).toBe('Beverages');
    expect(categorize('chicken stock')).toBe('Beverages');
    // Black pepper is a seasoning. Only the more specific "bell pepper" is produce.
    expect(categorize('black pepper')).toBe('Spices & Seasonings');
  });

  it('matches whole words, not substrings', () => {
    expect(categorize('cornstarch')).toBe('Pantry'); // not Produce "corn"
    expect(categorize('peppercorns')).toBe('Spices & Seasonings'); // not Produce "corn"
    expect(categorize('graham crackers')).toBe('Pantry'); // "ham" must not match
  });

  it('tolerates simple plurals', () => {
    expect(categorize('tomatoes')).toBe('Produce'); // was "Other"
    expect(categorize('potatoes')).toBe('Produce');
    expect(categorize('carrots')).toBe('Produce');
    expect(categorize('onions')).toBe('Produce');
  });
});

describe('mergeShoppingItems', () => {
  it('sums identical item + unit', () => {
    const [item] = mergeShoppingItems([
      { item: 'Flour', quantity: 2, unit: 'cup' },
      { item: 'flour', quantity: 1, unit: 'cup' },
    ]);
    expect(item).toMatchObject({ item: 'Flour', quantity: 3, unit: 'cup' });
    expect(describeQuantity(item!)).toBe('3 cups');
  });

  it('combines compatible units within a dimension', () => {
    // 3 tsp + 1 tbsp = 2 tbsp.
    const [item] = mergeShoppingItems([
      { item: 'Olive oil', quantity: 3, unit: 'tsp' },
      { item: 'Olive oil', quantity: 1, unit: 'tbsp' },
    ]);
    expect(describeQuantity(item!)).toBe('2 tbsp');
  });

  it('re-expresses metric amounts up the ladder', () => {
    const [item] = mergeShoppingItems([
      { item: 'Milk', quantity: 500, unit: 'ml' },
      { item: 'Milk', quantity: 500, unit: 'ml' },
    ]);
    expect(item).toMatchObject({ quantity: 1, unit: 'l' });
  });

  it('keeps incompatible dimensions of the same item separate', () => {
    const items = mergeShoppingItems([
      { item: 'Flour', quantity: 2, unit: 'cup' },
      { item: 'Flour', quantity: 100, unit: 'g' },
    ]);
    expect(byItem(items, 'Flour')).toHaveLength(2);
  });

  it('sums unitless (count) items', () => {
    const [item] = mergeShoppingItems([
      { item: 'Eggs', quantity: 2 },
      { item: 'eggs', quantity: 3 },
    ]);
    expect(item).toMatchObject({ quantity: 5, unit: null });
    expect(describeQuantity(item!)).toBe('5');
  });

  it('sums unknown units only when they match', () => {
    const same = mergeShoppingItems([
      { item: 'Tomatoes', quantity: 1, unit: 'can' },
      { item: 'Tomatoes', quantity: 2, unit: 'can' },
    ]);
    expect(same).toHaveLength(1);
    expect(describeQuantity(same[0]!)).toBe('3 can');

    const different = mergeShoppingItems([
      { item: 'Rice', quantity: 1, unit: 'cup' },
      { item: 'Rice', quantity: 1, unit: 'bag' },
    ]);
    expect(different).toHaveLength(2);
  });

  it('keeps unquantified items on the list', () => {
    const [item] = mergeShoppingItems([{ item: 'Salt to taste' }]);
    expect(item).toMatchObject({ quantity: null, unit: null });
    expect(describeQuantity(item!)).toBe('');
  });

  it('accumulates quantity ranges', () => {
    // (1–2 tsp) + (1 tsp) => 2–3 tsp.
    const [item] = mergeShoppingItems([
      { item: 'Chili flakes', quantity: 1, quantityMax: 2, unit: 'tsp' },
      { item: 'Chili flakes', quantity: 1, unit: 'tsp' },
    ]);
    expect(item).toMatchObject({ quantity: 2, quantityMax: 3, unit: 'tsp' });
    expect(describeQuantity(item!)).toBe('2–3 tsp');
  });

  it('is optional only when every contribution is optional', () => {
    const [allOptional] = mergeShoppingItems([
      { item: 'Parsley', quantity: 1, unit: 'tbsp', optional: true },
      { item: 'Parsley', quantity: 1, unit: 'tbsp', optional: true },
    ]);
    expect(allOptional?.optional).toBe(true);

    const [mixed] = mergeShoppingItems([
      { item: 'Parsley', quantity: 1, unit: 'tbsp', optional: true },
      { item: 'Parsley', quantity: 1, unit: 'tbsp', optional: false },
    ]);
    expect(mixed?.optional).toBe(false);
  });

  it('collects contributing recipe ids without duplicates', () => {
    const [item] = mergeShoppingItems([
      { item: 'Butter', quantity: 1, unit: 'tbsp', recipeId: 'a' },
      { item: 'Butter', quantity: 1, unit: 'tbsp', recipeId: 'b' },
      { item: 'Butter', quantity: 1, unit: 'tbsp', recipeId: 'a' },
    ]);
    expect(item?.recipeIds).toEqual(['a', 'b']);
  });

  it('ignores blank item names', () => {
    expect(mergeShoppingItems([{ item: '   ' }])).toHaveLength(0);
  });
});

describe('saved-unit aggregation and package ceilings (#629)', () => {
  it('combines mixed US/metric inputs before applying the saved metric system', () => {
    const [item] = mergeShoppingItems(
      [
        { item: 'Milk', quantity: 1, unit: 'cup' },
        { item: 'Milk', quantity: 250, unit: 'ml' },
      ],
      {
        unitPreferences: { defaultSystem: 'metric', autoConvert: true },
      },
    );

    expect(item).toMatchObject({
      quantity: 486.588,
      quantityMax: null,
      unit: 'ml',
    });
  });

  it('uses the saved US system instead of the recipe unit', () => {
    const [item] = mergeShoppingItems([{ item: 'Milk', quantity: 1000, unit: 'ml' }], {
      unitPreferences: { defaultSystem: 'us', autoConvert: true },
    });

    expect(item).toMatchObject({ quantity: 1.057, unit: 'quart' });
  });

  it('honors per-volume-class overrides and preserves converted ranges', () => {
    const preferences = {
      defaultSystem: 'metric' as const,
      liquidVolumeUnit: 'cup',
      dryVolumeUnit: 'tbsp',
      autoConvert: true,
    };
    const [milk] = mergeShoppingItems(
      [{ item: 'Milk', quantity: 473.176, quantityMax: 946.352, unit: 'ml' }],
      { unitPreferences: preferences },
    );
    const [flour] = mergeShoppingItems([{ item: 'Flour', quantity: 1, unit: 'cup' }], {
      unitPreferences: preferences,
    });

    expect(milk).toMatchObject({ quantity: 2, quantityMax: 4, unit: 'cup' });
    expect(flour).toMatchObject({ quantity: 16, unit: 'tbsp' });
  });

  it('honors a saved per-dimension mass unit', () => {
    const [item] = mergeShoppingItems(
      [
        { item: 'Chicken', quantity: 1, unit: 'lb' },
        { item: 'Chicken', quantity: 100, unit: 'g' },
      ],
      {
        unitPreferences: {
          defaultSystem: 'metric',
          massUnit: 'oz',
          autoConvert: true,
        },
      },
    );

    expect(item).toMatchObject({ quantity: 19.527, unit: 'oz' });
  });

  it('merges convertible custom units and can select one as the saved output', () => {
    const customUnits = [
      {
        name: 'scoop',
        dimension: 'volume' as const,
        baseUnit: 'cup',
        baseAmount: 0.5,
        abbreviation: null,
        displayAsTrue: false,
      },
    ];
    const [item] = mergeShoppingItems(
      [
        { item: 'Flour', quantity: 1, unit: 'scoop' },
        { item: 'Flour', quantity: 1, unit: 'cup' },
      ],
      {
        customUnits,
        unitPreferences: {
          defaultSystem: 'metric',
          dryVolumeUnit: 'scoop',
          autoConvert: true,
        },
      },
    );

    expect(item).toMatchObject({ quantity: 3, unit: 'scoop' });
  });

  it('ceilings against package size without replacing the exact requirement', () => {
    const [item] = mergeShoppingItems([{ item: 'Milk', quantity: 3, unit: 'cup' }], {
      packageRounding: true,
      packageRules: [
        {
          foodId: null,
          normalizedItem: 'milk',
          packageAmount: 4.5,
          packageUnit: 'cup',
          packageLabel: 'Carton',
          packageRoundBehavior: 'inherit',
        },
      ],
    });

    expect(item).toMatchObject({
      quantity: 3,
      quantityMax: null,
      unit: 'cup',
      packageCount: 1,
      purchaseQuantity: 4.5,
      purchaseUnit: 'cup',
      packageLabel: 'Carton',
    });
  });

  it('uses the upper range bound and never rounds down', () => {
    const [item] = mergeShoppingItems(
      [{ item: 'Milk', quantity: 2, quantityMax: 5, unit: 'cup' }],
      {
        packageRounding: true,
        packageRules: [
          {
            foodId: null,
            normalizedItem: 'milk',
            packageAmount: 4,
            packageUnit: 'cup',
            packageLabel: null,
            packageRoundBehavior: 'inherit',
          },
        ],
      },
    );

    expect(item).toMatchObject({
      quantity: 2,
      quantityMax: 5,
      packageCount: 2,
      purchaseQuantity: 8,
    });
  });

  it('ceilings from the canonical amount just above a package boundary', () => {
    const [item] = mergeShoppingItems([{ item: 'Milk', quantity: 4.0000001, unit: 'cup' }], {
      packageRounding: true,
      packageRules: [
        {
          foodId: null,
          normalizedItem: 'milk',
          packageAmount: 4,
          packageUnit: 'cup',
          packageRoundBehavior: 'inherit',
        },
      ],
    });

    expect(item).toMatchObject({
      quantity: 1,
      unit: 'quart',
      requiredBaseUnit: 'ml',
      packageCount: 2,
      purchaseQuantity: 8,
    });
    expect(item?.requiredBaseQuantity).toBeCloseTo(946.3520236588, 8);
  });

  it('ceilings from a canonical range upper bound just above a package boundary', () => {
    const [item] = mergeShoppingItems(
      [
        {
          item: 'Milk',
          quantity: 3,
          quantityMax: 4.0000001,
          unit: 'cup',
        },
      ],
      {
        packageRounding: true,
        packageRules: [
          {
            foodId: null,
            normalizedItem: 'milk',
            packageAmount: 4,
            packageUnit: 'cup',
            packageRoundBehavior: 'inherit',
          },
        ],
      },
    );

    expect(item).toMatchObject({
      packageCount: 2,
      purchaseQuantity: 8,
    });
    expect(item?.requiredBaseQuantityMax).toBeCloseTo(946.3520236588, 8);
  });

  it('supports ingredient overrides while the global default remains off', () => {
    const packageRule = {
      foodId: null,
      normalizedItem: 'milk',
      packageAmount: 1,
      packageUnit: 'l',
      packageLabel: null,
    };
    const input = [{ item: 'Milk', quantity: 1200, unit: 'ml' }];

    expect(
      mergeShoppingItems(input, {
        packageRounding: false,
        packageRules: [{ ...packageRule, packageRoundBehavior: 'inherit' as const }],
      })[0]?.packageCount,
    ).toBeNull();
    expect(
      mergeShoppingItems(input, {
        packageRounding: false,
        packageRules: [{ ...packageRule, packageRoundBehavior: 'enable' as const }],
      })[0],
    ).toMatchObject({
      packageCount: 2,
      purchaseQuantity: 2,
      purchaseUnit: 'l',
    });
    expect(
      mergeShoppingItems(input, {
        packageRounding: true,
        packageRules: [{ ...packageRule, packageRoundBehavior: 'disable' as const }],
      })[0]?.packageCount,
    ).toBeNull();
  });

  it('leaves invalid and non-convertible package rules exact', () => {
    const input = [{ item: 'Milk', quantity: 3, unit: 'cup' }];
    const invalid = mergeShoppingItems(input, {
      packageRounding: true,
      packageRules: [
        {
          foodId: null,
          normalizedItem: 'milk',
          packageAmount: -1,
          packageUnit: 'cup',
          packageLabel: null,
          packageRoundBehavior: 'inherit',
        },
      ],
    })[0];
    const incompatible = mergeShoppingItems(input, {
      packageRounding: true,
      packageRules: [
        {
          foodId: null,
          normalizedItem: 'milk',
          packageAmount: 1,
          packageUnit: 'kg',
          packageLabel: null,
          packageRoundBehavior: 'inherit',
        },
      ],
    })[0];

    expect(invalid).toMatchObject({ quantity: 3, packageCount: null });
    expect(incompatible).toMatchObject({
      quantity: 3,
      purchaseQuantity: null,
      packageCount: null,
    });
  });

  it('preserves non-convertible custom quantities', () => {
    const [item] = mergeShoppingItems([{ item: 'Herbs', quantity: 2, unit: 'handful' }], {
      customUnits: [
        {
          name: 'handful',
          dimension: 'volume',
          baseUnit: null,
          baseAmount: null,
        },
      ],
      unitPreferences: { defaultSystem: 'metric', autoConvert: true },
    });
    expect(item).toMatchObject({
      quantity: 2,
      unit: 'handful',
      requiredBaseQuantity: 2,
      requiredBaseUnit: 'handful',
      packageCount: null,
    });
    const [restored] = mergeShoppingItems([
      {
        item: item!.item,
        quantity: item!.quantity,
        unit: item!.unit,
        requiredBaseQuantity: item!.requiredBaseQuantity,
        requiredBaseQuantityMax: item!.requiredBaseQuantityMax,
        requiredBaseUnit: item!.requiredBaseUnit,
      },
    ]);
    expect(restored).toMatchObject({
      quantity: 2,
      unit: 'handful',
      requiredBaseQuantity: 2,
      requiredBaseUnit: 'handful',
    });
  });

  it('reaggregates from a stable base when a custom unit changes or disappears', () => {
    const originalCustomUnits = [
      {
        name: 'scoop',
        dimension: 'volume' as const,
        baseUnit: 'cup',
        baseAmount: 0.5,
      },
    ];
    const [persisted] = mergeShoppingItems([{ item: 'Flour', quantity: 1, unit: 'scoop' }], {
      customUnits: originalCustomUnits,
    });
    expect(persisted).toMatchObject({
      requiredBaseQuantity: 118.294,
      requiredBaseUnit: 'ml',
    });

    const stableInput = {
      item: persisted!.item,
      quantity: persisted!.quantity,
      quantityMax: persisted!.quantityMax,
      unit: persisted!.unit,
      requiredBaseQuantity: persisted!.requiredBaseQuantity,
      requiredBaseQuantityMax: persisted!.requiredBaseQuantityMax,
      requiredBaseUnit: persisted!.requiredBaseUnit,
    };
    const [afterEdit] = mergeShoppingItems([stableInput], {
      customUnits: [{ ...originalCustomUnits[0]!, baseAmount: 1 }],
      unitPreferences: {
        defaultSystem: 'metric',
        dryVolumeUnit: 'scoop',
        autoConvert: true,
      },
    });
    const [afterDelete] = mergeShoppingItems([stableInput], {
      unitPreferences: {
        defaultSystem: 'metric',
        dryVolumeUnit: 'scoop',
        autoConvert: true,
      },
    });

    expect(afterEdit).toMatchObject({
      quantity: 0.5,
      unit: 'scoop',
      requiredBaseQuantity: 118.294,
      requiredBaseUnit: 'ml',
    });
    expect(afterDelete).toMatchObject({
      quantity: 118.294,
      unit: 'ml',
      requiredBaseQuantity: 118.294,
      requiredBaseUnit: 'ml',
    });
  });
});

describe('optional flag preservation (sp05)', () => {
  it('keeps a fully-optional item flagged optional', () => {
    const [item] = mergeShoppingItems([
      { item: 'Cilantro', quantity: 1, unit: 'tbsp', optional: true },
    ]);
    expect(item?.optional).toBe(true);
    expect(item?.hasOptional).toBe(true);
  });

  it('preserves the distinction when merging an optional and a required entry', () => {
    const [item] = mergeShoppingItems([
      { item: 'Cilantro', quantity: 1, unit: 'tbsp', optional: false },
      { item: 'Cilantro', quantity: 1, unit: 'tbsp', optional: true },
    ]);
    // A recipe requires it, so the whole line isn't optional...
    expect(item?.optional).toBe(false);
    // ...but the optional contribution is no longer silently dropped.
    expect(item?.hasOptional).toBe(true);
  });

  it('marks a fully-required item as neither optional nor partially optional', () => {
    const [item] = mergeShoppingItems([{ item: 'Cilantro', quantity: 1, unit: 'tbsp' }]);
    expect(item?.optional).toBe(false);
    expect(item?.hasOptional).toBe(false);
  });

  it('carries the optional flag through the full aggregate pipeline', () => {
    const result = aggregateShoppingList([
      {
        recipeId: 'r1',
        servings: 1,
        desiredServings: 1,
        ingredients: [{ item: 'Cilantro', quantity: 1, unit: 'tbsp', optional: true }],
      },
    ]);
    expect(result.items[0]?.optional).toBe(true);
    expect(result.items[0]?.hasOptional).toBe(true);
  });
});

describe('toShoppingItems', () => {
  it('scales each ingredient by the serving factor', () => {
    const items = toShoppingItems({
      recipeId: 'r1',
      servings: 4,
      desiredServings: 8,
      ingredients: [
        { item: 'Flour', quantity: 1, quantityMax: 2, unit: 'cup' },
        { item: 'Salt', unit: 'pinch' },
      ],
    });
    expect(items[0]).toMatchObject({
      item: 'Flour',
      quantity: 2,
      quantityMax: 4,
      recipeId: 'r1',
    });
    // No quantity to scale. Passes through untouched.
    expect(items[1]).toMatchObject({ item: 'Salt', quantity: null });
  });
});

describe('aggregateShoppingList', () => {
  it('consolidates the same ingredient across multiple recipes', () => {
    const result = aggregateShoppingList([
      {
        recipeId: 'a',
        servings: 4,
        desiredServings: 4,
        ingredients: [{ item: 'Flour', quantity: 1, unit: 'cup' }],
      },
      {
        recipeId: 'b',
        servings: 4,
        desiredServings: 4,
        ingredients: [{ item: 'flour', quantity: 1, unit: 'cup' }],
      },
    ]);
    const flour = byItem(result.items, 'Flour');
    expect(flour).toHaveLength(1);
    expect(flour[0]).toMatchObject({ quantity: 2, unit: 'cup' });
    expect(flour[0]?.recipeIds).toEqual(['a', 'b']);
  });

  it('scales before consolidating', () => {
    const result = aggregateShoppingList([
      {
        servings: 2,
        desiredServings: 4,
        ingredients: [{ item: 'Sugar', quantity: 1, unit: 'cup' }],
      },
    ]);
    expect(result.items[0]).toMatchObject({ item: 'Sugar', quantity: 2 });
  });

  it('groups items by grocery category in display order', () => {
    const result = aggregateShoppingList([
      {
        servings: 1,
        desiredServings: 1,
        ingredients: [
          { item: 'Chicken breast', quantity: 1, unit: 'lb' },
          { item: 'Onion', quantity: 1 },
          { item: 'Flour', quantity: 1, unit: 'cup' },
        ],
      },
    ]);
    expect(result.groups.map((g) => g.category)).toEqual(['Produce', 'Meat & Seafood', 'Pantry']);
  });
});

describe('groupByCategory', () => {
  it('returns only non-empty categories, ordered', () => {
    const items = mergeShoppingItems([
      { item: 'Flour', quantity: 1, unit: 'cup' },
      { item: 'Onion', quantity: 1 },
    ]);
    const groups = groupByCategory(items);
    expect(groups.map((g) => g.category)).toEqual(['Produce', 'Pantry']);
  });

  it('buckets non-canonical categories under Other instead of dropping them (sp06)', () => {
    const items: AggregatedItem[] = [
      makeItem('Mystery Snack', 'Snacks' as ShoppingCategory),
      makeItem('Flour', 'Pantry'),
    ];
    const groups = groupByCategory(items);
    const other = groups.find((g) => g.category === 'Other');
    expect(other?.items.map((i) => i.item)).toContain('Mystery Snack');
    // Nothing vanishes: every input item is present in some group.
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(items.length);
  });

  it('routes items with a missing category to Other (sp06)', () => {
    const items = [makeItem('Ghost', undefined as unknown as ShoppingCategory)];
    const groups = groupByCategory(items);
    expect(groups.find((g) => g.category === 'Other')?.items).toHaveLength(1);
  });
});

describe('describeQuantity', () => {
  it('formats counts, units and ranges', () => {
    expect(describeQuantity({ quantity: 3, quantityMax: null, unit: null })).toBe('3');
    expect(describeQuantity({ quantity: 2, quantityMax: null, unit: 'cup' })).toBe('2 cups');
    expect(describeQuantity({ quantity: 1, quantityMax: null, unit: 'cup' })).toBe('1 cup');
    expect(describeQuantity({ quantity: 2, quantityMax: 3, unit: 'tbsp' })).toBe('2–3 tbsp');
    expect(describeQuantity({ quantity: null, quantityMax: null, unit: null })).toBe('');
  });

  it('applies metric rounding/formatting by passing the unit through (#51)', () => {
    // Small metric dose keeps one decimal instead of a vulgar fraction (½).
    expect(describeQuantity({ quantity: 12.5, quantityMax: null, unit: 'g' })).toBe('12.5 g');
    // A converted metric range renders coherently as whole millilitres.
    expect(describeQuantity({ quantity: 237, quantityMax: 710, unit: 'ml' })).toBe('237–710 ml');
  });

  it('formats decimal quantities with the requested locale', () => {
    expect(describeQuantity({ quantity: 12.5, quantityMax: null, unit: 'g' }, 'de')).toBe('12,5 g');
    expect(describeQuantity({ quantity: 1.2, quantityMax: null, unit: 'ml' }, 'ar')).toMatch(
      /١٫٢ ml/,
    );
  });
});

// Type export smoke test, keeping the public input type wired up.
describe('aggregated allergens (#432)', () => {
  it('tags a consolidated line with allergens detected in its name', () => {
    const result = aggregateShoppingList([
      {
        servings: 1,
        desiredServings: 1,
        ingredients: [
          { item: 'Peanut butter', quantity: 2, unit: 'tbsp' },
          { item: 'Whole milk', quantity: 1, unit: 'cup' },
          { item: 'Onion', quantity: 1 },
        ],
      },
    ]);
    expect(byItem(result.items, 'Peanut butter')[0]?.allergens).toEqual(['peanut']);
    expect(byItem(result.items, 'Whole milk')[0]?.allergens).toEqual(['dairy']);
    // A plain produce item carries no detected allergen.
    expect(byItem(result.items, 'Onion')[0]?.allergens).toEqual([]);
  });

  it('keeps allergens on a line merged across recipes', () => {
    const result = aggregateShoppingList([
      {
        recipeId: 'a',
        servings: 1,
        desiredServings: 1,
        ingredients: [{ item: 'Butter', quantity: 1, unit: 'tbsp' }],
      },
      {
        recipeId: 'b',
        servings: 1,
        desiredServings: 1,
        ingredients: [{ item: 'butter', quantity: 1, unit: 'tbsp' }],
      },
    ]);
    const butter = byItem(result.items, 'Butter');
    expect(butter).toHaveLength(1);
    expect(butter[0]?.allergens).toEqual(['dairy']);
  });
});

const _sample: ShoppingItemInput = { item: 'Water' };
void _sample;

describe('isPantryStaple', () => {
  it.each([
    'salt',
    'Sea Salt',
    'kosher salt',
    'black pepper',
    'peppercorns',
    'water',
    'warm water',
    'oil',
    'olive oil',
    'Extra Virgin Olive Oil',
    'vegetable oil',
    'cooking spray',
    'butter',
    'garlic powder',
    'onion powder',
    'paprika',
    'ground cumin',
    'cinnamon',
    'bay leaf',
    '2 bay leaves',
  ])('treats %s as a staple', (item) => {
    expect(isPantryStaple(item)).toBe(true);
  });

  it.each([
    'chicken thighs',
    'flour',
    'granulated sugar',
    'fresh basil',
    'fresh ginger',
    'garlic clove',
    'yellow onion',
    'coconut milk',
    'chicken stock',
    'tomatoes',
    '',
  ])('does not treat %s as a staple', (item) => {
    expect(isPantryStaple(item)).toBe(false);
  });

  it('matches whole words only (no substring false positives)', () => {
    // "oil" must not fire on "boiled", "salt" must not fire on "salted"
    expect(isPantryStaple('boiled potatoes')).toBe(false);
    expect(isPantryStaple('salted caramel')).toBe(false);
    // fresh aromatics are deliberately excluded so real produce is never hidden
    expect(isPantryStaple('garlic')).toBe(false);
    expect(isPantryStaple('basil')).toBe(false);
  });

  it('exposes a non-empty staple list', () => {
    expect(PANTRY_STAPLES.length).toBeGreaterThan(0);
    expect(PANTRY_STAPLES).toContain('salt');
  });
});

describe('isPantryStaple. Compound ingredients keep their head noun (#412)', () => {
  // Regression: staple EXCLUSION used to use whole-word containment, so a staple
  // word ("pepper", "butter", "water", "oil") appearing inside a distinct
  // ingredient silently dropped a real must-buy from the default shopping list.
  it.each([
    'bell pepper',
    'red bell pepper',
    'jalapeño pepper',
    'peanut butter',
    'almond butter',
    'coconut water',
    'rose water',
    'water chestnuts',
    'sesame oil',
    'chili oil',
    'truffle oil',
    'coconut oil',
    'sparkling water',
    'ground beef',
  ])('keeps %s on the list (not a staple)', (item) => {
    expect(isPantryStaple(item)).toBe(false);
  });

  it.each([
    'salt',
    'ground pepper',
    'ground black pepper',
    'olive oil',
    'fine sea salt',
    'unsalted butter',
  ])('still drops %s (a genuine staple)', (item) => {
    expect(isPantryStaple(item)).toBe(true);
  });
});

describe('formatShoppingListText', () => {
  function item(
    over: Partial<ShoppingTextItem> & Pick<ShoppingTextItem, 'item' | 'category'>,
  ): ShoppingTextItem {
    return {
      quantity: null,
      quantityMax: null,
      unit: null,
      checked: false,
      ...over,
    };
  }

  const sample: ShoppingTextItem[] = [
    item({
      item: 'Chicken thighs',
      quantity: 2,
      unit: 'lb',
      category: 'Meat & Seafood',
    }),
    item({ item: 'Spinach', quantity: 1, unit: 'bunch', category: 'Produce' }),
    item({ item: 'Apples', quantity: 6, category: 'Produce' }),
    item({
      item: 'Milk',
      quantity: 1,
      unit: 'gal',
      category: 'Dairy & Eggs',
      checked: true,
    }),
  ];

  it('groups by aisle with markdown checkboxes, excluding checked items', () => {
    const text = formatShoppingListText(sample);
    expect(text).toContain('Produce:');
    expect(text).toContain('- [ ] 6 Apples');
    expect(text).toContain('- [ ] 1 bunch Spinach');
    expect(text).toContain('Meat & seafood:');
    expect(text).toContain('- [ ] 2 lb Chicken thighs');
    // checked "Milk" is excluded by default, so its aisle never appears
    expect(text).not.toContain('Milk');
    expect(text).not.toContain('Dairy & eggs:');
  });

  it('orders categories by aisle and items alphabetically within one', () => {
    const text = formatShoppingListText(sample);
    expect(text.indexOf('Produce:')).toBeLessThan(text.indexOf('Meat & seafood:'));
    expect(text.indexOf('Apples')).toBeLessThan(text.indexOf('Spinach'));
  });

  it('includes checked items (as [x]) when asked', () => {
    const text = formatShoppingListText(sample, { includeChecked: true });
    expect(text).toContain('- [x] 1 gallon Milk');
  });

  it('prepends an optional title', () => {
    const text = formatShoppingListText(sample, { title: 'Weeknight run' });
    expect(text.startsWith('Weeknight run\n')).toBe(true);
  });

  it('uses the export locale for quantity formatting', () => {
    const text = formatShoppingListText(
      [
        item({
          item: 'Aceite',
          quantity: 1.2,
          unit: 'ml',
          category: 'Pantry',
        }),
      ],
      { locale: 'es' },
    );
    expect(text).toContain('1,2 ml Aceite');
  });

  it('appends notes to the line', () => {
    const text = formatShoppingListText([
      item({ item: 'Bread', category: 'Bakery', note: 'the seeded one' }),
    ]);
    expect(text).toContain('- [ ] Bread, the seeded one');
  });

  it('returns an empty string when there is nothing to send', () => {
    expect(formatShoppingListText([])).toBe('');
    expect(
      formatShoppingListText([item({ item: 'Milk', category: 'Dairy & Eggs', checked: true })]),
    ).toBe('');
  });
});
