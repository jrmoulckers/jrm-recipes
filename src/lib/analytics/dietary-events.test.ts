import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  sanitizeDietaryEventProperties,
  type DietaryAnalyticsEventName,
  type DietaryEventProperties,
} from './dietary-events';
import { type EventProperties } from './events';

const VALID_EVENTS = {
  dietary_analysis_enablement_changed: { enabled: true },
  dietary_model_download_finished: {
    outcome: 'succeeded',
    errorCode: 'none',
  },
  dietary_device_support_checked: { support: 'webgpu' },
  dietary_analysis_finished: {
    outcome: 'succeeded',
    trigger: 'recipe_open',
    errorCode: 'none',
  },
} satisfies {
  [K in DietaryAnalyticsEventName]: DietaryEventProperties[K];
};

const FORBIDDEN_PROPERTIES = [
  'ingredient',
  'ingredientId',
  'ingredientText',
  'recipeId',
  'recipeText',
  'profileId',
  'profileName',
  'restrictionId',
  'restrictionName',
  'ruleId',
  'ruleText',
  'severity',
  'verdict',
  'conflict',
  'conflictState',
  'evidence',
  'correction',
  'correctionId',
  'fingerprint',
  'ingredientFingerprint',
  'modelInput',
  'modelOutput',
  'error',
  'rawError',
  'exception',
  'exceptionMessage',
  'exceptionText',
] as const;

describe('dietary analytics contract', () => {
  it('is part of the exhaustive analytics event taxonomy', () => {
    expectTypeOf<EventProperties>().toMatchTypeOf<DietaryEventProperties>();
    expectTypeOf<
      keyof EventProperties['dietary_analysis_enablement_changed']
    >().toEqualTypeOf<'enabled'>();
    expectTypeOf<keyof EventProperties['dietary_model_download_finished']>().toEqualTypeOf<
      'outcome' | 'errorCode'
    >();
    expectTypeOf<
      keyof EventProperties['dietary_device_support_checked']
    >().toEqualTypeOf<'support'>();
    expectTypeOf<keyof EventProperties['dietary_analysis_finished']>().toEqualTypeOf<
      'outcome' | 'trigger' | 'errorCode'
    >();
  });

  it.each(Object.keys(VALID_EVENTS) as DietaryAnalyticsEventName[])(
    'accepts the exact bounded payload for %s',
    (name) => {
      expect(sanitizeDietaryEventProperties(name, VALID_EVENTS[name])).toEqual(VALID_EVENTS[name]);
    },
  );

  it('accepts fixed failure codes without raw error text', () => {
    expect(
      sanitizeDietaryEventProperties('dietary_model_download_finished', {
        outcome: 'failed',
        errorCode: 'integrity_check_failed',
      }),
    ).toEqual({
      outcome: 'failed',
      errorCode: 'integrity_check_failed',
    });
    expect(
      sanitizeDietaryEventProperties('dietary_analysis_finished', {
        outcome: 'failed',
        trigger: 'library_scan',
        errorCode: 'worker_failed',
      }),
    ).toEqual({
      outcome: 'failed',
      trigger: 'library_scan',
      errorCode: 'worker_failed',
    });
  });

  it.each(FORBIDDEN_PROPERTIES)('rejects forbidden property %s', (property) => {
    expect(
      sanitizeDietaryEventProperties('dietary_analysis_finished', {
        ...VALID_EVENTS.dietary_analysis_finished,
        [property]: 'CANARY shellfish allergy',
      }),
    ).toBeNull();
  });

  it('rejects unbounded values, mismatched outcomes, and raw exceptions', () => {
    expect(
      sanitizeDietaryEventProperties('dietary_analysis_finished', {
        outcome: 'succeeded',
        trigger: 'CANARY shellfish allergy',
        errorCode: 'none',
      }),
    ).toBeNull();
    expect(
      sanitizeDietaryEventProperties('dietary_model_download_finished', {
        outcome: 'succeeded',
        errorCode: 'network_unavailable',
      }),
    ).toBeNull();
    expect(
      sanitizeDietaryEventProperties('dietary_analysis_finished', {
        outcome: 'failed',
        trigger: 'recipe_save',
        errorCode: new Error('CANARY shellfish allergy'),
      }),
    ).toBeNull();
  });

  it('rejects unknown events in the dietary namespace', () => {
    expect(
      sanitizeDietaryEventProperties('dietary_recipe_assessed', {
        verdict: 'CANARY shellfish allergy',
      }),
    ).toBeNull();
  });

  it('leaves non-dietary events to the general analytics scrubber', () => {
    expect(sanitizeDietaryEventProperties('recipe_created', {})).toBeUndefined();
  });
});
