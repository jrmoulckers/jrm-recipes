import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NUTRIENT_REGISTRY, nutrientById } from '~/lib/nutrients';

/**
 * Guards the #1028 backfill. The migration is the risky part of moving nutrients
 * from fixed columns to a vector: it must preserve every value already deployed
 * in `food_nutrition`, not re-seed from the static dataset and call that
 * equivalent. Unit tests cannot run SQL, so this reads the migration and asserts
 * its shape — enough to catch a legacy column silently dropped from the copy, or
 * one mapped onto the wrong nutrient id.
 */
const MIGRATION = readFileSync(join(process.cwd(), 'drizzle', '0050_high_tattoo.sql'), 'utf8');
const CONTRACT_MIGRATION = readFileSync(
  join(process.cwd(), 'drizzle', '0055_romantic_blacklash.sql'),
  'utf8',
);

/** Every nutrient `food_nutrition` stored as a column, and where it must land. */
const LEGACY_COLUMNS: readonly { column: string; nutrientId: string }[] = [
  { column: 'kcal', nutrientId: 'kcal' },
  { column: 'protein_g', nutrientId: 'proteinG' },
  { column: 'carbs_g', nutrientId: 'carbsG' },
  { column: 'fat_g', nutrientId: 'fatG' },
  { column: 'fiber_g', nutrientId: 'fiberG' },
  { column: 'sugar_g', nutrientId: 'sugarG' },
  { column: 'sodium_mg', nutrientId: 'sodiumMg' },
];

describe('0050 nutrient vector migration', () => {
  it('creates both new tables', () => {
    expect(MIGRATION).toContain('CREATE TABLE "nutrients"');
    expect(MIGRATION).toContain('CREATE TABLE "food_nutrients"');
  });

  it('seeds a registry row for every nutrient the app declares', () => {
    for (const nutrient of NUTRIENT_REGISTRY) {
      expect(MIGRATION).toContain(`('${nutrient.id}', '${nutrient.label}'`);
    }
  });

  it('copies every legacy food_nutrition column into the vector', () => {
    for (const { column, nutrientId } of LEGACY_COLUMNS) {
      expect(MIGRATION, `food_nutrition.${column} must be backfilled as ${nutrientId}`).toContain(
        `SELECT "food_id", '${nutrientId}', "${column}" FROM "food_nutrition"`,
      );
    }
  });

  it('maps every legacy column onto a nutrient the registry knows', () => {
    for (const { nutrientId } of LEGACY_COLUMNS) {
      expect(nutrientById(nutrientId), `${nutrientId} is not in the registry`).toBeDefined();
    }
  });

  it('never turns an unknown value into a confident zero', () => {
    for (const { column } of LEGACY_COLUMNS) {
      expect(MIGRATION).toContain(`WHERE "${column}" IS NOT NULL`);
    }
  });

  it('is re-runnable: every insert is idempotent', () => {
    const inserts = MIGRATION.match(/INSERT INTO/g) ?? [];
    const onConflict = MIGRATION.match(/ON CONFLICT \(/g) ?? [];
    expect(inserts.length).toBe(LEGACY_COLUMNS.length + 1);
    expect(onConflict.length).toBe(inserts.length);
    expect(MIGRATION).not.toContain('DO UPDATE');
  });
});

describe('0055 nutrient column contract migration', () => {
  it('drops every legacy column idempotently', () => {
    for (const { column } of LEGACY_COLUMNS) {
      expect(CONTRACT_MIGRATION).toContain(
        `ALTER TABLE "food_nutrition" DROP COLUMN IF EXISTS "${column}"`,
      );
    }
  });

  it('keeps provenance and the nutrient vector intact', () => {
    expect(CONTRACT_MIGRATION).not.toContain('DROP TABLE "food_nutrition"');
    expect(CONTRACT_MIGRATION).not.toContain('DROP COLUMN IF EXISTS "source_ref"');
    expect(CONTRACT_MIGRATION).not.toContain('"food_nutrients"');
  });
});
