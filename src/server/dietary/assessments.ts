import 'server-only';

import { createId } from '@paralleldrive/cuid2';
import { and, eq, inArray, isNotNull, isNull, ne, or, type SQL } from 'drizzle-orm';

import {
  dietaryAssessmentScopeSchema,
  dietaryAssessmentSourceSchema,
  dietaryConfidenceSchema,
  dietarySubjectScopeSchema,
  customDietaryRestrictionTermSchema,
  dietaryIngredientCorrectionSchema,
  dietaryIngredientEvidenceSchema,
  dietaryIngredientInputSchema,
  dietaryLinkedFoodInputSchema,
  onDeviceDietarySubmissionSchema,
  dietaryVerdictSchema,
  type DietaryIngredientCorrection,
  type DietaryIngredientInput,
  type OnDeviceDietarySubmission,
} from '~/lib/dietary-assessment';
import {
  aggregateDietaryEvidence,
  assessIngredientsDeterministically,
  type AggregatedDietaryAssessment,
} from '~/lib/dietary-evidence';
import {
  customRestrictionTermsFingerprint,
  dietaryIngredientFingerprint,
} from '~/lib/dietary-fingerprint';
import {
  projectLegacyDietaryTags,
  selectEffectiveDietaryAssessment,
} from '~/lib/dietary-projection';
import {
  BUILT_IN_DIETARY_RULES,
  DIETARY_ALGORITHM_VERSION,
  dietaryRulesetVersion,
  isBuiltInDietaryRuleId,
} from '~/lib/dietary-rules';
import { DIETARY_MODEL } from '~/config/on-device-dietary';
import { FOOD_ITEMS, foodSlug } from '~/lib/food-db';
import { assertOnDeviceSubmissionContext } from '~/lib/dietary-on-device-validation';
import { requireEntitlement } from '~/server/billing/entitlements';
import { db } from '~/server/db';
import {
  dietaryAssessments,
  dietaryEvidence,
  dietaryIngredientCorrections,
  customDietaryRestrictions,
  foodItems,
  groupMembers,
  memberDietaryProfiles,
  recipeCreators,
  recipeIngredients,
  recipes,
  type User,
} from '~/server/db/schema';
import { DomainError } from '~/server/errors';
import { viewerHoldsRecipeShareLink } from '~/server/recipes/share-token';

type DbExecutor = typeof db;
type MemberRole = 'owner' | 'admin' | 'member' | 'kid';

export type DietaryRecipeAccess = {
  actorId: string | null;
  authorId: string | null;
  visibility: string;
  acceptedCreator: boolean;
  groupRole: MemberRole | null;
};

export function canReadCanonicalDietaryAssessment(access: DietaryRecipeAccess): boolean {
  return (
    access.visibility === 'public' ||
    (access.actorId != null && access.authorId === access.actorId) ||
    access.acceptedCreator ||
    (access.visibility === 'group' && access.groupRole != null)
  );
}

export function canManageCanonicalDietaryAssessment(access: DietaryRecipeAccess): boolean {
  return access.actorId != null && (access.authorId === access.actorId || access.acceptedCreator);
}

export function canReadOwnedDietaryScope(
  actorId: string | null,
  ownerUserId: string | null,
): boolean {
  return actorId != null && actorId === ownerUserId;
}

export type OnDeviceDietaryJob = {
  recipeId: string;
  ingredientFingerprint: string;
  rulesetVersion: string;
  ingredients: { ingredientId: string; text: string }[];
  candidates: {
    foodId: string;
    text: string;
    evidence: { ruleId: string; finding: 'present' | 'absent' | 'possible' | 'unresolved' }[];
  }[];
};

async function recipeAccess(
  executor: DbExecutor,
  recipeId: string,
  actorId: string | null,
): Promise<DietaryRecipeAccess> {
  const recipe = await executor.query.recipes.findFirst({
    where: and(eq(recipes.id, recipeId), isNull(recipes.deletedAt)),
    columns: { authorId: true, visibility: true, groupId: true },
  });
  if (!recipe) throw new DomainError('NOT_FOUND');

  const [creator, membership] = actorId
    ? await Promise.all([
        executor.query.recipeCreators.findFirst({
          where: and(
            eq(recipeCreators.recipeId, recipeId),
            eq(recipeCreators.userId, actorId),
            eq(recipeCreators.status, 'accepted'),
          ),
          columns: { id: true },
        }),
        recipe.groupId
          ? executor.query.groupMembers.findFirst({
              where: and(
                eq(groupMembers.groupId, recipe.groupId),
                eq(groupMembers.userId, actorId),
              ),
              columns: { role: true },
            })
          : Promise.resolve(undefined),
      ])
    : [undefined, undefined];

  return {
    actorId,
    authorId: recipe.authorId,
    visibility: recipe.visibility,
    acceptedCreator: Boolean(creator),
    groupRole: membership?.role ?? null,
  };
}

async function assertRecipeManager(
  executor: DbExecutor,
  recipeId: string,
  actorId: string,
): Promise<void> {
  const access = await recipeAccess(executor, recipeId, actorId);
  if (!canManageCanonicalDietaryAssessment(access)) throw new DomainError('NOT_FOUND');
}

async function lockRecipeForDietaryWrite(executor: DbExecutor, recipeId: string): Promise<void> {
  await executor
    .select({ id: recipes.id })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .for('update');
}

async function dietaryInputs(
  executor: DbExecutor,
  recipeId: string,
): Promise<DietaryIngredientInput[]> {
  const rows = await executor
    .select({
      ingredientId: recipeIngredients.id,
      item: recipeIngredients.item,
      amount: recipeIngredients.quantity,
      amountMax: recipeIngredients.quantityMax,
      unit: recipeIngredients.unit,
      prep: recipeIngredients.prep,
      foodId: foodItems.id,
      foodSlug: foodItems.slug,
      foodCategory: foodItems.category,
      foodAllergens: foodItems.allergens,
    })
    .from(recipeIngredients)
    .leftJoin(foodItems, eq(recipeIngredients.foodId, foodItems.id))
    .where(eq(recipeIngredients.recipeId, recipeId));

  return rows.map(toDietaryIngredientInput);
}

type DietaryInputRow = {
  ingredientId: string;
  item: string;
  amount: number | null;
  amountMax: number | null;
  unit: string | null;
  prep: string | null;
  foodId: string | null;
  foodSlug: string | null;
  foodCategory: string | null;
  foodAllergens: string[] | null;
};

function toDietaryIngredientInput(row: DietaryInputRow): DietaryIngredientInput {
  const linkedFood = dietaryLinkedFoodInputSchema.safeParse(
    row.foodId && row.foodSlug && row.foodCategory
      ? {
          id: row.foodId,
          slug: row.foodSlug,
          category: row.foodCategory,
          allergens: row.foodAllergens,
        }
      : null,
  );
  return dietaryIngredientInputSchema.parse({
    ingredientId: row.ingredientId,
    item: row.item,
    amount: row.amount,
    amountMax: row.amountMax,
    unit: row.unit,
    prep: row.prep,
    linkedFood: linkedFood.success ? linkedFood.data : null,
  });
}

/**
 * Return the minimum same-origin input needed by the local worker. This is
 * authorized recipe data the viewer can already read; it is never forwarded
 * to the model host or analytics.
 */
export async function getOnDeviceDietaryJob(
  recipeId: string,
  actor: User,
): Promise<OnDeviceDietaryJob> {
  await requireEntitlement(actor, 'advancedDietaryAnalysis');
  const access = await recipeAccess(db, recipeId, actor.id);
  if (!canReadCanonicalDietaryAssessment(access)) throw new DomainError('NOT_FOUND');

  const [ingredients, foods] = await Promise.all([
    dietaryInputs(db, recipeId),
    db.query.foodItems.findMany({
      columns: { id: true, slug: true, name: true, category: true, allergens: true },
    }),
  ]);
  const aliasesBySlug = new Map(
    FOOD_ITEMS.map((food) => [foodSlug(food.name), [food.name, ...food.aliases].join(' | ')]),
  );

  return {
    recipeId,
    ingredientFingerprint: dietaryIngredientFingerprint(ingredients),
    rulesetVersion: dietaryRulesetVersion(),
    ingredients: ingredients
      .filter((ingredient) =>
        BUILT_IN_DIETARY_RULES.some((rule) =>
          assessIngredientsDeterministically([ingredient], rule.id).evidence.some(
            (item) => item.finding === 'unresolved',
          ),
        ),
      )
      .map((ingredient) => ({ ingredientId: ingredient.ingredientId, text: ingredient.item })),
    candidates: foods.map((food) => {
      const synthetic = dietaryIngredientInputSchema.parse({
        ingredientId: 'candidate',
        item: '__model_candidate__',
        amount: null,
        amountMax: null,
        unit: null,
        prep: null,
        linkedFood: food,
      });
      return {
        foodId: food.id,
        text: aliasesBySlug.get(food.slug) ?? food.name,
        evidence: BUILT_IN_DIETARY_RULES.flatMap((rule) =>
          assessIngredientsDeterministically([synthetic], rule.id).evidence.flatMap((item) =>
            item.finding === 'unresolved' ? [] : [{ ruleId: rule.id, finding: item.finding }],
          ),
        ),
      };
    }),
  };
}

function modelEvidenceForCandidate(
  ingredient: DietaryIngredientInput,
  food: typeof foodItems.$inferSelect,
  ruleId: string,
) {
  if (!isBuiltInDietaryRuleId(ruleId)) throw new DomainError('INVALID');
  const synthetic = dietaryIngredientInputSchema.parse({
    ...ingredient,
    item: '__model_candidate__',
    linkedFood: {
      id: food.id,
      slug: food.slug,
      category: food.category,
      allergens: food.allergens,
    },
  });
  const findings = assessIngredientsDeterministically([synthetic], ruleId).evidence.filter(
    (item) => item.finding !== 'unresolved',
  );
  if (findings.length !== 1) throw new DomainError('INVALID');
  return dietaryIngredientEvidenceSchema.parse({
    ...findings[0],
    source: 'on-device',
    foodId: food.id,
    correctionId: null,
  });
}

/**
 * Accept structured local-model output as untrusted input. The server rechecks
 * entitlement, recipe access, freshness, food-node identity, every categorical
 * finding, and the final veto-based verdict before persisting personal rows.
 */
export async function saveOnDeviceDietaryAssessment(
  actor: User,
  value: OnDeviceDietarySubmission,
): Promise<void> {
  const submission = onDeviceDietarySubmissionSchema.parse(value);
  await requireEntitlement(actor, 'advancedDietaryAnalysis');

  await db.transaction(async (tx) => {
    const executor = tx as unknown as DbExecutor;
    const access = await recipeAccess(executor, submission.recipeId, actor.id);
    if (!canReadCanonicalDietaryAssessment(access)) throw new DomainError('NOT_FOUND');
    await lockRecipeForDietaryWrite(executor, submission.recipeId);

    const ingredients = await dietaryInputs(executor, submission.recipeId);
    const ingredientsById = new Map(
      ingredients.map((ingredient) => [ingredient.ingredientId, ingredient]),
    );
    const foodIds = [...new Set(submission.evidence.map((item) => item.foodId))];
    const foods =
      foodIds.length === 0
        ? []
        : await executor.query.foodItems.findMany({
            where: inArray(foodItems.id, foodIds),
          });
    const foodsById = new Map(foods.map((food) => [food.id, food]));
    try {
      assertOnDeviceSubmissionContext({
        submission,
        expectedFingerprint: dietaryIngredientFingerprint(ingredients),
        expectedRulesetVersion: dietaryRulesetVersion(),
        allowedAnalyzerVersions: new Set([DIETARY_MODEL.analyzerVersion]),
        ingredientIds: new Set(ingredientsById.keys()),
        foodIds: new Set(foodsById.keys()),
      });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      throw new DomainError('INVALID');
    }

    const acceptedEvidence = submission.evidence.map((item) => {
      const ingredient = ingredientsById.get(item.ingredientId);
      const food = foodsById.get(item.foodId);
      if (!ingredient || !food) throw new DomainError('INVALID');
      const derived = modelEvidenceForCandidate(ingredient, food, item.ruleId);
      if (derived.finding !== item.finding) throw new DomainError('INVALID');
      return derived;
    });
    const ruleIds = [...new Set(acceptedEvidence.map((item) => item.ruleId))];
    const now = new Date();

    for (const ruleId of ruleIds) {
      if (!isBuiltInDietaryRuleId(ruleId)) throw new DomainError('INVALID');
      const deterministic = assessIngredientsDeterministically(ingredients, ruleId);
      const assessment = aggregateDietaryEvidence({
        ruleId,
        ingredientIds: ingredients.map((ingredient) => ingredient.ingredientId),
        evidence: [
          ...deterministic.evidence,
          ...acceptedEvidence.filter((item) => item.ruleId === ruleId),
        ],
      });
      const confidence =
        assessment.verdict === 'meets' && assessment.confidence === 'high'
          ? 'medium'
          : assessment.confidence;

      await executor
        .update(dietaryAssessments)
        .set({ invalidatedAt: now, updatedAt: now })
        .where(
          and(
            eq(dietaryAssessments.recipeId, submission.recipeId),
            eq(dietaryAssessments.ruleId, ruleId),
            eq(dietaryAssessments.scope, 'personal'),
            eq(dietaryAssessments.ownerUserId, actor.id),
            eq(dietaryAssessments.source, 'on-device'),
            isNull(dietaryAssessments.invalidatedAt),
          ),
        );
      const [created] = await executor
        .insert(dietaryAssessments)
        .values({
          recipeId: submission.recipeId,
          ruleId,
          customRestrictionId: null,
          scope: 'personal',
          ownerUserId: actor.id,
          profileId: null,
          source: 'on-device',
          verdict: assessment.verdict,
          confidence,
          ingredientFingerprint: submission.ingredientFingerprint,
          analyzerVersion: submission.analyzerVersion,
          rulesetVersion: submission.rulesetVersion,
          restrictionTermsVersion: null,
          createdById: actor.id,
        })
        .returning({ id: dietaryAssessments.id });
      if (!created) throw new DomainError('INVALID');
      const evidence = acceptedEvidence.filter((item) => item.ruleId === ruleId);
      if (evidence.length > 0) {
        await executor.insert(dietaryEvidence).values(
          evidence.map((item) => ({
            assessmentId: created.id,
            ingredientId: item.ingredientId,
            finding: item.finding,
            source: 'on-device',
            material: item.material,
            foodId: item.foodId,
            correctionId: null,
          })),
        );
      }
    }
  });
}

function correctionEvidence(
  correction: typeof dietaryIngredientCorrections.$inferSelect,
  ruleId: string,
) {
  return dietaryIngredientEvidenceSchema.parse({
    ingredientId: correction.ingredientId,
    ruleId,
    finding: correction.finding,
    source: 'ingredient-correction',
    material: true,
    foodId: correction.correctedFoodId,
    correctionId: correction.id,
  });
}

async function syncLegacyDietaryTags(
  executor: DbExecutor,
  recipeId: string,
  ingredientFingerprint: string,
  rulesetVersion: string,
): Promise<void> {
  const rows = await executor.query.dietaryAssessments.findMany({
    where: and(
      eq(dietaryAssessments.recipeId, recipeId),
      eq(dietaryAssessments.scope, 'canonical'),
      isNull(dietaryAssessments.customRestrictionId),
      eq(dietaryAssessments.ingredientFingerprint, ingredientFingerprint),
      eq(dietaryAssessments.rulesetVersion, rulesetVersion),
      isNull(dietaryAssessments.invalidatedAt),
    ),
    columns: {
      ruleId: true,
      customRestrictionId: true,
      scope: true,
      source: true,
      verdict: true,
      confidence: true,
      invalidatedAt: true,
    },
  });
  const projections = rows.map((row) => ({
    ...row,
    scope: dietaryAssessmentScopeSchema.parse(row.scope),
    source: dietaryAssessmentSourceSchema.parse(row.source),
    verdict: dietaryVerdictSchema.parse(row.verdict),
    confidence: dietaryConfidenceSchema.nullable().parse(row.confidence),
  }));
  const dietaryTags = projectLegacyDietaryTags(projections);
  await executor
    .update(recipes)
    .set({ dietaryTags: dietaryTags.length > 0 ? dietaryTags : null })
    .where(eq(recipes.id, recipeId));
}

/**
 * Rebuild canonical deterministic assessments inside an already-authorized
 * recipe write. The access check is repeated here so a future caller cannot
 * accidentally turn this internal primitive into an authorization bypass.
 */
export async function refreshDeterministicDietaryAssessmentsForAuthorizedWrite(
  executor: DbExecutor,
  recipeId: string,
  actorId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  await assertRecipeManager(executor, recipeId, actorId);
  await lockRecipeForDietaryWrite(executor, recipeId);

  const ingredients = await dietaryInputs(executor, recipeId);
  const ingredientIds = ingredients.map((ingredient) => ingredient.ingredientId);
  const fingerprint = dietaryIngredientFingerprint(ingredients);
  const rulesetVersion = dietaryRulesetVersion();
  const currentDeterministic = await executor.query.dietaryAssessments.findMany({
    where: and(
      eq(dietaryAssessments.recipeId, recipeId),
      eq(dietaryAssessments.scope, 'canonical'),
      eq(dietaryAssessments.source, 'deterministic'),
      eq(dietaryAssessments.ingredientFingerprint, fingerprint),
      eq(dietaryAssessments.rulesetVersion, rulesetVersion),
      isNull(dietaryAssessments.invalidatedAt),
    ),
    columns: { ruleId: true },
  });
  const currentRuleIds = new Set(currentDeterministic.map((assessment) => assessment.ruleId));
  if (
    !options.force &&
    currentRuleIds.size === BUILT_IN_DIETARY_RULES.length &&
    BUILT_IN_DIETARY_RULES.every((rule) => currentRuleIds.has(rule.id))
  ) {
    await syncLegacyDietaryTags(executor, recipeId, fingerprint, rulesetVersion);
    return;
  }

  const corrections =
    ingredientIds.length === 0
      ? []
      : await executor.query.dietaryIngredientCorrections.findMany({
          where: and(
            inArray(dietaryIngredientCorrections.ingredientId, ingredientIds),
            isNull(dietaryIngredientCorrections.revokedAt),
          ),
        });
  const now = new Date();

  await executor
    .update(dietaryAssessments)
    .set({ invalidatedAt: now, updatedAt: now })
    .where(
      and(
        eq(dietaryAssessments.recipeId, recipeId),
        isNull(dietaryAssessments.invalidatedAt),
        or(
          ne(dietaryAssessments.ingredientFingerprint, fingerprint),
          ne(dietaryAssessments.rulesetVersion, rulesetVersion),
        ),
      ),
    );
  await executor
    .update(dietaryAssessments)
    .set({ invalidatedAt: now, updatedAt: now })
    .where(
      and(
        eq(dietaryAssessments.recipeId, recipeId),
        eq(dietaryAssessments.scope, 'canonical'),
        eq(dietaryAssessments.source, 'deterministic'),
        isNull(dietaryAssessments.invalidatedAt),
      ),
    );

  const assessmentRows: Array<typeof dietaryAssessments.$inferInsert> = [];
  const evidenceRows: Array<typeof dietaryEvidence.$inferInsert> = [];

  for (const rule of BUILT_IN_DIETARY_RULES) {
    const deterministic = assessIngredientsDeterministically(ingredients, rule.id);
    const matchingCorrections = corrections
      .filter((correction) => correction.ruleId === rule.id)
      .map((correction) => correctionEvidence(correction, rule.id));
    const assessment =
      matchingCorrections.length === 0
        ? deterministic
        : assessIngredientsDeterministicallyWithCorrections(
            ingredients,
            rule.id,
            deterministic,
            matchingCorrections,
          );
    const assessmentId = createId();
    assessmentRows.push({
      id: assessmentId,
      recipeId,
      ruleId: rule.id,
      customRestrictionId: null,
      scope: 'canonical',
      ownerUserId: null,
      profileId: null,
      source: 'deterministic',
      verdict: assessment.verdict,
      confidence: assessment.confidence,
      ingredientFingerprint: fingerprint,
      analyzerVersion: `deterministic-${DIETARY_ALGORITHM_VERSION}`,
      rulesetVersion,
      restrictionTermsVersion: null,
      createdById: actorId,
    });
    evidenceRows.push(
      ...assessment.evidence.map((item) => ({
        assessmentId,
        ingredientId: item.ingredientId,
        finding: item.finding,
        source: item.source,
        material: item.material,
        foodId: item.foodId,
        correctionId: item.correctionId,
      })),
    );
  }
  if (assessmentRows.length > 0) {
    await executor.insert(dietaryAssessments).values(assessmentRows);
  }
  if (evidenceRows.length > 0) {
    await executor.insert(dietaryEvidence).values(evidenceRows);
  }

  await executor
    .delete(dietaryAssessments)
    .where(
      and(
        eq(dietaryAssessments.recipeId, recipeId),
        eq(dietaryAssessments.scope, 'canonical'),
        eq(dietaryAssessments.source, 'deterministic'),
        isNotNull(dietaryAssessments.invalidatedAt),
      ),
    );
  await syncLegacyDietaryTags(executor, recipeId, fingerprint, rulesetVersion);
}

function assessIngredientsDeterministicallyWithCorrections(
  ingredients: readonly DietaryIngredientInput[],
  ruleId: Parameters<typeof assessIngredientsDeterministically>[1],
  deterministic: AggregatedDietaryAssessment,
  corrections: ReturnType<typeof correctionEvidence>[],
): AggregatedDietaryAssessment {
  return {
    ...deterministic,
    ...importedAggregate(ruleId, ingredients, [...deterministic.evidence, ...corrections]),
  };
}

function importedAggregate(
  ruleId: string,
  ingredients: readonly DietaryIngredientInput[],
  evidence: ReturnType<typeof correctionEvidence>[],
) {
  // Kept behind a local wrapper so the write path has one obvious aggregation
  // boundary for deterministic and reviewed evidence.
  return aggregateDietaryEvidence({
    ruleId,
    ingredientIds: ingredients.map((ingredient) => ingredient.ingredientId),
    evidence,
  });
}

/**
 * Add or replace a recipe-local correction. Built-in corrections require
 * recipe edit authority. Custom-rule corrections additionally require
 * ownership of the profile that owns the restriction.
 */
export async function saveDietaryIngredientCorrection(
  actorId: string,
  value: DietaryIngredientCorrection,
  subjectScope?: unknown,
): Promise<void> {
  const correction = dietaryIngredientCorrectionSchema.parse(value);
  if (correction.customRestrictionId) {
    dietarySubjectScopeSchema.parse(subjectScope);
  }
  await db.transaction(async (tx) => {
    const executor = tx as unknown as DbExecutor;
    const ingredient = await executor.query.recipeIngredients.findFirst({
      where: eq(recipeIngredients.id, correction.ingredientId),
      columns: { recipeId: true },
    });
    if (!ingredient) throw new DomainError('NOT_FOUND');
    await assertRecipeManager(executor, ingredient.recipeId, actorId);
    await lockRecipeForDietaryWrite(executor, ingredient.recipeId);

    if (correction.ruleId && !isBuiltInDietaryRuleId(correction.ruleId)) {
      throw new DomainError('INVALID');
    }
    if (correction.customRestrictionId) {
      const restriction = await executor.query.customDietaryRestrictions.findFirst({
        where: eq(customDietaryRestrictions.id, correction.customRestrictionId),
        with: { profile: { columns: { userId: true } } },
      });
      if (!restriction || restriction.profile.userId !== actorId) {
        throw new DomainError('NOT_FOUND');
      }
    }

    const target = correction.ruleId
      ? eq(dietaryIngredientCorrections.ruleId, correction.ruleId)
      : eq(dietaryIngredientCorrections.customRestrictionId, correction.customRestrictionId!);
    const now = new Date();
    await executor
      .update(dietaryIngredientCorrections)
      .set({ revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(dietaryIngredientCorrections.ingredientId, correction.ingredientId),
          target,
          isNull(dietaryIngredientCorrections.revokedAt),
        ),
      );
    await executor.insert(dietaryIngredientCorrections).values({
      ...correction,
      actorId,
    });
    await refreshDeterministicDietaryAssessmentsForAuthorizedWrite(
      executor,
      ingredient.recipeId,
      actorId,
      { force: true },
    );
  });
}

export type PublicDietaryAssessment = {
  ruleId: string;
  source: 'deterministic' | 'on-device' | 'author-confirmed';
  verdict: 'meets' | 'conflicts' | 'unknown';
  confidence: 'high' | 'medium' | 'needs-review' | null;
};

async function dietaryInputsForRecipes(
  recipeIds: readonly string[],
): Promise<Map<string, DietaryIngredientInput[]>> {
  const inputsByRecipeId = new Map(
    recipeIds.map((recipeId) => [recipeId, [] as DietaryIngredientInput[]]),
  );
  if (recipeIds.length === 0) return inputsByRecipeId;

  const rows = await db
    .select({
      recipeId: recipeIngredients.recipeId,
      ingredientId: recipeIngredients.id,
      item: recipeIngredients.item,
      amount: recipeIngredients.quantity,
      amountMax: recipeIngredients.quantityMax,
      unit: recipeIngredients.unit,
      prep: recipeIngredients.prep,
      foodId: foodItems.id,
      foodSlug: foodItems.slug,
      foodCategory: foodItems.category,
      foodAllergens: foodItems.allergens,
    })
    .from(recipeIngredients)
    .leftJoin(foodItems, eq(recipeIngredients.foodId, foodItems.id))
    .where(inArray(recipeIngredients.recipeId, recipeIds));

  for (const row of rows) {
    inputsByRecipeId.get(row.recipeId)?.push(toDietaryIngredientInput(row));
  }
  return inputsByRecipeId;
}

async function findAssessmentRows(recipeIds: readonly string[], readableScopes: SQL) {
  if (recipeIds.length === 0) return [];
  return db.query.dietaryAssessments.findMany({
    where: and(
      inArray(dietaryAssessments.recipeId, recipeIds),
      isNull(dietaryAssessments.invalidatedAt),
      readableScopes,
    ),
    with: { evidence: true },
  });
}

export type DietaryAssessmentReadRow = Awaited<ReturnType<typeof findAssessmentRows>>[number];

export type DietaryAssessmentReadBatch = {
  ingredientsByRecipeId: Map<string, DietaryIngredientInput[]>;
  assessmentsByRecipeId: Map<string, DietaryAssessmentReadRow[]>;
};

export type DietaryAssessmentReadAuthorization = {
  shareToken?: string | null;
};

/**
 * Load all dietary presentation inputs for a set of already-selected recipes.
 * Authorization, freshness, and profile ownership are applied once to the
 * complete set so card feeds use a fixed number of queries rather than one
 * authorization/profile/assessment sequence per card.
 */
export async function loadDietaryAssessmentReadBatch(
  recipeIds: readonly string[],
  actorId: string | null,
  authorization: DietaryAssessmentReadAuthorization = {},
): Promise<DietaryAssessmentReadBatch> {
  const ids = [...new Set(recipeIds)];
  const empty = {
    ingredientsByRecipeId: new Map<string, DietaryIngredientInput[]>(),
    assessmentsByRecipeId: new Map<string, DietaryAssessmentReadRow[]>(),
  };
  if (ids.length === 0) return empty;

  const recipeRows = await db.query.recipes.findMany({
    where: and(inArray(recipes.id, ids), isNull(recipes.deletedAt)),
    columns: {
      id: true,
      authorId: true,
      visibility: true,
      groupId: true,
      shareToken: true,
      shareLinkEnabled: true,
    },
  });
  const recipesById = new Map(recipeRows.map((recipe) => [recipe.id, recipe]));
  if (ids.some((recipeId) => !recipesById.has(recipeId))) throw new DomainError('NOT_FOUND');

  let profileIds: string[] = [];
  if (actorId) {
    const [creators, memberships] = await Promise.all([
      db.query.recipeCreators.findMany({
        where: and(
          inArray(recipeCreators.recipeId, ids),
          eq(recipeCreators.userId, actorId),
          eq(recipeCreators.status, 'accepted'),
        ),
        columns: { recipeId: true },
      }),
      db.query.groupMembers.findMany({
        where: eq(groupMembers.userId, actorId),
        columns: { groupId: true, role: true },
      }),
    ]);
    const creatorRecipeIds = new Set(creators.map((creator) => creator.recipeId));
    const membershipByGroupId = new Map(
      memberships.map((membership) => [membership.groupId, membership.role]),
    );
    for (const recipeId of ids) {
      const recipe = recipesById.get(recipeId)!;
      const access: DietaryRecipeAccess = {
        actorId,
        authorId: recipe.authorId,
        visibility: recipe.visibility,
        acceptedCreator: creatorRecipeIds.has(recipeId),
        groupRole: recipe.groupId ? (membershipByGroupId.get(recipe.groupId) ?? null) : null,
      };
      if (
        !canReadCanonicalDietaryAssessment(access) &&
        !viewerHoldsRecipeShareLink(recipe, authorization.shareToken)
      ) {
        throw new DomainError('NOT_FOUND');
      }
    }
    const profiles = await db.query.memberDietaryProfiles.findMany({
      where: eq(memberDietaryProfiles.userId, actorId),
      columns: { id: true },
    });
    profileIds = profiles.map((profile) => profile.id);
  } else {
    for (const recipeId of ids) {
      const recipe = recipesById.get(recipeId)!;
      const canReadWithoutToken = canReadCanonicalDietaryAssessment({
        actorId: null,
        authorId: recipe.authorId,
        visibility: recipe.visibility,
        acceptedCreator: false,
        groupRole: null,
      });
      if (!canReadWithoutToken && !viewerHoldsRecipeShareLink(recipe, authorization.shareToken)) {
        throw new DomainError('NOT_FOUND');
      }
    }
  }

  const restrictionsPromise =
    actorId && profileIds.length > 0
      ? db.query.customDietaryRestrictions.findMany({
          where: inArray(customDietaryRestrictions.profileId, profileIds),
          columns: { id: true },
          with: {
            terms: {
              columns: { term: true, source: true, approved: true },
            },
          },
        })
      : Promise.resolve([]);
  const ownedScopes = actorId
    ? profileIds.length === 0
      ? and(eq(dietaryAssessments.scope, 'personal'), eq(dietaryAssessments.ownerUserId, actorId))
      : or(
          and(
            eq(dietaryAssessments.scope, 'personal'),
            eq(dietaryAssessments.ownerUserId, actorId),
          ),
          and(
            eq(dietaryAssessments.scope, 'profile'),
            inArray(dietaryAssessments.profileId, profileIds),
          ),
        )
    : undefined;
  const readableScopes = actorId
    ? or(eq(dietaryAssessments.scope, 'canonical'), ownedScopes)!
    : and(
        eq(dietaryAssessments.scope, 'canonical'),
        isNull(dietaryAssessments.ownerUserId),
        isNull(dietaryAssessments.profileId),
        isNull(dietaryAssessments.customRestrictionId),
      )!;
  const [ingredientsByRecipeId, restrictions, rows] = await Promise.all([
    dietaryInputsForRecipes(ids),
    restrictionsPromise,
    findAssessmentRows(ids, readableScopes),
  ]);
  const restrictionVersions = new Map(
    restrictions.map((restriction) => [
      restriction.id,
      customRestrictionTermsFingerprint(
        restriction.terms.map((term) => customDietaryRestrictionTermSchema.parse(term)),
      ),
    ]),
  );
  const rulesetVersion = dietaryRulesetVersion();
  const ingredientFingerprints = new Map(
    ids.map((recipeId) => [
      recipeId,
      dietaryIngredientFingerprint(ingredientsByRecipeId.get(recipeId) ?? []),
    ]),
  );
  const assessmentsByRecipeId = new Map(
    ids.map((recipeId) => [recipeId, [] as DietaryAssessmentReadRow[]]),
  );
  for (const row of rows) {
    if (
      row.ingredientFingerprint !== ingredientFingerprints.get(row.recipeId) ||
      row.rulesetVersion !== rulesetVersion ||
      (row.customRestrictionId != null &&
        restrictionVersions.get(row.customRestrictionId) !== row.restrictionTermsVersion)
    ) {
      continue;
    }
    assessmentsByRecipeId.get(row.recipeId)?.push(row);
  }
  return { ingredientsByRecipeId, assessmentsByRecipeId };
}

/**
 * Public projection is structurally canonical-only and omits owner/profile,
 * creator, ingredient, and correction identifiers.
 */
export async function listPublicDietaryAssessments(
  recipeId: string,
): Promise<PublicDietaryAssessment[]> {
  const batch = await loadDietaryAssessmentReadBatch([recipeId], null);
  const rows = batch.assessmentsByRecipeId.get(recipeId) ?? [];
  const fresh = rows.flatMap((row) => {
    if (
      row.ruleId == null ||
      (row.source !== 'deterministic' &&
        row.source !== 'on-device' &&
        row.source !== 'author-confirmed')
    ) {
      return [];
    }
    return [
      {
        ...row,
        scope: dietaryAssessmentScopeSchema.parse(row.scope),
        source: dietaryAssessmentSourceSchema.parse(row.source),
        verdict: dietaryVerdictSchema.parse(row.verdict),
        confidence: dietaryConfidenceSchema.nullable().parse(row.confidence),
      },
    ];
  });
  const byRule = new Map<string, typeof fresh>();
  for (const row of fresh) {
    const ruleRows = byRule.get(row.ruleId!) ?? [];
    ruleRows.push(row);
    byRule.set(row.ruleId!, ruleRows);
  }
  return [...byRule.entries()].flatMap(([ruleId, assessments]) => {
    const effective = selectEffectiveDietaryAssessment(assessments);
    return effective
      ? [
          {
            ruleId,
            source: effective.source as PublicDietaryAssessment['source'],
            verdict: effective.verdict as PublicDietaryAssessment['verdict'],
            confidence: effective.confidence as PublicDietaryAssessment['confidence'],
          },
        ]
      : [];
  });
}

/**
 * Authorized full-fidelity read for signed-in product surfaces. Recipe access
 * and profile ownership are independent: group visibility grants canonical
 * recipe facts, never another member's personal/profile assessment.
 */
export async function listDietaryAssessmentsForViewer(recipeId: string, actorId: string) {
  const batch = await loadDietaryAssessmentReadBatch([recipeId], actorId);
  return batch.assessmentsByRecipeId.get(recipeId) ?? [];
}

/**
 * Promote a personal model result into the canonical recipe scope. Only an
 * owner or accepted co-creator may do this, custom/profile rules can never be
 * promoted, and current deterministic evidence is rebuilt before acceptance.
 */
export async function promoteDietaryAssessmentToCanonical(
  assessmentId: string,
  actorId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const executor = tx as unknown as DbExecutor;
    const candidate = await executor.query.dietaryAssessments.findFirst({
      where: and(eq(dietaryAssessments.id, assessmentId), isNull(dietaryAssessments.invalidatedAt)),
      with: { evidence: true },
    });
    if (
      !candidate ||
      candidate.scope !== 'personal' ||
      candidate.ownerUserId !== actorId ||
      candidate.source !== 'on-device' ||
      candidate.ruleId == null ||
      candidate.customRestrictionId != null
    ) {
      throw new DomainError('NOT_FOUND');
    }
    await assertRecipeManager(executor, candidate.recipeId, actorId);

    const ingredients = await dietaryInputs(executor, candidate.recipeId);
    if (
      candidate.ingredientFingerprint !== dietaryIngredientFingerprint(ingredients) ||
      candidate.rulesetVersion !== dietaryRulesetVersion()
    ) {
      throw new DomainError('INVALID');
    }

    await refreshDeterministicDietaryAssessmentsForAuthorizedWrite(
      executor,
      candidate.recipeId,
      actorId,
    );
    const deterministic = await executor.query.dietaryAssessments.findFirst({
      where: and(
        eq(dietaryAssessments.recipeId, candidate.recipeId),
        eq(dietaryAssessments.ruleId, candidate.ruleId),
        eq(dietaryAssessments.scope, 'canonical'),
        eq(dietaryAssessments.source, 'deterministic'),
        isNull(dietaryAssessments.invalidatedAt),
      ),
      columns: { verdict: true },
    });
    if (deterministic?.verdict === 'conflicts' && candidate.verdict !== 'conflicts') {
      throw new DomainError('INVALID');
    }

    const correctionIds = [
      ...new Set(
        candidate.evidence.flatMap((item) =>
          item.correctionId == null ? [] : [item.correctionId],
        ),
      ),
    ];
    if (correctionIds.length > 0) {
      const allowedCorrections = await executor.query.dietaryIngredientCorrections.findMany({
        where: and(
          inArray(dietaryIngredientCorrections.id, correctionIds),
          eq(dietaryIngredientCorrections.ruleId, candidate.ruleId),
          isNull(dietaryIngredientCorrections.customRestrictionId),
          isNull(dietaryIngredientCorrections.revokedAt),
        ),
        columns: { id: true },
      });
      if (allowedCorrections.length !== correctionIds.length) {
        throw new DomainError('INVALID');
      }
    }

    const now = new Date();
    await executor
      .update(dietaryAssessments)
      .set({ invalidatedAt: now, updatedAt: now })
      .where(
        and(
          eq(dietaryAssessments.recipeId, candidate.recipeId),
          eq(dietaryAssessments.ruleId, candidate.ruleId),
          eq(dietaryAssessments.scope, 'canonical'),
          eq(dietaryAssessments.source, 'on-device'),
          isNull(dietaryAssessments.invalidatedAt),
        ),
      );
    const [created] = await executor
      .insert(dietaryAssessments)
      .values({
        recipeId: candidate.recipeId,
        ruleId: candidate.ruleId,
        customRestrictionId: null,
        scope: 'canonical',
        ownerUserId: null,
        profileId: null,
        source: 'on-device',
        verdict: candidate.verdict,
        confidence: candidate.confidence,
        ingredientFingerprint: candidate.ingredientFingerprint,
        analyzerVersion: candidate.analyzerVersion,
        rulesetVersion: candidate.rulesetVersion,
        restrictionTermsVersion: null,
        createdById: actorId,
      })
      .returning({ id: dietaryAssessments.id });
    if (created && candidate.evidence.length > 0) {
      await executor.insert(dietaryEvidence).values(
        candidate.evidence.map((item) => ({
          assessmentId: created.id,
          ingredientId: item.ingredientId,
          finding: item.finding,
          source: item.source,
          material: item.material,
          foodId: item.foodId,
          correctionId: item.correctionId,
        })),
      );
    }
    await syncLegacyDietaryTags(
      executor,
      candidate.recipeId,
      candidate.ingredientFingerprint,
      candidate.rulesetVersion,
    );
  });
}
