import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readRecipeCookingSelection, saveRecipeCookingSelection } from './recipe-cooking-selection';

describe('explicit recipe cooking selections', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('shares only explicitly changed fields and isolates recipes', () => {
    expect(readRecipeCookingSelection('one')).toEqual({});
    saveRecipeCookingSelection('one', { servings: 6 });
    expect(readRecipeCookingSelection('one')).toEqual({ servings: 6 });
    saveRecipeCookingSelection('one', { system: 'metric' });
    expect(readRecipeCookingSelection('one')).toEqual({ servings: 6, system: 'metric' });
    expect(readRecipeCookingSelection('two')).toEqual({});
    saveRecipeCookingSelection('one', { servings: 4 });
    expect(readRecipeCookingSelection('one')).toEqual({ servings: 4, system: 'metric' });
  });

  it.each(['{', 'null', '{"servings":0}', '{"servings":1001}', '{"system":"invalid"}'])(
    'reports invalid stored selections: %s',
    (raw) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      sessionStorage.setItem('heirloom:recipe-cooking-selection:one', raw);
      expect(readRecipeCookingSelection('one')).toEqual({});
      expect(warn).toHaveBeenCalledWith(
        'Unable to read recipe cooking selection',
        expect.any(Error),
      );
    },
  );

  it('reports storage write failures', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    });
    saveRecipeCookingSelection('one', { system: 'metric' });
    expect(warn).toHaveBeenCalledWith(
      'Unable to save recipe cooking selection',
      expect.any(DOMException),
    );
  });
});
