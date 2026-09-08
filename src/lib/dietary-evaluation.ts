import { type Locale, SUPPORTED_LOCALES } from '../config/i18n';
import { ALLERGENS, detectAllergensForSafety, type Allergen } from './allergens';
import { canonicalFood, FOOD_ITEMS, foodNodeId } from './food-db';
import { foodAllergensForSlug } from './food-allergens';

export const DIETARY_EVALUATION_SCHEMA_VERSION = 1 as const;

export const DIETARY_EVALUATION_CATEGORIES = [
  'direct-allergen',
  'compound-hidden-product',
  'safe-negative',
  'negation-certification',
  'ocr-misspelling',
  'brand',
  'ambiguous-product',
  'compound-line',
  'overlong-input',
  'adversarial-input',
] as const;

export type DietaryEvaluationCategory = (typeof DIETARY_EVALUATION_CATEGORIES)[number];
export type DietaryEvaluationRuleId = `allergen:${Allergen}`;
export type DietaryEvaluationFinding = 'present' | 'absent' | 'possible' | 'unresolved';
export type DietaryEvaluationEvidenceSource = 'food-link' | 'text-match' | 'certification';

type FoodLinkedExpectedOutcome = {
  finding: 'present' | 'absent';
  evidenceSource: 'food-link' | 'certification';
  foodIds: readonly string[];
};

type TextMatchedExpectedOutcome = {
  finding: 'present';
  evidenceSource: 'text-match';
};

type UncertainExpectedOutcome = {
  finding: 'possible' | 'unresolved';
};

export type DietaryExpectedOutcome =
  FoodLinkedExpectedOutcome | TextMatchedExpectedOutcome | UncertainExpectedOutcome;

export type DietaryEvaluationCase = {
  id: string;
  locale: Locale;
  category: DietaryEvaluationCategory;
  input: string;
  ruleId: DietaryEvaluationRuleId;
  expected: DietaryExpectedOutcome;
};

export type DietaryEvaluationCorpus = {
  schemaVersion: typeof DIETARY_EVALUATION_SCHEMA_VERSION;
  corpusVersion: string;
  cases: readonly DietaryEvaluationCase[];
};

export type DietaryCandidateResolution =
  | {
      finding: 'present' | 'absent';
      evidenceSource: DietaryEvaluationEvidenceSource;
      foodIds?: readonly string[];
    }
  | {
      finding: 'possible' | 'unresolved';
    };

export type DietaryCandidateResolver = (
  testCase: DietaryEvaluationCase,
) => DietaryCandidateResolution | Promise<DietaryCandidateResolution>;

export type DietaryEvaluationClassification =
  'accepted' | 'false-safe' | 'false-conflict' | 'unresolved';

export type DietaryEvaluationCaseResult = {
  caseId: string;
  locale: Locale;
  category: DietaryEvaluationCategory;
  expected: DietaryEvaluationFinding;
  actual: DietaryEvaluationFinding;
  classification: DietaryEvaluationClassification;
  evidenceSourceMatch: boolean | null;
  foodIdsMatch: boolean | null;
};

type CountBy<T extends string> = Record<T, number>;

export type DietaryEvaluationCoverageBucket = {
  total: number;
  resolved: number;
  possible: number;
  unresolved: number;
};

type CoverageBy<T extends string> = Record<T, DietaryEvaluationCoverageBucket>;

export type DietaryEvaluationCoverage = DietaryEvaluationCoverageBucket & {
  resolvedRate: number;
  byLocale: CoverageBy<Locale>;
  byCategory: CoverageBy<DietaryEvaluationCategory>;
};

export type DietaryEvaluationReport = {
  corpusVersion: string;
  results: DietaryEvaluationCaseResult[];
  outcomes: CountBy<DietaryEvaluationClassification>;
  coverage: DietaryEvaluationCoverage;
  releaseGate: {
    passed: boolean;
    falseSafeCaseIds: string[];
  };
  errors: {
    caseId: string;
    code: 'resolver-threw' | 'malformed-result';
  }[];
};

const FINDINGS = ['present', 'absent', 'possible', 'unresolved'] as const;
const CLASSIFICATIONS = ['accepted', 'false-safe', 'false-conflict', 'unresolved'] as const;
const RULE_IDS = ALLERGENS.map((allergen) => `allergen:${allergen}` as const);
const KNOWN_FOOD_IDS = new Set(FOOD_ITEMS.map((food) => foodNodeId(food.name)));
const CASE_ID_PATTERN = /^[a-z]{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const MAX_INPUT_LENGTH = 2_000;
const OVERLONG_INPUT_MIN_LENGTH = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}

function assertCanonicalFoodIds(foodIds: unknown, context: string): asserts foodIds is string[] {
  if (!Array.isArray(foodIds) || foodIds.length === 0) {
    throw new Error(`${context} must include at least one canonical food id.`);
  }

  const seen = new Set<string>();
  for (const foodId of foodIds) {
    if (typeof foodId !== 'string' || !KNOWN_FOOD_IDS.has(foodId)) {
      throw new Error(`${context} contains unknown food id "${String(foodId)}".`);
    }
    if (seen.has(foodId)) {
      throw new Error(`${context} contains duplicate food id "${foodId}".`);
    }
    seen.add(foodId);
  }
}

function assertExpectedOutcome(
  value: unknown,
  context: string,
): asserts value is DietaryExpectedOutcome {
  if (!isRecord(value) || !isOneOf(value.finding, FINDINGS)) {
    throw new Error(`${context} has an unknown expected finding.`);
  }

  if (value.finding === 'present' || value.finding === 'absent') {
    if (!isOneOf(value.evidenceSource, ['food-link', 'text-match', 'certification'] as const)) {
      throw new Error(`${context} resolved outcome requires a known evidence source.`);
    }

    if (value.evidenceSource === 'text-match') {
      if (value.finding !== 'present') {
        throw new Error(`${context} text-match evidence cannot establish absence.`);
      }
      if (!hasOnlyKeys(value, ['finding', 'evidenceSource'])) {
        throw new Error(`${context} text-match outcome cannot carry food ids or prose.`);
      }
      return;
    }
    if (value.evidenceSource === 'certification' && value.finding !== 'absent') {
      throw new Error(`${context} certification evidence can only establish absence.`);
    }

    if (!hasOnlyKeys(value, ['finding', 'evidenceSource', 'foodIds'])) {
      throw new Error(`${context} resolved outcome contains unsupported fields.`);
    }
    assertCanonicalFoodIds(value.foodIds, `${context}.foodIds`);
    return;
  }

  if (!hasOnlyKeys(value, ['finding'])) {
    throw new Error(`${context} uncertain outcome cannot carry food ids or prose.`);
  }
}

export function assertDietaryEvaluationCorpus(
  value: unknown,
): asserts value is DietaryEvaluationCorpus {
  if (!isRecord(value) || !hasOnlyKeys(value, ['schemaVersion', 'corpusVersion', 'cases'])) {
    throw new Error('Dietary evaluation corpus has an invalid top-level shape.');
  }
  if (value.schemaVersion !== DIETARY_EVALUATION_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported dietary evaluation schema version "${String(value.schemaVersion)}".`,
    );
  }
  if (typeof value.corpusVersion !== 'string' || !SEMVER_PATTERN.test(value.corpusVersion)) {
    throw new Error('Dietary evaluation corpusVersion must be semantic versioning (x.y.z).');
  }
  if (!Array.isArray(value.cases) || value.cases.length === 0) {
    throw new Error('Dietary evaluation corpus must contain cases.');
  }

  const ids = new Set<string>();
  const contentKeys = new Set<string>();
  const locales = new Set<Locale>();
  const categories = new Set<DietaryEvaluationCategory>();
  const findingsByLocale = new Map<Locale, Set<DietaryEvaluationFinding>>();

  for (const [index, testCase] of value.cases.entries()) {
    const context = `Dietary evaluation case at index ${index}`;
    if (
      !isRecord(testCase) ||
      !hasOnlyKeys(testCase, ['id', 'locale', 'category', 'input', 'ruleId', 'expected'])
    ) {
      throw new Error(`${context} has an invalid shape.`);
    }
    if (typeof testCase.id !== 'string' || !CASE_ID_PATTERN.test(testCase.id)) {
      throw new Error(`${context} has malformed id "${String(testCase.id)}".`);
    }
    if (ids.has(testCase.id)) {
      throw new Error(`Duplicate dietary evaluation case id "${testCase.id}".`);
    }
    ids.add(testCase.id);

    if (!isOneOf(testCase.locale, SUPPORTED_LOCALES)) {
      throw new Error(`${context} has unsupported locale "${String(testCase.locale)}".`);
    }
    if (!testCase.id.startsWith(`${testCase.locale}-`)) {
      throw new Error(`${context} id must start with locale "${testCase.locale}-".`);
    }
    locales.add(testCase.locale);

    if (!isOneOf(testCase.category, DIETARY_EVALUATION_CATEGORIES)) {
      throw new Error(`${context} has unknown category "${String(testCase.category)}".`);
    }
    categories.add(testCase.category);

    if (
      typeof testCase.input !== 'string' ||
      testCase.input.trim().length === 0 ||
      testCase.input.length > MAX_INPUT_LENGTH
    ) {
      throw new Error(`${context} input must contain 1-${MAX_INPUT_LENGTH} characters.`);
    }
    if (
      testCase.category === 'overlong-input' &&
      testCase.input.length < OVERLONG_INPUT_MIN_LENGTH
    ) {
      throw new Error(
        `${context} overlong input must contain at least ${OVERLONG_INPUT_MIN_LENGTH} characters.`,
      );
    }

    if (!isOneOf(testCase.ruleId, RULE_IDS)) {
      throw new Error(`${context} has malformed rule id "${String(testCase.ruleId)}".`);
    }

    const contentKey = [
      testCase.locale,
      testCase.ruleId,
      testCase.input.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase(),
    ].join('|');
    if (contentKeys.has(contentKey)) {
      throw new Error(`${context} duplicates another locale, rule, and input combination.`);
    }
    contentKeys.add(contentKey);

    assertExpectedOutcome(testCase.expected, `${context}.expected`);
    const localeFindings = findingsByLocale.get(testCase.locale) ?? new Set();
    localeFindings.add(testCase.expected.finding);
    findingsByLocale.set(testCase.locale, localeFindings);
  }

  for (const locale of SUPPORTED_LOCALES) {
    if (!locales.has(locale)) {
      throw new Error(`Dietary evaluation corpus is missing locale "${locale}".`);
    }
    for (const finding of FINDINGS) {
      if (!findingsByLocale.get(locale)?.has(finding)) {
        throw new Error(`Dietary evaluation locale "${locale}" is missing "${finding}" coverage.`);
      }
    }
  }

  for (const category of DIETARY_EVALUATION_CATEGORIES) {
    if (!categories.has(category)) {
      throw new Error(`Dietary evaluation corpus is missing category "${category}".`);
    }
  }
}

function assertCandidateResolution(
  value: unknown,
  caseId: string,
): asserts value is DietaryCandidateResolution {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['finding', 'evidenceSource', 'foodIds']) ||
    !isOneOf(value.finding, FINDINGS)
  ) {
    throw new Error(`Resolver returned a malformed result for "${caseId}".`);
  }

  if (value.finding === 'possible' || value.finding === 'unresolved') {
    if (!hasOnlyKeys(value, ['finding'])) {
      throw new Error(`Resolver returned unsupported uncertain evidence for "${caseId}".`);
    }
    return;
  }

  if (!isOneOf(value.evidenceSource, ['food-link', 'text-match', 'certification'] as const)) {
    throw new Error(`Resolver returned an unknown evidence source for "${caseId}".`);
  }
  if (value.evidenceSource === 'text-match') {
    if (value.finding === 'absent' || value.foodIds !== undefined) {
      throw new Error(`Resolver returned invalid text-match evidence for "${caseId}".`);
    }
    return;
  }
  if (value.evidenceSource === 'certification' && value.finding !== 'absent') {
    throw new Error(`Resolver returned invalid certification evidence for "${caseId}".`);
  }
  if (value.foodIds === undefined) {
    throw new Error(`Resolver omitted canonical food ids for "${caseId}".`);
  }
  assertCanonicalFoodIds(value.foodIds, `Resolver result for "${caseId}".foodIds`);
}

function sameFoodIds(expected: readonly string[], actual: readonly string[] | undefined): boolean {
  if (!actual) return false;
  const actualSet = new Set(actual);
  return expected.every((foodId) => actualSet.has(foodId));
}

function classifyResult(
  expected: DietaryExpectedOutcome,
  actual: DietaryCandidateResolution,
): Pick<DietaryEvaluationCaseResult, 'classification' | 'evidenceSourceMatch' | 'foodIdsMatch'> {
  const expectedResolved = expected.finding === 'present' || expected.finding === 'absent';
  const actualResolved = actual.finding === 'present' || actual.finding === 'absent';
  const evidenceSourceMatch =
    expectedResolved && actualResolved ? expected.evidenceSource === actual.evidenceSource : null;
  const foodIdsMatch =
    expectedResolved && actualResolved && expected.evidenceSource !== 'text-match'
      ? sameFoodIds(expected.foodIds, actual.foodIds)
      : expectedResolved && expected.evidenceSource === 'text-match'
        ? actualResolved && actual.evidenceSource === 'text-match'
        : null;
  const evidenceMatches = evidenceSourceMatch === true && foodIdsMatch !== false;

  if (actual.finding === 'absent') {
    if (expected.finding === 'absent' && evidenceMatches) {
      return { classification: 'accepted', evidenceSourceMatch, foodIdsMatch };
    }
    return { classification: 'false-safe', evidenceSourceMatch, foodIdsMatch };
  }

  if (
    expected.finding === 'absent' &&
    (actual.finding === 'present' || actual.finding === 'possible')
  ) {
    return { classification: 'false-conflict', evidenceSourceMatch, foodIdsMatch };
  }

  if (actual.finding === expected.finding) {
    if (expected.finding === 'present' && !evidenceMatches) {
      return { classification: 'unresolved', evidenceSourceMatch, foodIdsMatch };
    }
    return { classification: 'accepted', evidenceSourceMatch, foodIdsMatch };
  }

  return { classification: 'unresolved', evidenceSourceMatch, foodIdsMatch };
}

function emptyCount<T extends string>(values: readonly T[]): CountBy<T> {
  return Object.fromEntries(values.map((value) => [value, 0])) as CountBy<T>;
}

function emptyCoverage<T extends string>(values: readonly T[]): CoverageBy<T> {
  return Object.fromEntries(
    values.map((value) => [value, { total: 0, resolved: 0, possible: 0, unresolved: 0 }]),
  ) as CoverageBy<T>;
}

function recordCoverage(
  bucket: DietaryEvaluationCoverageBucket,
  finding: DietaryEvaluationFinding,
): void {
  bucket.total += 1;
  if (finding === 'present' || finding === 'absent') bucket.resolved += 1;
  else if (finding === 'possible') bucket.possible += 1;
  else bucket.unresolved += 1;
}

export async function evaluateDietaryResolver(
  corpus: DietaryEvaluationCorpus,
  resolver: DietaryCandidateResolver,
): Promise<DietaryEvaluationReport> {
  assertDietaryEvaluationCorpus(corpus);

  const outcomes = emptyCount(CLASSIFICATIONS);
  const byLocale = emptyCoverage(SUPPORTED_LOCALES);
  const byCategory = emptyCoverage(DIETARY_EVALUATION_CATEGORIES);
  const results: DietaryEvaluationCaseResult[] = [];
  const errors: DietaryEvaluationReport['errors'] = [];
  let resolved = 0;
  let possible = 0;
  let unresolved = 0;

  for (const testCase of corpus.cases) {
    let actual: DietaryCandidateResolution;
    let resolverFailed = false;
    try {
      actual = await resolver(testCase);
    } catch {
      actual = { finding: 'unresolved' };
      resolverFailed = true;
      errors.push({ caseId: testCase.id, code: 'resolver-threw' });
    }

    if (!resolverFailed) {
      try {
        assertCandidateResolution(actual, testCase.id);
      } catch {
        actual = { finding: 'unresolved' };
        resolverFailed = true;
        errors.push({ caseId: testCase.id, code: 'malformed-result' });
      }
    }

    const scored = resolverFailed
      ? {
          classification: 'unresolved' as const,
          evidenceSourceMatch: null,
          foodIdsMatch: null,
        }
      : classifyResult(testCase.expected, actual);
    outcomes[scored.classification] += 1;
    recordCoverage(byLocale[testCase.locale], actual.finding);
    recordCoverage(byCategory[testCase.category], actual.finding);

    if (actual.finding === 'present' || actual.finding === 'absent') resolved += 1;
    else if (actual.finding === 'possible') possible += 1;
    else unresolved += 1;

    results.push({
      caseId: testCase.id,
      locale: testCase.locale,
      category: testCase.category,
      expected: testCase.expected.finding,
      actual: actual.finding,
      ...scored,
    });
  }

  const falseSafeCaseIds = results
    .filter((result) => result.classification === 'false-safe')
    .map((result) => result.caseId);

  return {
    corpusVersion: corpus.corpusVersion,
    results,
    outcomes,
    coverage: {
      total: corpus.cases.length,
      resolved,
      possible,
      unresolved,
      resolvedRate: corpus.cases.length === 0 ? 0 : resolved / corpus.cases.length,
      byLocale,
      byCategory,
    },
    releaseGate: {
      passed: falseSafeCaseIds.length === 0,
      falseSafeCaseIds,
    },
    errors,
  };
}

export function assertDietaryEvaluationReleaseGate(report: DietaryEvaluationReport): void {
  if (!report.releaseGate.passed) {
    throw new Error(
      `Dietary evaluation release gate failed: false-safe cases ${report.releaseGate.falseSafeCaseIds.join(', ')}.`,
    );
  }
}

function allergenFromRuleId(ruleId: DietaryEvaluationRuleId): Allergen {
  return ruleId.slice('allergen:'.length) as Allergen;
}

/**
 * Adapter for the current static matcher. A missing hit remains unresolved:
 * the detector has positive rules but no complete negative-fact coverage.
 */
export function resolveWithDeterministicAllergens(
  testCase: DietaryEvaluationCase,
): DietaryCandidateResolution {
  const target = allergenFromRuleId(testCase.ruleId);
  if (!detectAllergensForSafety(testCase.input).includes(target)) {
    return { finding: 'unresolved' };
  }

  const food = canonicalFood(testCase.input);
  const linkedAllergens = food ? foodAllergensForSlug(food.slug) : null;
  return food && linkedAllergens?.includes(target)
    ? { finding: 'present', evidenceSource: 'food-link', foodIds: [food.id] }
    : { finding: 'present', evidenceSource: 'text-match' };
}
