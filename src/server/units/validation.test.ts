import { describe, expect, it } from 'vitest';

import { customUnitInput, unitPreferencesInput } from './validation';

describe('unitPreferencesInput', () => {
  it('applies sensible defaults', () => {
    const parsed = unitPreferencesInput.parse({});
    expect(parsed).toEqual({
      defaultSystem: 'metric',
      autoConvert: true,
      packageRounding: false,
    });
  });

  it('accepts matching per-dimension overrides', () => {
    const parsed = unitPreferencesInput.parse({
      defaultSystem: 'us',
      volumeUnit: 'cup',
      massUnit: 'oz',
      temperatureUnit: '°F',
      autoConvert: false,
    });
    expect(parsed.volumeUnit).toBe('cup');
    expect(parsed.massUnit).toBe('oz');
    expect(parsed.temperatureUnit).toBe('°F');
  });

  it('accepts a custom (unknown) unit name as a volume override', () => {
    const parsed = unitPreferencesInput.parse({ volumeUnit: 'splash' });
    expect(parsed.volumeUnit).toBe('splash');
  });

  it('rejects a built-in unit of the wrong dimension', () => {
    expect(() => unitPreferencesInput.parse({ volumeUnit: 'g' })).toThrow();
    expect(() => unitPreferencesInput.parse({ massUnit: 'cup' })).toThrow();
    expect(() => unitPreferencesInput.parse({ temperatureUnit: 'cup' })).toThrow();
  });
});

describe('customUnitInput', () => {
  it('accepts a display-only unit with no equivalence', () => {
    const parsed = customUnitInput.parse({
      name: '  knob  ',
      dimension: 'mass',
    });
    expect(parsed.name).toBe('knob');
    expect(parsed.baseUnit).toBeUndefined();
    expect(parsed.baseAmount).toBeUndefined();
    expect(parsed.displayAsTrue).toBe(false);
  });

  it('accepts a unit with a valid equivalence (pinch = 1/16 tsp)', () => {
    const parsed = customUnitInput.parse({
      name: 'pinch',
      dimension: 'volume',
      baseUnit: 'tsp',
      baseAmount: 1 / 16,
    });
    expect(parsed.baseUnit).toBe('tsp');
    expect(parsed.baseAmount).toBeCloseTo(0.0625, 6);
  });

  it('requires both halves of an equivalence, or neither', () => {
    expect(() =>
      customUnitInput.parse({
        name: 'pinch',
        dimension: 'volume',
        baseUnit: 'tsp',
      }),
    ).toThrow();
    expect(() =>
      customUnitInput.parse({
        name: 'pinch',
        dimension: 'volume',
        baseAmount: 2,
      }),
    ).toThrow();
  });

  it('rejects an equivalence unit of the wrong dimension', () => {
    expect(() =>
      customUnitInput.parse({
        name: 'pinch',
        dimension: 'volume',
        baseUnit: 'g',
        baseAmount: 1,
      }),
    ).toThrow();
  });

  it("rejects a non-positive amount and a name that's too long", () => {
    expect(() =>
      customUnitInput.parse({
        name: 'pinch',
        dimension: 'volume',
        baseUnit: 'tsp',
        baseAmount: 0,
      }),
    ).toThrow();
    expect(() => customUnitInput.parse({ name: 'x'.repeat(41), dimension: 'mass' })).toThrow();
  });
});
