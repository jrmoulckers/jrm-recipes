import { describe, expect, it } from 'vitest';

import { SUPPORTED_LOCALES } from '../config/i18n';
import { DIETARY_EVALUATION_CORPUS_V1 } from './dietary-evaluation-corpus.v1';
import { foodNodeId } from './food-db';
import {
  DIETARY_EVALUATION_CATEGORIES,
  assertDietaryEvaluationCorpus,
  assertDietaryEvaluationReleaseGate,
  evaluateDietaryResolver,
  resolveWithDeterministicAllergens,
  type DietaryCandidateResolver,
  type DietaryEvaluationCorpus,
} from './dietary-evaluation';

describe('dietary evaluation corpus v1', () => {
  it('passes structural validation', () => {
    expect(() => assertDietaryEvaluationCorpus(DIETARY_EVALUATION_CORPUS_V1)).not.toThrow();
  });

  it('covers every supported locale, category, and expected finding', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const localeCases = DIETARY_EVALUATION_CORPUS_V1.cases.filter(
        (testCase) => testCase.locale === locale,
      );
      expect(localeCases.length).toBeGreaterThanOrEqual(10);
      expect(new Set(localeCases.map((testCase) => testCase.expected.finding))).toEqual(
        new Set(['present', 'absent', 'possible', 'unresolved']),
      );
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
    const cases = DIETARY_EVALUATION_CORPUS_V1.cases;
    const corpus = {
      schemaVersion: 1,
      corpusVersion: '1.0.0',
      cases: [
        cases.find((testCase) => testCase.id === 'en-direct-dairy'),
        cases.find((testCase) => testCase.id === 'en-safe-rice'),
        cases.find((testCase) => testCase.id === 'en-certified-oats'),
        cases.find((testCase) => testCase.id === 'en-ocr-peanut'),
        ...cases.filter(
          (testCase) =>
            testCase.locale !== 'en' ||
            !['en-direct-dairy', 'en-safe-rice', 'en-certified-oats', 'en-ocr-peanut'].includes(
              testCase.id,
            ),
        ),
      ],
    } as DietaryEvaluationCorpus;

    const resolver: DietaryCandidateResolver = (testCase) => {
      if (testCase.id === 'en-direct-dairy') return testCase.expected;
      if (testCase.id === 'en-safe-rice') {
        return { finding: 'present', evidenceSource: 'text-match' };
      }
      if (testCase.id === 'en-certified-oats') {
        return {
          finding: 'absent',
          evidenceSource: 'food-link',
          foodIds: [foodNodeId('Oats')],
        };
      }
      if (testCase.id === 'en-ocr-peanut') return { finding: 'unresolved' };
      return testCase.expected;
    };

    const report = await evaluateDietaryResolver(corpus, resolver);

    expect(report.outcomes).toEqual({
      accepted: corpus.cases.length - 3,
      'false-safe': 1,
      'false-conflict': 1,
      unresolved: 1,
    });
    expect(report.releaseGate).toEqual({
      passed: false,
      falseSafeCaseIds: ['en-certified-oats'],
    });
    expect(report.coverage.total).toBe(corpus.cases.length);
    expect(report.coverage.resolved).toBeGreaterThan(0);
  });

  it('treats an absent claim without the expected canonical food id as false-safe', async () => {
    const unsafeReport = await evaluateDietaryResolver(DIETARY_EVALUATION_CORPUS_V1, (testCase) =>
      testCase.id === 'en-safe-rice'
        ? {
            finding: 'absent',
            evidenceSource: 'food-link',
            foodIds: [foodNodeId('Oats')],
          }
        : testCase.expected,
    );

    expect(unsafeReport.outcomes['false-safe']).toBe(1);
    expect(unsafeReport.releaseGate.falseSafeCaseIds).toEqual(['en-safe-rice']);
  });

  it('throws the release gate only for false-safe results', async () => {
    const conservativeReport = await evaluateDietaryResolver(DIETARY_EVALUATION_CORPUS_V1, () => ({
      finding: 'unresolved',
    }));
    expect(conservativeReport.outcomes.unresolved).toBeGreaterThan(0);
    expect(() => assertDietaryEvaluationReleaseGate(conservativeReport)).not.toThrow();

    const unsafeReport = await evaluateDietaryResolver(DIETARY_EVALUATION_CORPUS_V1, (testCase) =>
      testCase.expected.finding === 'present'
        ? {
            finding: 'absent',
            evidenceSource: 'food-link',
            foodIds: [foodNodeId('Rice')],
          }
        : { finding: 'unresolved' },
    );
    expect(() => assertDietaryEvaluationReleaseGate(unsafeReport)).toThrow(/false-safe cases/);
  });

  it('reports coverage separately from correctness', async () => {
    const report = await evaluateDietaryResolver(DIETARY_EVALUATION_CORPUS_V1, (testCase) => {
      if (testCase.expected.finding === 'present') {
        return {
          finding: 'absent',
          evidenceSource: 'food-link',
          foodIds: [foodNodeId('Rice')],
        };
      }
      return { finding: 'unresolved' };
    });

    expect(report.coverage.resolved).toBeGreaterThan(0);
    expect(report.outcomes.accepted).toBeGreaterThan(0);
    expect(report.releaseGate.passed).toBe(false);
  });

  it('accepts asynchronous resolvers', async () => {
    const report = await evaluateDietaryResolver(DIETARY_EVALUATION_CORPUS_V1, async (testCase) =>
      Promise.resolve(testCase.expected),
    );

    expect(report.outcomes.accepted).toBe(DIETARY_EVALUATION_CORPUS_V1.cases.length);
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
  ])('fails closed and continues after malformed resolver output: %s', async (_label, resolver) => {
    const report = await evaluateDietaryResolver(
      DIETARY_EVALUATION_CORPUS_V1,
      resolver as unknown as DietaryCandidateResolver,
    );

    expect(report.outcomes.unresolved).toBe(DIETARY_EVALUATION_CORPUS_V1.cases.length);
    expect(report.errors).toHaveLength(DIETARY_EVALUATION_CORPUS_V1.cases.length);
    expect(new Set(report.errors.map((error) => error.code))).toEqual(
      new Set(['malformed-result']),
    );
    expect(report.releaseGate.passed).toBe(true);
  });

  it('fails closed and continues when the resolver throws', async () => {
    const report = await evaluateDietaryResolver(DIETARY_EVALUATION_CORPUS_V1, () =>
      Promise.reject(new Error('adapter unavailable')),
    );

    expect(report.outcomes.unresolved).toBe(DIETARY_EVALUATION_CORPUS_V1.cases.length);
    expect(report.errors).toHaveLength(DIETARY_EVALUATION_CORPUS_V1.cases.length);
    expect(new Set(report.errors.map((error) => error.code))).toEqual(new Set(['resolver-threw']));
    expect(report.releaseGate.passed).toBe(true);
  });
});

describe('current deterministic allergen behavior', () => {
  it('can be measured without a model dependency and never claims unmatched text is safe', async () => {
    const report = await evaluateDietaryResolver(
      DIETARY_EVALUATION_CORPUS_V1,
      resolveWithDeterministicAllergens,
    );

    expect(report.outcomes).toEqual({
      accepted: 8,
      'false-safe': 0,
      'false-conflict': 1,
      unresolved: 35,
    });
    expect(report.coverage).toMatchObject({
      total: 44,
      resolved: 5,
      possible: 0,
      unresolved: 39,
      byLocale: {
        en: { total: 11, resolved: 4, possible: 0, unresolved: 7 },
        es: { total: 11, resolved: 1, possible: 0, unresolved: 10 },
        de: { total: 11, resolved: 0, possible: 0, unresolved: 11 },
        ar: { total: 11, resolved: 0, possible: 0, unresolved: 11 },
      },
    });
    expect(report.results.every((result) => result.actual !== 'absent')).toBe(true);
    expect(report.errors).toEqual([]);
    expect(() => assertDietaryEvaluationReleaseGate(report)).not.toThrow();
  });
});
