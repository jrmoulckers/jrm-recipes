import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import type { Nutrition } from '~/lib/nutrition';

import { fk, pk, timestamps } from './_shared';
import { foodItems } from './ingredients';
import { recipeIngredients, recipes } from './recipes';
import { users } from './users';
import { groups } from './groups';

/**
 * Per-family-member dietary profiles (issue #396). A cook records each person
 * they cook for once. Their allergens and the diets they follow let downstream
 * "safe for" features check recipes against real restrictions instead of the
 * cook holding it all in their head.
 *
 * `allergens` stores canonical {@link Allergen} strings and `diets` stores
 * canonical `DietaryTag` strings. Validation guarantees no drift from the
 * shared unions. A profile is owned by a user and optionally scoped to a group
 * (e.g. one household), so it can be shared with the right family table.
 */
export const memberDietaryProfiles = pgTable(
  'member_dietary_profiles',
  {
    id: pk(),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Optional household scope. If the group is deleted the profile survives as
    // a personal (unscoped) profile rather than vanishing.
    groupId: fk().references(() => groups.id, { onDelete: 'set null' }),
    name: varchar({ length: 80 }).notNull(),
    allergens: text().array(),
    diets: text().array(),
    ...timestamps(),
  },
  (t) => [
    index('member_dietary_profiles_user_idx').on(t.userId),
    index('member_dietary_profiles_group_idx').on(t.groupId),
  ],
);

export const memberDietaryProfilesRelations = relations(memberDietaryProfiles, ({ one, many }) => ({
  owner: one(users, {
    fields: [memberDietaryProfiles.userId],
    references: [users.id],
  }),
  group: one(groups, {
    fields: [memberDietaryProfiles.groupId],
    references: [groups.id],
  }),
  nutritionTargets: many(nutritionTargets),
  customRestrictions: many(customDietaryRestrictions),
  assessments: many(dietaryAssessments),
}));

/**
 * Versioned macro targets per family member (issue #1046).
 *
 * A target is a **fact with a history**, not a current setting. The row that
 * applies to a date is the one with the greatest `effectiveFrom` on or before
 * it, so a week cooked during a cut stays scored against the cut's numbers
 * after the member switches to a bulk. Storing one mutable goal per profile
 * silently rewrites every retrospective surface the moment the goal changes.
 *
 * `targets` is a partial map in the app's `Nutrition` key space rather than a
 * column per nutrient, following the same reasoning as the `food_nutrients`
 * vector (#1028): a fiber or sodium target is a registry row, not a migration.
 * **Partial by construction** — an absent key means the member set no target for
 * that nutrient, which is not the claim that their target is `0`.
 *
 * Uniqueness on `(profileId, effectiveFrom)` makes editing "the target that
 * started on 1 March" an upsert, so a member correcting today's numbers doesn't
 * accumulate same-day rows that the effective-date lookup would have to break
 * ties between.
 */
export const nutritionTargets = pgTable(
  'nutrition_targets',
  {
    id: pk(),
    profileId: fk()
      .notNull()
      .references(() => memberDietaryProfiles.id, { onDelete: 'cascade' }),
    /**
     * The date this target came into force, `YYYY-MM-DD` in the member's own
     * calendar. A plain date, not a timestamp: a target is a day-scoped fact and
     * a timezone-shifted midnight would move which week it scores.
     */
    effectiveFrom: date().notNull(),
    /** Daily targets keyed by `NutritionKey`. Absent key = no target set. */
    targets: jsonb().$type<Nutrition>().notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('nutrition_targets_profile_effective_uq').on(t.profileId, t.effectiveFrom),
    index('nutrition_targets_profile_idx').on(t.profileId),
  ],
);

export const nutritionTargetsRelations = relations(nutritionTargets, ({ one }) => ({
  profile: one(memberDietaryProfiles, {
    fields: [nutritionTargets.profileId],
    references: [memberDietaryProfiles.id],
  }),
}));

/**
 * Persisted identity for a built-in rule. The pure registry in
 * `src/lib/dietary-rules.ts` remains the curated source of truth; this table
 * provides a constrained FK target and records which ruleset version was
 * synchronized. Custom, user-entered rules deliberately live in their own
 * profile-owned table below.
 */
export const dietaryRules = pgTable(
  'dietary_rules',
  {
    id: varchar({ length: 80 }).primaryKey(),
    kind: varchar({ length: 24 }).notNull(),
    rulesetVersion: varchar({ length: 80 }).notNull(),
    ...timestamps(),
  },
  (t) => [
    check(
      'dietary_rules_kind_check',
      sql`${t.kind} in ('allergen', 'composition', 'confirmation-only')`,
    ),
  ],
);

/**
 * A named avoid rule owned by one dietary profile. Names and exact terms are
 * the minimum user-provided data needed for the feature; no health diagnosis,
 * rationale, prompt, or model trace is stored.
 */
export const customDietaryRestrictions = pgTable(
  'custom_dietary_restrictions',
  {
    id: pk(),
    profileId: fk()
      .notNull()
      .references(() => memberDietaryProfiles.id, { onDelete: 'cascade' }),
    name: varchar({ length: 80 }).notNull(),
    severity: varchar({ length: 24 }).notNull(),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index('custom_dietary_restrictions_profile_idx').on(t.profileId),
    unique('custom_dietary_restrictions_id_profile_uq').on(t.id, t.profileId),
    unique('custom_dietary_restrictions_profile_name_uq').on(t.profileId, t.name),
    check(
      'custom_dietary_restrictions_severity_check',
      sql`${t.severity} in ('allergy-intolerance', 'strict-avoidance', 'preference')`,
    ),
  ],
);

/**
 * Exact restriction terms and optional Family-suggested aliases. Suggested
 * terms cannot affect evaluation until `approved` is true; source separation
 * prevents a suggestion from masquerading as user-entered data.
 */
export const customDietaryRestrictionTerms = pgTable(
  'custom_dietary_restriction_terms',
  {
    id: pk(),
    restrictionId: fk()
      .notNull()
      .references(() => customDietaryRestrictions.id, { onDelete: 'cascade' }),
    term: varchar({ length: 300 }).notNull(),
    source: varchar({ length: 16 }).notNull(),
    approved: boolean().notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    unique('custom_dietary_restriction_terms_restriction_term_uq').on(t.restrictionId, t.term),
    index('custom_dietary_restriction_terms_restriction_idx').on(t.restrictionId),
    check(
      'custom_dietary_restriction_terms_source_check',
      sql`${t.source} in ('exact', 'suggested')`,
    ),
    check(
      'custom_dietary_restriction_terms_exact_approved_check',
      sql`${t.source} <> 'exact' or ${t.approved} = true`,
    ),
  ],
);

/**
 * Recipe-local structured corrections. Exactly one built-in/custom rule target
 * is present. A correction can resolve uncertainty but remains separate from
 * global food facts and cannot erase conflicting deterministic evidence.
 */
export const dietaryIngredientCorrections = pgTable(
  'dietary_ingredient_corrections',
  {
    id: pk(),
    ingredientId: fk()
      .notNull()
      .references(() => recipeIngredients.id, { onDelete: 'cascade' }),
    ruleId: varchar({ length: 80 }).references(() => dietaryRules.id, {
      onDelete: 'restrict',
    }),
    customRestrictionId: fk().references(() => customDietaryRestrictions.id, {
      onDelete: 'cascade',
    }),
    finding: varchar({ length: 16 }).notNull(),
    correctedFoodId: fk().references(() => foodItems.id, { onDelete: 'set null' }),
    actorId: fk().references(() => users.id, { onDelete: 'set null' }),
    revokedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index('dietary_ingredient_corrections_ingredient_idx').on(t.ingredientId),
    index('dietary_ingredient_corrections_rule_idx').on(t.ruleId),
    index('dietary_ingredient_corrections_custom_idx').on(t.customRestrictionId),
    index('dietary_ingredient_corrections_food_idx').on(t.correctedFoodId),
    index('dietary_ingredient_corrections_actor_idx').on(t.actorId),
    uniqueIndex('dietary_ingredient_corrections_active_rule_uq')
      .on(t.ingredientId, t.ruleId)
      .where(sql`${t.ruleId} is not null and ${t.revokedAt} is null`),
    uniqueIndex('dietary_ingredient_corrections_active_custom_uq')
      .on(t.ingredientId, t.customRestrictionId)
      .where(sql`${t.customRestrictionId} is not null and ${t.revokedAt} is null`),
    check(
      'dietary_ingredient_corrections_rule_target_check',
      sql`num_nonnulls(${t.ruleId}, ${t.customRestrictionId}) = 1`,
    ),
    check(
      'dietary_ingredient_corrections_finding_check',
      sql`${t.finding} in ('present', 'absent', 'possible', 'unresolved')`,
    ),
  ],
);

/**
 * Recipe-level result, versioned by all resolution inputs. Rows are retained
 * when invalidated so provenance remains auditable, while partial unique
 * indexes permit only one current result per target, source, and explicit
 * canonical/personal/profile scope.
 *
 * Built-in and custom targets are separate nullable FKs with an exactly-one
 * check. This avoids an unconstrained polymorphic `rule_id`.
 */
export const dietaryAssessments = pgTable(
  'dietary_assessments',
  {
    id: pk(),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    ruleId: varchar({ length: 80 }).references(() => dietaryRules.id, {
      onDelete: 'restrict',
    }),
    customRestrictionId: fk(),
    scope: varchar({ length: 16 }).notNull(),
    ownerUserId: fk().references(() => users.id, { onDelete: 'cascade' }),
    profileId: fk().references(() => memberDietaryProfiles.id, {
      onDelete: 'cascade',
    }),
    source: varchar({ length: 24 }).notNull(),
    verdict: varchar({ length: 16 }).notNull(),
    confidence: varchar({ length: 16 }),
    ingredientFingerprint: varchar({ length: 80 }).notNull(),
    analyzerVersion: varchar({ length: 80 }).notNull(),
    rulesetVersion: varchar({ length: 80 }).notNull(),
    restrictionTermsVersion: varchar({ length: 80 }),
    createdById: fk().references(() => users.id, { onDelete: 'set null' }),
    invalidatedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index('dietary_assessments_recipe_idx').on(t.recipeId),
    index('dietary_assessments_rule_idx').on(t.ruleId),
    index('dietary_assessments_custom_idx').on(t.customRestrictionId),
    index('dietary_assessments_owner_user_idx').on(t.ownerUserId),
    index('dietary_assessments_profile_idx').on(t.profileId),
    index('dietary_assessments_created_by_idx').on(t.createdById),
    uniqueIndex('dietary_assessments_active_canonical_rule_source_uq')
      .on(t.recipeId, t.ruleId, t.source, t.scope)
      .where(
        sql`${t.ruleId} is not null and ${t.scope} = 'canonical' and ${t.invalidatedAt} is null`,
      ),
    uniqueIndex('dietary_assessments_active_personal_rule_source_uq')
      .on(t.recipeId, t.ruleId, t.source, t.scope, t.ownerUserId)
      .where(
        sql`${t.ruleId} is not null and ${t.scope} = 'personal' and ${t.invalidatedAt} is null`,
      ),
    uniqueIndex('dietary_assessments_active_profile_rule_source_uq')
      .on(t.recipeId, t.ruleId, t.source, t.scope, t.profileId)
      .where(
        sql`${t.ruleId} is not null and ${t.scope} = 'profile' and ${t.invalidatedAt} is null`,
      ),
    uniqueIndex('dietary_assessments_active_profile_custom_source_uq')
      .on(t.recipeId, t.customRestrictionId, t.source, t.scope, t.profileId)
      .where(
        sql`${t.customRestrictionId} is not null and ${t.scope} = 'profile' and ${t.invalidatedAt} is null`,
      ),
    foreignKey({
      columns: [t.customRestrictionId, t.profileId],
      foreignColumns: [customDietaryRestrictions.id, customDietaryRestrictions.profileId],
      name: 'dietary_assessments_custom_restriction_profile_fk',
    }).onDelete('cascade'),
    check(
      'dietary_assessments_rule_target_check',
      sql`num_nonnulls(${t.ruleId}, ${t.customRestrictionId}) = 1`,
    ),
    check(
      'dietary_assessments_scope_check',
      sql`(
        (${t.scope} = 'canonical' and ${t.ownerUserId} is null and ${t.profileId} is null)
        or (${t.scope} = 'personal' and ${t.ownerUserId} is not null and ${t.profileId} is null)
        or (${t.scope} = 'profile' and ${t.ownerUserId} is null and ${t.profileId} is not null)
      )`,
    ),
    check(
      'dietary_assessments_custom_scope_check',
      sql`${t.customRestrictionId} is null or ${t.scope} = 'profile'`,
    ),
    check(
      'dietary_assessments_restriction_terms_version_check',
      sql`(${t.customRestrictionId} is null and ${t.restrictionTermsVersion} is null)
        or (${t.customRestrictionId} is not null and ${t.restrictionTermsVersion} is not null)`,
    ),
    check(
      'dietary_assessments_source_check',
      sql`${t.source} in ('deterministic', 'on-device', 'author-confirmed')`,
    ),
    check(
      'dietary_assessments_outcome_check',
      sql`(
        (${t.source} = 'author-confirmed' and ${t.verdict} = 'meets' and ${t.confidence} is null)
        or
        (${t.source} <> 'author-confirmed' and (
          (${t.verdict} = 'meets' and ${t.confidence} in ('high', 'medium'))
          or (${t.verdict} = 'unknown' and ${t.confidence} = 'needs-review')
          or (${t.verdict} = 'conflicts' and ${t.confidence} = 'high')
        ))
      )`,
    ),
  ],
);

/**
 * Ingredient-level structured facts supporting one assessment. Evidence source
 * is stored independently from assessment source so readers can apply source
 * precedence (especially deterministic conflicts) without flattening model,
 * confirmation, correction, and certification facts together.
 */
export const dietaryEvidence = pgTable(
  'dietary_evidence',
  {
    id: pk(),
    assessmentId: fk()
      .notNull()
      .references(() => dietaryAssessments.id, { onDelete: 'cascade' }),
    ingredientId: fk()
      .notNull()
      .references(() => recipeIngredients.id, { onDelete: 'cascade' }),
    finding: varchar({ length: 16 }).notNull(),
    source: varchar({ length: 24 }).notNull(),
    material: boolean().notNull().default(true),
    foodId: fk().references(() => foodItems.id, { onDelete: 'set null' }),
    correctionId: fk().references(() => dietaryIngredientCorrections.id, {
      onDelete: 'cascade',
    }),
    ...timestamps(),
  },
  (t) => [
    index('dietary_evidence_assessment_idx').on(t.assessmentId),
    index('dietary_evidence_ingredient_idx').on(t.ingredientId),
    index('dietary_evidence_food_idx').on(t.foodId),
    index('dietary_evidence_correction_idx').on(t.correctionId),
    unique('dietary_evidence_assessment_ingredient_source_finding_uq').on(
      t.assessmentId,
      t.ingredientId,
      t.source,
      t.finding,
    ),
    check(
      'dietary_evidence_finding_check',
      sql`${t.finding} in ('present', 'absent', 'possible', 'unresolved')`,
    ),
    check(
      'dietary_evidence_source_check',
      sql`${t.source} in ('food-link', 'text-match', 'on-device', 'author-confirmed', 'ingredient-correction', 'certification')`,
    ),
    check(
      'dietary_evidence_correction_source_check',
      sql`(${t.source} = 'ingredient-correction') = (${t.correctionId} is not null)`,
    ),
  ],
);

export const dietaryRulesRelations = relations(dietaryRules, ({ many }) => ({
  assessments: many(dietaryAssessments),
  corrections: many(dietaryIngredientCorrections),
}));

export const customDietaryRestrictionsRelations = relations(
  customDietaryRestrictions,
  ({ one, many }) => ({
    profile: one(memberDietaryProfiles, {
      fields: [customDietaryRestrictions.profileId],
      references: [memberDietaryProfiles.id],
    }),
    terms: many(customDietaryRestrictionTerms),
    assessments: many(dietaryAssessments),
    corrections: many(dietaryIngredientCorrections),
  }),
);

export const customDietaryRestrictionTermsRelations = relations(
  customDietaryRestrictionTerms,
  ({ one }) => ({
    restriction: one(customDietaryRestrictions, {
      fields: [customDietaryRestrictionTerms.restrictionId],
      references: [customDietaryRestrictions.id],
    }),
  }),
);

export const dietaryIngredientCorrectionsRelations = relations(
  dietaryIngredientCorrections,
  ({ one, many }) => ({
    ingredient: one(recipeIngredients, {
      fields: [dietaryIngredientCorrections.ingredientId],
      references: [recipeIngredients.id],
    }),
    rule: one(dietaryRules, {
      fields: [dietaryIngredientCorrections.ruleId],
      references: [dietaryRules.id],
    }),
    customRestriction: one(customDietaryRestrictions, {
      fields: [dietaryIngredientCorrections.customRestrictionId],
      references: [customDietaryRestrictions.id],
    }),
    correctedFood: one(foodItems, {
      fields: [dietaryIngredientCorrections.correctedFoodId],
      references: [foodItems.id],
    }),
    actor: one(users, {
      fields: [dietaryIngredientCorrections.actorId],
      references: [users.id],
    }),
    evidence: many(dietaryEvidence),
  }),
);

export const dietaryAssessmentsRelations = relations(dietaryAssessments, ({ one, many }) => ({
  recipe: one(recipes, {
    fields: [dietaryAssessments.recipeId],
    references: [recipes.id],
  }),
  rule: one(dietaryRules, {
    fields: [dietaryAssessments.ruleId],
    references: [dietaryRules.id],
  }),
  customRestriction: one(customDietaryRestrictions, {
    fields: [dietaryAssessments.customRestrictionId],
    references: [customDietaryRestrictions.id],
  }),
  profile: one(memberDietaryProfiles, {
    fields: [dietaryAssessments.profileId],
    references: [memberDietaryProfiles.id],
  }),
  owner: one(users, {
    fields: [dietaryAssessments.ownerUserId],
    references: [users.id],
  }),
  createdBy: one(users, {
    fields: [dietaryAssessments.createdById],
    references: [users.id],
  }),
  evidence: many(dietaryEvidence),
}));

export const dietaryEvidenceRelations = relations(dietaryEvidence, ({ one }) => ({
  assessment: one(dietaryAssessments, {
    fields: [dietaryEvidence.assessmentId],
    references: [dietaryAssessments.id],
  }),
  ingredient: one(recipeIngredients, {
    fields: [dietaryEvidence.ingredientId],
    references: [recipeIngredients.id],
  }),
  food: one(foodItems, {
    fields: [dietaryEvidence.foodId],
    references: [foodItems.id],
  }),
  correction: one(dietaryIngredientCorrections, {
    fields: [dietaryEvidence.correctionId],
    references: [dietaryIngredientCorrections.id],
  }),
}));

export type NutritionTargetRow = typeof nutritionTargets.$inferSelect;
export type NewNutritionTarget = typeof nutritionTargets.$inferInsert;

export type MemberDietaryProfile = typeof memberDietaryProfiles.$inferSelect;
export type NewMemberDietaryProfile = typeof memberDietaryProfiles.$inferInsert;
export type DietaryRuleRow = typeof dietaryRules.$inferSelect;
export type NewDietaryRule = typeof dietaryRules.$inferInsert;
export type CustomDietaryRestrictionRow = typeof customDietaryRestrictions.$inferSelect;
export type NewCustomDietaryRestriction = typeof customDietaryRestrictions.$inferInsert;
export type CustomDietaryRestrictionTermRow = typeof customDietaryRestrictionTerms.$inferSelect;
export type NewCustomDietaryRestrictionTerm = typeof customDietaryRestrictionTerms.$inferInsert;
export type DietaryIngredientCorrectionRow = typeof dietaryIngredientCorrections.$inferSelect;
export type NewDietaryIngredientCorrection = typeof dietaryIngredientCorrections.$inferInsert;
export type DietaryAssessmentRow = typeof dietaryAssessments.$inferSelect;
export type NewDietaryAssessment = typeof dietaryAssessments.$inferInsert;
export type DietaryEvidenceRow = typeof dietaryEvidence.$inferSelect;
export type NewDietaryEvidence = typeof dietaryEvidence.$inferInsert;
