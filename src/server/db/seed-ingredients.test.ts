import { describe, expect, it } from 'vitest';

import { FOOD_ITEMS } from '~/lib/food-db';
import {
  buildFoodAliasRows,
  buildFoodItemRows,
  buildFoodNutritionRows,
  foodSlug,
} from './seed-ingredients';

describe('foodSlug', () => {
  it('produces a stable, hyphenated, normalized key', () => {
    expect(foodSlug('Brown sugar')).toBe('brown-sugar');
    expect(foodSlug('Tomato (canned)')).toBe('tomato');
    expect(foodSlug('Fat / oil')).toBe('fat-oil');
  });
});

describe('buildFoodItemRows', () => {
  const rows = buildFoodItemRows();

  it('emits one row per curated food', () => {
    expect(rows).toHaveLength(FOOD_ITEMS.length);
  });

  it('gives every row a stable, unique, compact id and slug', () => {
    const ids = new Set(rows.map((r) => r.id));
    const slugs = new Set(rows.map((r) => r.slug));
    expect(ids.size).toBe(rows.length);
    expect(slugs.size).toBe(rows.length);
    for (const row of rows) {
      const id = row.id ?? '';
      expect(id).toMatch(/^food_[0-9a-z]+$/);
      // Must fit the varchar(24) id column no matter how long the name is.
      expect(id.length).toBeLessThanOrEqual(24);
      expect(row.slug.length).toBeLessThanOrEqual(80);
    }
  });

  it('carries category and density (null when unknown)', () => {
    const water = rows.find((r) => r.slug === 'water');
    expect(water?.category).toBe('liquid');
    expect(water?.densityGPerMl).toBe(1.0);

    const egg = rows.find((r) => r.slug === 'egg');
    expect(egg?.category).toBe('egg');
    expect(egg?.densityGPerMl).toBeNull();
  });
});

describe('buildFoodAliasRows', () => {
  const rows = buildFoodAliasRows();

  it('emits curated aliases keyed to their food node', () => {
    expect(rows.length).toBeGreaterThan(FOOD_ITEMS.length);
    expect(rows.every((r) => r.source === 'curated')).toBe(true);
  });

  it('gives every alias row a compact, unique id within varchar(24)', () => {
    const ids = new Set(rows.map((r) => r.id));
    expect(ids.size).toBe(rows.length);
    for (const row of rows) {
      const id = row.id ?? '';
      expect(id).toMatch(/^alias_[0-9a-z]+$/);
      expect(id.length).toBeLessThanOrEqual(24);
      expect(row.alias.length).toBeLessThanOrEqual(160);
    }
  });

  it('is unique per (foodId, alias)', () => {
    const keys = new Set(rows.map((r) => `${r.foodId}\u0000${r.alias}`));
    expect(keys.size).toBe(rows.length);
  });
});

describe('buildFoodNutritionRows', () => {
  const rows = buildFoodNutritionRows();
  const itemIds = new Set(buildFoodItemRows().map((r) => r.id));

  it('emits curated nutrition, at most one row per food', () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(FOOD_ITEMS.length);
    const foodIds = new Set(rows.map((r) => r.foodId));
    expect(foodIds.size).toBe(rows.length);
  });

  it('keys every row onto an existing food node with a source ref', () => {
    for (const row of rows) {
      expect(itemIds.has(row.foodId)).toBe(true);
      expect(row.sourceRef.length).toBeGreaterThan(0);
      expect(row.sourceRef.length).toBeLessThanOrEqual(64);
      expect(row.kcal).toBeGreaterThanOrEqual(0);
      expect(row.proteinG).toBeGreaterThanOrEqual(0);
    }
  });
});
