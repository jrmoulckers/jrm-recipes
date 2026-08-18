import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NUTRIENT_REGISTRY } from '~/lib/nutrients';

/**
 * The editor's `NUTRITION_FIELDS` is a hand-written mirror of the nutrient
 * registry rather than a projection of it, because the list renders eagerly and
 * the edit route's first-load budget has zero headroom — importing the registry
 * there put the route 1 kB over on Linux CI.
 *
 * A mirror without a guard is exactly the drift #1028 set out to remove, so the
 * guard lives here: this reads the literal out of the source and asserts it
 * matches the registry key for key, unit for unit, in order. Adding a nutrient
 * to the registry fails this test until the editor list is updated, which is the
 * difference between a mirror and a duplicate.
 */
const SOURCE = readFileSync(
  join(process.cwd(), 'src', 'components', 'recipe', 'recipe-editor.tsx'),
  'utf8',
);

function parseNutritionFields(): { key: string; unit: string }[] {
  const block = /const NUTRITION_FIELDS = \[([\s\S]*?)\] as const/.exec(SOURCE);
  if (!block?.[1]) throw new Error('NUTRITION_FIELDS literal not found in recipe-editor.tsx');
  return [...block[1].matchAll(/\{ key: '([^']+)', unit: '([^']+)' \}/g)].map((m) => ({
    key: m[1]!,
    unit: m[2]!,
  }));
}

describe('recipe editor NUTRITION_FIELDS', () => {
  it('mirrors the nutrient registry exactly, in registry order', () => {
    expect(parseNutritionFields()).toEqual(
      NUTRIENT_REGISTRY.map((n) => ({ key: n.nutritionKey, unit: n.unit })),
    );
  });

  it('does not import the registry eagerly (first-load budget)', () => {
    const eagerImport = /^import .*from '~\/lib\/nutrients';$/m.test(SOURCE);
    expect(eagerImport, 'the registry must stay on the lazy estimate chunk').toBe(false);
    expect(SOURCE).toContain("await import('~/lib/nutrients')");
  });
});
