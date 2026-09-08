import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { getTableColumns } from 'drizzle-orm';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { BUILT_IN_DIETARY_RULES, dietaryRulesetVersion } from '~/lib/dietary-rules';

import {
  customDietaryRestrictions,
  customDietaryRestrictionTerms,
  dietaryAssessments,
  dietaryEvidence,
  dietaryIngredientCorrections,
  dietaryRules,
} from './dietary';

function checkNames(table: PgTable): string[] {
  return getTableConfig(table).checks.map((item) => item.name);
}

function indexNames(table: PgTable): string[] {
  return getTableConfig(table)
    .indexes.map((item) => item.config.name)
    .filter((name): name is string => name !== undefined);
}

function foreignKeyNames(table: PgTable): string[] {
  return getTableConfig(table).foreignKeys.map((item) => item.getName());
}

function indexColumns(table: PgTable, name: string): string[] {
  const index = getTableConfig(table).indexes.find((item) => item.config.name === name);
  if (!index) throw new Error(`Missing index ${name}`);
  return index.config.columns.map((column) => (column as { name: string }).name);
}

describe('dietary persistence schema', () => {
  it('declares every phase 1/2 concept as a separate structured table', () => {
    expect(getTableConfig(dietaryRules).name).toBe('dietary_rules');
    expect(getTableConfig(customDietaryRestrictions).name).toBe('custom_dietary_restrictions');
    expect(getTableConfig(customDietaryRestrictionTerms).name).toBe(
      'custom_dietary_restriction_terms',
    );
    expect(getTableConfig(dietaryIngredientCorrections).name).toBe(
      'dietary_ingredient_corrections',
    );
    expect(getTableConfig(dietaryAssessments).name).toBe('dietary_assessments');
    expect(getTableConfig(dietaryEvidence).name).toBe('dietary_evidence');
  });

  it('enforces legal assessment source/outcome and exactly-one rule targets', () => {
    expect(checkNames(dietaryAssessments)).toEqual(
      expect.arrayContaining([
        'dietary_assessments_rule_target_check',
        'dietary_assessments_scope_check',
        'dietary_assessments_custom_scope_check',
        'dietary_assessments_restriction_terms_version_check',
        'dietary_assessments_source_check',
        'dietary_assessments_outcome_check',
      ]),
    );
    expect(checkNames(dietaryIngredientCorrections)).toContain(
      'dietary_ingredient_corrections_rule_target_check',
    );
  });

  it('keeps active assessments unique per source without merging provenance', () => {
    expect(indexNames(dietaryAssessments)).toEqual(
      expect.arrayContaining([
        'dietary_assessments_active_canonical_rule_source_uq',
        'dietary_assessments_active_personal_rule_source_uq',
        'dietary_assessments_active_profile_rule_source_uq',
        'dietary_assessments_active_profile_custom_source_uq',
      ]),
    );
    expect(checkNames(dietaryEvidence)).toEqual(
      expect.arrayContaining([
        'dietary_evidence_finding_check',
        'dietary_evidence_source_check',
        'dietary_evidence_correction_source_check',
      ]),
    );
    expect(
      indexColumns(dietaryAssessments, 'dietary_assessments_active_canonical_rule_source_uq'),
    ).toEqual(['recipeId', 'ruleId', 'source', 'scope']);
    expect(
      indexColumns(dietaryAssessments, 'dietary_assessments_active_personal_rule_source_uq'),
    ).toEqual(['recipeId', 'ruleId', 'source', 'scope', 'ownerUserId']);
    expect(
      indexColumns(dietaryAssessments, 'dietary_assessments_active_profile_rule_source_uq'),
    ).toEqual(['recipeId', 'ruleId', 'source', 'scope', 'profileId']);
    expect(
      indexColumns(dietaryAssessments, 'dietary_assessments_active_profile_custom_source_uq'),
    ).toEqual(['recipeId', 'customRestrictionId', 'source', 'scope', 'profileId']);
  });

  it('indexes every foreign-key path used for cascades and reverse lookups', () => {
    expect(indexNames(dietaryIngredientCorrections)).toEqual(
      expect.arrayContaining([
        'dietary_ingredient_corrections_ingredient_idx',
        'dietary_ingredient_corrections_rule_idx',
        'dietary_ingredient_corrections_custom_idx',
        'dietary_ingredient_corrections_food_idx',
        'dietary_ingredient_corrections_actor_idx',
      ]),
    );
    expect(indexNames(dietaryEvidence)).toEqual(
      expect.arrayContaining([
        'dietary_evidence_assessment_idx',
        'dietary_evidence_ingredient_idx',
        'dietary_evidence_food_idx',
        'dietary_evidence_correction_idx',
      ]),
    );
    expect(indexNames(dietaryAssessments)).toEqual(
      expect.arrayContaining([
        'dietary_assessments_owner_user_idx',
        'dietary_assessments_profile_idx',
      ]),
    );
  });

  it('binds a custom assessment to the restriction owning the same profile', () => {
    expect(foreignKeyNames(dietaryAssessments)).toContain(
      'dietary_assessments_custom_restriction_profile_fk',
    );
    expect(getTableColumns(dietaryAssessments)).toMatchObject({
      scope: expect.anything(),
      ownerUserId: expect.anything(),
      profileId: expect.anything(),
      restrictionTermsVersion: expect.anything(),
    });
  });

  it('keeps retained built-in corrections structured and free of user text', () => {
    expect(Object.keys(getTableColumns(dietaryIngredientCorrections))).toEqual([
      'id',
      'ingredientId',
      'ruleId',
      'customRestrictionId',
      'finding',
      'correctedFoodId',
      'actorId',
      'revokedAt',
      'createdAt',
      'updatedAt',
    ]);
    expect(checkNames(dietaryIngredientCorrections)).toEqual(
      expect.arrayContaining([
        'dietary_ingredient_corrections_rule_target_check',
        'dietary_ingredient_corrections_finding_check',
      ]),
    );
  });

  it.each([
    dietaryRules,
    customDietaryRestrictions,
    customDietaryRestrictionTerms,
    dietaryIngredientCorrections,
    dietaryAssessments,
    dietaryEvidence,
  ])('timestamps every persisted dietary fact in %s', (table) => {
    expect(getTableColumns(table)).toMatchObject({
      createdAt: expect.anything(),
      updatedAt: expect.anything(),
    });
  });
});

describe('dietary migration seed', () => {
  const drizzleDirectory = join(process.cwd(), 'drizzle');
  const migrations = readdirSync(drizzleDirectory)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => readFileSync(join(drizzleDirectory, file), 'utf8'));
  const migration = migrations.find((body) => body.includes('CREATE TABLE "dietary_assessments"'));

  it('seeds every built-in rule at the generated curated ruleset version', () => {
    for (const rule of BUILT_IN_DIETARY_RULES) {
      expect(migrations.join('\n')).toContain(
        `('${rule.id}', '${rule.kind}', '${dietaryRulesetVersion()}')`,
      );
    }
  });

  it('does not persist prompt, model-trace, or free-form evidence columns', () => {
    expect(migration).toBeDefined();
    expect(migration).not.toMatch(/"prompt"|"model_trace"|"reasoning"|"explanation"/);
  });

  it('materializes the scope boundary and custom restriction/profile FK', () => {
    expect(migration).toContain(
      `("dietary_assessments"."scope" = 'canonical' and "dietary_assessments"."owner_user_id" is null and "dietary_assessments"."profile_id" is null)`,
    );
    expect(migration).toContain(
      `("dietary_assessments"."scope" = 'personal' and "dietary_assessments"."owner_user_id" is not null and "dietary_assessments"."profile_id" is null)`,
    );
    expect(migration).toContain(
      'CONSTRAINT "dietary_assessments_custom_restriction_profile_fk" FOREIGN KEY ("custom_restriction_id","profile_id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade',
    );
    expect(migration).toContain(
      'UPDATE "recipes" SET "dietary_tags" = NULL WHERE "dietary_tags" IS NOT NULL',
    );
    expect(migration).toContain(
      '"dietary_evidence_correction_id_dietary_ingredient_corrections_id_fk" FOREIGN KEY ("correction_id") REFERENCES "public"."dietary_ingredient_corrections"("id") ON DELETE cascade',
    );
    expect(migration).toContain(
      '"dietary_ingredient_corrections_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null',
    );
    expect(migration).toContain(
      '"dietary_ingredient_corrections_custom_restriction_id_custom_dietary_restrictions_id_fk" FOREIGN KEY ("custom_restriction_id") REFERENCES "public"."custom_dietary_restrictions"("id") ON DELETE cascade',
    );
    expect(migration).toContain(
      '"custom_dietary_restrictions_profile_id_member_dietary_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."member_dietary_profiles"("id") ON DELETE cascade',
    );
    expect(migration).toContain(
      '"custom_dietary_restriction_terms_restriction_id_custom_dietary_restrictions_id_fk" FOREIGN KEY ("restriction_id") REFERENCES "public"."custom_dietary_restrictions"("id") ON DELETE cascade',
    );
    expect(migration).toContain(
      '"dietary_ingredient_corrections_rule_id_dietary_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."dietary_rules"("id") ON DELETE restrict',
    );
  });
});
