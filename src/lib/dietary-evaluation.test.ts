import { describe, expect, it } from 'vitest';

import { SUPPORTED_LOCALES } from '../config/i18n';
import { DIETARY_EVALUATION_CORPUS_V1 } from './dietary-evaluation-corpus.v1';
import { foodNodeId } from './food-db';
import {
  DIETARY_EVALUATION_CATEGORIES,
  DIETARY_EVALUATION_RULE_IDS,
  assertDietaryEvaluationCorpus,
  assertDietaryEvaluationReleaseGate,
  evaluateDietaryResolver,
  resolveWithDeterministicAllergens,
  type DietaryCandidateResolver,
} from './dietary-evaluation';

describe('dietary evaluation corpus v1', () => {
  it('passes structural validation', () => {
    expect(() => assertDietaryEvaluationCorpus(DIETARY_EVALUATION_CORPUS_V1)).not.toThrow();
  });

  it('covers every supported locale, category, finding, and unsafe rule', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const localeCases = DIETARY_EVALUATION_CORPUS_V1.cases.filter(
        (testCase) => testCase.locale === locale,
      );
      expect(localeCases.length).toBeGreaterThanOrEqual(14);
      expect(new Set(localeCases.map((testCase) => testCase.expected.finding))).toEqual(
        new Set(['present', 'absent', 'possible', 'unresolved']),
      );
      expect(
        new Set(
          localeCases
            .filter((testCase) => testCase.expected.finding !== 'absent')
            .map((testCase) => testCase.ruleId),
        ),
      ).toEqual(new Set(DIETARY_EVALUATION_RULE_IDS));
    }

    expect(
      new Set(DIETARY_EVALUATION_CORPUS_V1.cases.map((testCase) => testCase.category)),
    ).toEqual(new Set(DIETARY_EVALUATION_CATEGORIES));
  });

  it('rejects duplicate ids', () => {
    const duplicate = {
      ...DIETARY_EVALUATION_CORPUS_V1,
      cases: [...DIETARY_EVALUATION_CORPUS_V1.cases, DIETARY_EVALUATION_CORPUS_V1.cases[0]],
    };
    expect(() => assertDietaryEvaluationCorpus(duplicate)).toThrow(/Duplicate .* case id/);
  });

  it('rejects duplicate locale, rule, and input content under another id', () => {
    const duplicate = {
      ...DIETARY_EVALUATION_CORPUS_V1,
      cases: [
        ...DIETARY_EVALUATION_CORPUS_V1.cases,
        {
          ...DIETARY_EVALUATION_CORPUS_V1.cases[0],
          id: 'en-duplicate-content',
        },
      ],
    };
    expect(() => assertDietaryEvaluationCorpus(duplicate)).toThrow(
      /duplicates another locale, rule, and input/,
    );
  });

  it('rejects a locale that loses non-absent coverage for a supported rule', () => {
    const incomplete = {
      ...DIETARY_EVALUATION_CORPUS_V1,
      cases: DIETARY_EVALUATION_CORPUS_V1.cases.map((testCase) =>
        testCase.locale === 'en' && testCase.ruleId === 'allergen:tree-nut'
          ? {
              ...testCase,
              expected: {
                finding: 'absent',
                evidenceSource: 'food-link',
                foodIds: [foodNodeId('Almond flour')],
              },
            }
          : testCase,
      ),
    };
    expect(() => assertDietaryEvaluationCorpus(incomplete)).toThrow(
      /locale "en" is missing non-absent coverage for "allergen:tree-nut"/,
    );
  });

  it.each([
    ['locale', { locale: 'fr' }, /unsupported locale/],
    ['rule', { ruleId: 'allergen:mustard' }, /malformed rule id/],
    [
      'resolved food id',
      {
        expected: {
          finding: 'present',
          evidenceSource: 'food-link',
          foodIds: ['food_unknown'],
        },
      },
      /unknown food id/,
    ],
    [
      'uncertain prose',
      { expected: { finding: 'unresolved', explanation: 'model prose' } },
      /cannot carry food ids or prose/,
    ],
  ])('rejects a malformed %s', (_label, replacement, message) => {
    const malformed = {
      ...DIETARY_EVALUATION_CORPUS_V1,
      cases: [
        {
          ...DIETARY_EVALUATION_CORPUS_V1.cases[0],
          ...replacement,
        },
        ...DIETARY_EVALUATION_CORPUS_V1.cases.slice(1),
      ],
    };
    expect(() => assertDietaryEvaluationCorpus(malformed)).toThrow(message);
  });
});

describe('evaluateDietaryResolver', () => {
  it('distinguishes accepted, false-safe, false-conflict, and unresolved outcomes', async () => {
    const resolver: DietaryCandidateResolver = (input) => {
      if (input.input === '2 cups whole milk') {
        return {
          finding: 'present',
          evidenceSource: 'food-link',
          foodIds: [foodNodeId('Milk')],
        };
      }
      if (input.input === '1 cup plain white rice') {
        return { finding: 'present', evidenceSource: 'text-match' };
      }
      if (input.input === 'certified gluten-free rolled oats') {
        return {
          finding: 'absent',
          evidenceSource: 'food-link',
          foodIds: [foodNodeId('Oats')],
        };
      }
      return { finding: 'unresolved' };
    };

    const report = await evaluateDietaryResolver(DIETARY_EVALUATION_CORPUS_V1, resolver);

    expect(report.outcomes).toEqual({
      accepted: 5,
      'false-safe': 1,
      'false-conflict': 1,
      unresolved: 49,
    });
    expect(report.releaseGate).toEqual({
      passed: false,
      falseSafeCaseIds: ['en-certified-oats'],
      errorCaseIds: [],
    });
    expect(report.coverage.total).toBe(DIETARY_EVALUATION_CORPUS_V1.cases.length);
    expect(report.coverage.resolved).toBeGreaterThan(0);
  });

  it('passes only production-shaped input to a resolver', async () => {
    const receivedKeys = new Set<string>();
    await evaluateDietaryResolver(DIETARY_EVALUATION_CORPUS_V1, (input) => {
      for (const key of Object.keys(input)) receivedKeys.add(key);
      return { finding: 'unresolved' };
    });

    expect(receivedKeys).toEqual(new Set(['locale', 'input', 'ruleId']));
    expect(receivedKeys.has('expected')).toBe(false);
    expect(receivedKeys.has('id')).toBe(false);
    expect(receivedKeys.has('category')).toBe(false);
  });

  it('treats an absent claim with the wrong canonical food id as false-safe', async () => {
    const report = await evaluateDietaryResolver(DIETARY_EVALUATION_CORPUS_V1, (input) =>
      input.input === '1 cup plain white rice'
        ? {
            finding: 'absent',
            evidenceSource: 'food-link',
            foodIds: [foodNodeId('Oats')],
          }
        : { finding: 'unresolved' },
    );

    expect(report.outcomes['false-safe']).toBe(1);
    expect(report.releaseGate.falseSafeCaseIds).toEqual(['en-safe-rice']);
  });

  it('requires an exact canonical food identity without contradictory extras', async () => {
    const report = await evaluateDietaryResolver(DIETARY_EVALUATION_CORPUS_V1, (input) =>
      input.input === '2 cups whole milk'
        ? {
            finding: 'present',
            evidenceSource: 'food-link',
            foodIds: [foodNodeId('Milk'), foodNodeId('Rice')],
          }
        : { finding: 'unresolved' },
    );

    expect(report.results.find((result) => result.caseId === 'en-direct-dairy')).toMatchObject({
      classification: 'unresolved',
      foodIdsMatch: false,
    });
  });

  it('fails the release gate for false-safe results but allows explicit abstention', async () => {
    const conservativeReport = await evaluateDietaryResolver(DIETARY_EVALUATION_CORPUS_V1, () => ({
      finding: 'unresolved',
    }));
    expect(conservativeReport.outcomes.unresolved).toBeGreaterThan(0);
    expect(() => assertDietaryEvaluationReleaseGate(conservativeReport)).not.toThrow();

    const unsafeReport = await evaluateDietaryResolver(DIETARY_EVALUATION_CORPUS_V1, () => ({
      finding: 'absent',
      evidenceSource: 'food-link',
      foodIds: [foodNodeId('Rice')],
    }));
    expect(() => assertDietaryEvaluationReleaseGate(unsafeReport)).toThrow(/false-safe cases/);
  });

  it('reports coverage separately from correctness', async () => {
    const report = await evaluateDietaryResolver(DIETARY_EVALUATION_CORPUS_V1, () => ({
      finding: 'absent',
      evidenceSource: 'food-link',
      foodIds: [foodNodeId('Rice')],
    }));

    expect(report.coverage.resolved).toBe(DIETARY_EVALUATION_CORPUS_V1.cases.length);
    expect(report.outcomes.accepted).toBeGreaterThan(0);
    expect(report.releaseGate.passed).toBe(false);
  });

  it('accepts asynchronous resolvers', async () => {
    const report = await evaluateDietaryResolver(DIETARY_EVALUATION_CORPUS_V1, async () =>
      Promise.resolve({ finding: 'unresolved' }),
    );

    expect(report.outcomes.accepted).toBe(4);
    expect(report.errors).toEqual([]);
  });

  it.each([
    ['unknown finding', () => ({ finding: 'safe' })],
    [
      'unknown food id',
      () => ({
        finding: 'present',
        evidenceSource: 'food-link',
        foodIds: ['food_unknown'],
      }),
    ],
    [
      'evidence on an uncertain result',
      () => ({
        finding: 'unresolved',
        evidenceSource: 'text-match',
      }),
    ],
  ])(
    'fails the gate and continues after malformed resolver output: %s',
    async (_label, resolver) => {
      const report = await evaluateDietaryResolver(
        DIETARY_EVALUATION_CORPUS_V1,
        resolver as unknown as DietaryCandidateResolver,
      );

      expect(report.outcomes.unresolved).toBe(DIETARY_EVALUATION_CORPUS_V1.cases.length);
      expect(report.errors).toHaveLength(DIETARY_EVALUATION_CORPUS_V1.cases.length);
      expect(new Set(report.errors.map((error) => error.code))).toEqual(
        new Set(['malformed-result']),
      );
      expect(report.releaseGate.passed).toBe(false);
      expect(() => assertDietaryEvaluationReleaseGate(report)).toThrow(/resolver errors/);
    },
  );

  it('fails the gate and continues when the resolver throws', async () => {
    const report = await evaluateDietaryResolver(DIETARY_EVALUATION_CORPUS_V1, () =>
      Promise.reject(new Error('adapter unavailable')),
    );

    expect(report.outcomes.unresolved).toBe(DIETARY_EVALUATION_CORPUS_V1.cases.length);
    expect(report.errors).toHaveLength(DIETARY_EVALUATION_CORPUS_V1.cases.length);
    expect(new Set(report.errors.map((error) => error.code))).toEqual(new Set(['resolver-threw']));
    expect(report.releaseGate.passed).toBe(false);
    expect(() => assertDietaryEvaluationReleaseGate(report)).toThrow(/resolver errors/);
  });
});

describe('current deterministic allergen behavior', () => {
  it('pins the model-free baseline and never claims unmatched text is safe', async () => {
    const report = await evaluateDietaryResolver(
      DIETARY_EVALUATION_CORPUS_V1,
      resolveWithDeterministicAllergens,
    );

    expect(report.outcomes).toEqual({
      accepted: 12,
      'false-safe': 0,
      'false-conflict': 1,
      unresolved: 43,
    });
    expect(report.coverage).toMatchObject({
      total: 56,
      resolved: 9,
      possible: 0,
      unresolved: 47,
      byLocale: {
        en: { total: 14, resolved: 7, possible: 0, unresolved: 7 },
        es: { total: 14, resolved: 1, possible: 0, unresolved: 13 },
        de: { total: 14, resolved: 1, possible: 0, unresolved: 13 },
        ar: { total: 14, resolved: 0, possible: 0, unresolved: 14 },
      },
    });
    expect(report.results.every((result) => result.actual !== 'absent')).toBe(true);
    expect(report.errors).toEqual([]);
    expect(() => assertDietaryEvaluationReleaseGate(report)).not.toThrow();
  });
});
