import { z } from 'zod';

import { ALLERGENS } from './allergens';
import { FOOD_CATEGORIES } from './food-db';
import {
  CUSTOM_RESTRICTION_SEVERITIES,
  DIETARY_ASSESSMENT_SCOPES,
  DIETARY_ASSESSMENT_SOURCES,
  DIETARY_CONFIDENCES,
  DIETARY_EVIDENCE_FINDINGS,
  DIETARY_EVIDENCE_SOURCES,
  DIETARY_VERDICTS,
} from './dietary-contracts';

export * from './dietary-contracts';

export const DIETARY_SUBJECT_SCOPES = ['self'] as const;
export type DietarySubjectScope = (typeof DIETARY_SUBJECT_SCOPES)[number];

export const dietaryVerdictSchema = z.enum(DIETARY_VERDICTS);
export const dietaryConfidenceSchema = z.enum(DIETARY_CONFIDENCES);
export const dietaryEvidenceFindingSchema = z.enum(DIETARY_EVIDENCE_FINDINGS);
export const dietaryEvidenceSourceSchema = z.enum(DIETARY_EVIDENCE_SOURCES);
export const dietaryAssessmentSourceSchema = z.enum(DIETARY_ASSESSMENT_SOURCES);
export const dietaryAssessmentScopeSchema = z.enum(DIETARY_ASSESSMENT_SCOPES);
export const customRestrictionSeveritySchema = z.enum(CUSTOM_RESTRICTION_SEVERITIES);
export const dietarySubjectScopeSchema = z.enum(DIETARY_SUBJECT_SCOPES);

export const dietaryRuleTargetSchema = z.union([
  z
    .object({
      ruleId: z.string().min(1).max(80),
      customRestrictionId: z.null(),
    })
    .strict(),
  z
    .object({
      ruleId: z.null(),
      customRestrictionId: z.string().min(1).max(24),
    })
    .strict(),
]);
export type DietaryRuleTarget = z.infer<typeof dietaryRuleTargetSchema>;

export const customDietaryRestrictionTermSchema = z
  .object({
    term: z.string().trim().min(1).max(300),
    source: z.enum(['exact', 'suggested']),
    approved: z.boolean(),
  })
  .strict()
  .superRefine((term, context) => {
    if (term.source === 'exact' && !term.approved) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approved'],
        message: 'exact restriction terms are approved by definition',
      });
    }
  });

export const customDietaryRestrictionInputSchema = z
  .object({
    subjectScope: dietarySubjectScopeSchema,
    name: z.string().trim().min(1).max(80),
    severity: customRestrictionSeveritySchema,
    terms: z.array(customDietaryRestrictionTermSchema).min(1).max(100),
  })
  .strict();
export type CustomDietaryRestrictionInput = z.infer<typeof customDietaryRestrictionInputSchema>;

/**
 * The linked-food facts that can influence deterministic resolution.
 *
 * `allergens` intentionally distinguishes `null` (this node has no curated
 * allergen coverage) from `[]` (curation affirmatively found none). Treating
 * both as an empty array would recreate the unsafe absence-of-a-match behavior
 * ADR-0011 replaces.
 */
export const dietaryLinkedFoodInputSchema = z
  .object({
    id: z.string().min(1).max(24),
    slug: z.string().min(1).max(80),
    category: z.enum(FOOD_CATEGORIES),
    allergens: z.array(z.enum(ALLERGENS)).nullable(),
  })
  .strict();
export type DietaryLinkedFoodInput = z.infer<typeof dietaryLinkedFoodInputSchema>;

/**
 * Every ingredient field used by dietary resolution and therefore by cache
 * freshness. Amounts are context only; they never reduce a conflict.
 */
export const dietaryIngredientInputSchema = z
  .object({
    ingredientId: z.string().min(1).max(24),
    item: z.string().min(1).max(300),
    amount: z.number().finite().nonnegative().nullable(),
    amountMax: z.number().finite().nonnegative().nullable(),
    unit: z.string().max(40).nullable(),
    prep: z.string().max(200).nullable(),
    linkedFood: dietaryLinkedFoodInputSchema.nullable(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.amount != null && input.amountMax != null && input.amountMax < input.amount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amountMax'],
        message: 'amountMax must be greater than or equal to amount',
      });
    }
  });
export type DietaryIngredientInput = z.infer<typeof dietaryIngredientInputSchema>;

export const dietaryIngredientEvidenceSchema = z
  .object({
    ingredientId: z.string().min(1).max(24),
    ruleId: z.string().min(1).max(80),
    finding: dietaryEvidenceFindingSchema,
    source: dietaryEvidenceSourceSchema,
    /**
     * False only for ambiguity known not to be material to the current rule.
     * Missing/unmatched evidence is always material.
     */
    material: z.boolean().default(true),
    foodId: z.string().min(1).max(24).nullable().default(null),
    correctionId: z.string().min(1).max(24).nullable().default(null),
  })
  .strict();
export type DietaryIngredientEvidence = z.infer<typeof dietaryIngredientEvidenceSchema>;

export const dietaryIngredientCorrectionSchema = z
  .object({
    ingredientId: z.string().min(1).max(24),
    ruleId: z.string().min(1).max(80).nullable(),
    customRestrictionId: z.string().min(1).max(24).nullable(),
    finding: dietaryEvidenceFindingSchema,
    correctedFoodId: z.string().min(1).max(24).nullable(),
  })
  .strict()
  .superRefine((correction, context) => {
    if (Number(correction.ruleId != null) + Number(correction.customRestrictionId != null) !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ruleId'],
        message: 'exactly one dietary rule target is required',
      });
    }
  });
export type DietaryIngredientCorrection = z.infer<typeof dietaryIngredientCorrectionSchema>;

/**
 * Algorithmic assessments form a closed union. Impossible pairs such as
 * `meets/needs-review` or `conflicts/medium` cannot be constructed or parsed.
 */
export const algorithmicDietaryAssessmentSchema = z.discriminatedUnion('verdict', [
  z
    .object({
      verdict: z.literal('meets'),
      confidence: z.enum(['high', 'medium']),
    })
    .strict(),
  z
    .object({
      verdict: z.literal('unknown'),
      confidence: z.literal('needs-review'),
    })
    .strict(),
  z
    .object({
      verdict: z.literal('conflicts'),
      confidence: z.literal('high'),
    })
    .strict(),
]);
export type AlgorithmicDietaryAssessment = z.infer<typeof algorithmicDietaryAssessmentSchema>;

/**
 * Confirmation is provenance rather than an invented confidence band. It is a
 * separate union arm instead of weakening the legal algorithmic combinations.
 */
export const dietaryAssessmentOutcomeSchema = z.union([
  z
    .object({
      basis: z.literal('algorithmic'),
      verdict: z.literal('meets'),
      confidence: z.enum(['high', 'medium']),
    })
    .strict(),
  z
    .object({
      basis: z.literal('algorithmic'),
      verdict: z.literal('unknown'),
      confidence: z.literal('needs-review'),
    })
    .strict(),
  z
    .object({
      basis: z.literal('algorithmic'),
      verdict: z.literal('conflicts'),
      confidence: z.literal('high'),
    })
    .strict(),
  z
    .object({
      basis: z.literal('confirmed'),
      verdict: z.literal('meets'),
      confidence: z.null(),
    })
    .strict(),
]);
export type DietaryAssessmentOutcome = z.infer<typeof dietaryAssessmentOutcomeSchema>;

export function isLegalDietaryAssessment(value: unknown): value is AlgorithmicDietaryAssessment {
  return algorithmicDietaryAssessmentSchema.safeParse(value).success;
}

export const dietaryAssessmentContractSchema = z
  .object({
    recipeId: z.string().min(1).max(24),
    ruleId: z.string().min(1).max(80).nullable(),
    customRestrictionId: z.string().min(1).max(24).nullable(),
    scope: dietaryAssessmentScopeSchema,
    ownerUserId: z.string().min(1).max(24).nullable(),
    profileId: z.string().min(1).max(24).nullable(),
    source: dietaryAssessmentSourceSchema,
    outcome: dietaryAssessmentOutcomeSchema,
    ingredientFingerprint: z.string().min(1).max(80),
    analyzerVersion: z.string().min(1).max(80),
    rulesetVersion: z.string().min(1).max(80),
    restrictionTermsVersion: z.string().min(1).max(80).nullable(),
    evidenceIds: z.array(z.string().min(1).max(24)),
    createdAt: z.coerce.date(),
    invalidatedAt: z.coerce.date().nullable(),
  })
  .strict()
  .superRefine((assessment, context) => {
    if (Number(assessment.ruleId != null) + Number(assessment.customRestrictionId != null) !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ruleId'],
        message: 'exactly one dietary rule target is required',
      });
    }
    const validScope =
      (assessment.scope === 'canonical' &&
        assessment.ownerUserId == null &&
        assessment.profileId == null) ||
      (assessment.scope === 'personal' &&
        assessment.ownerUserId != null &&
        assessment.profileId == null) ||
      (assessment.scope === 'profile' &&
        assessment.ownerUserId == null &&
        assessment.profileId != null);
    if (!validScope) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scope'],
        message: 'assessment owner fields must match its scope',
      });
    }
    const customFreshnessIsValid =
      assessment.customRestrictionId == null
        ? assessment.restrictionTermsVersion == null
        : assessment.scope === 'profile' &&
          assessment.profileId != null &&
          assessment.restrictionTermsVersion != null;
    if (!customFreshnessIsValid) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['restrictionTermsVersion'],
        message:
          'custom restriction assessments require profile scope and a restriction terms version',
      });
    }
    const confirmed = assessment.outcome.basis === 'confirmed';
    if (confirmed !== (assessment.source === 'author-confirmed')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source'],
        message: 'confirmed outcomes require the author-confirmed source',
      });
    }
  });
export type DietaryAssessmentContract = z.infer<typeof dietaryAssessmentContractSchema>;

export const onDeviceDietarySubmissionSchema = z
  .object({
    recipeId: z.string().min(1).max(24),
    ingredientFingerprint: z.string().min(1).max(80),
    analyzerVersion: z.string().min(1).max(80),
    rulesetVersion: z.string().min(1).max(80),
    evidence: z
      .array(
        z
          .object({
            ingredientId: z.string().min(1).max(24),
            foodId: z.string().min(1).max(24),
            ruleId: z.string().min(1).max(80),
            finding: dietaryEvidenceFindingSchema,
          })
          .strict(),
      )
      .max(5_000),
  })
  .strict();
export type OnDeviceDietarySubmission = z.infer<typeof onDeviceDietarySubmissionSchema>;
