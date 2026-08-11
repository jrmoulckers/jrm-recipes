import { describe, expect, it } from 'vitest';

import en from '~/messages/en.json';
import ar from '~/messages/ar.json';
import de from '~/messages/de.json';
import es from '~/messages/es.json';
import { matchRoutePattern, namespacesForPathname, pickMessages } from '~/i18n/messages';
import { ROUTE_NAMESPACES, SHELL_NAMESPACES } from '~/i18n/route-namespaces';

describe('matchRoutePattern', () => {
  it('matches a static route exactly', () => {
    expect(matchRoutePattern('/shopping')).toBe('/shopping');
  });

  it('matches the root route', () => {
    expect(matchRoutePattern('/')).toBe('/');
  });

  it('prefers a literal segment over a dynamic one', () => {
    // Both `/recipes/new` and `/recipes/:` (the legacy flat-URL redirect) have
    // two segments; the App Router serves the static one, so must we.
    expect(matchRoutePattern('/recipes/new')).toBe('/recipes/new');
    expect(matchRoutePattern('/recipes/tags')).toBe('/recipes/tags');
    expect(matchRoutePattern('/recipes/some-cook')).toBe('/recipes/:');
  });

  it('fills dynamic segments', () => {
    expect(matchRoutePattern('/recipes/ada/apple-pie')).toBe('/recipes/:/:');
    expect(matchRoutePattern('/recipes/ada/apple-pie/edit')).toBe('/recipes/:/:/edit');
    expect(matchRoutePattern('/groups/sunday-club/settings')).toBe('/groups/:/settings');
  });

  it('tolerates a trailing slash', () => {
    expect(matchRoutePattern('/shopping/')).toBe('/shopping');
  });

  it('returns null for an unknown path', () => {
    expect(matchRoutePattern('/nope/nope/nope/nope')).toBeNull();
  });
});

describe('namespacesForPathname', () => {
  it('always includes the persistent shell namespaces', () => {
    const namespaces = namespacesForPathname('/shopping');
    expect(namespaces).not.toBeNull();
    for (const shell of SHELL_NAMESPACES) {
      expect(namespaces).toContain(shell);
    }
  });

  it("adds the route's own namespaces", () => {
    expect(namespacesForPathname('/shopping')).toContain('shopping');
    expect(namespacesForPathname('/recipes/ada/pie/edit')).toContain('recipeEditor');
  });

  it("does not leak an unrelated feature's namespaces onto a route", () => {
    const namespaces = namespacesForPathname('/shopping');
    expect(namespaces).not.toContain('recipeEditor');
    expect(namespaces).not.toContain('billing');
    expect(namespaces).not.toContain('planner');
  });

  it('returns null (ship everything) when the route is unknown', () => {
    expect(namespacesForPathname('/not/a/real/route/at/all')).toBeNull();
  });

  it('returns null when the pathname header is missing', () => {
    expect(namespacesForPathname(null)).toBeNull();
    expect(namespacesForPathname(undefined)).toBeNull();
    expect(namespacesForPathname('')).toBeNull();
  });
});

describe('pickMessages', () => {
  const catalog = { a: { x: '1' }, b: { y: '2' }, c: { z: '3' } };

  it('keeps only the requested namespaces', () => {
    expect(pickMessages(catalog, ['a', 'c'])).toEqual({
      a: { x: '1' },
      c: { z: '3' },
    });
  });

  it('skips namespaces the catalog does not have', () => {
    expect(pickMessages(catalog, ['a', 'missing'])).toEqual({ a: { x: '1' } });
    expect(Object.keys(pickMessages(catalog, ['missing']))).toHaveLength(0);
  });

  it('returns the whole catalog for a null selection', () => {
    expect(pickMessages(catalog, null)).toBe(catalog);
  });
});

describe('manifest integrity', () => {
  const locales = { en, es, de, ar } as Record<string, Record<string, unknown>>;
  const referenced = [...SHELL_NAMESPACES, ...Object.values(ROUTE_NAMESPACES).flat()];

  it('references only namespaces that exist in every locale', () => {
    for (const namespace of new Set(referenced)) {
      for (const [locale, catalog] of Object.entries(locales)) {
        expect(
          Object.hasOwn(catalog, namespace),
          `${locale}.json is missing the "${namespace}" namespace`,
        ).toBe(true);
      }
    }
  });

  it("never repeats a shell namespace in a route's own set", () => {
    for (const [pattern, namespaces] of Object.entries(ROUTE_NAMESPACES)) {
      for (const namespace of namespaces) {
        expect(
          SHELL_NAMESPACES.includes(namespace),
          `${pattern} duplicates shell namespace "${namespace}"`,
        ).toBe(false);
      }
    }
  });

  it('resolves a real payload for the RTL locale', () => {
    const namespaces = namespacesForPathname('/recipes/ada/pie');
    const arabic = ar as Record<string, unknown>;
    const picked = pickMessages(arabic, namespaces);
    expect(Object.keys(picked)).toEqual(namespaces);
    expect(Object.keys(picked).length).toBeLessThan(Object.keys(arabic).length);
  });

  it('ships materially less than the whole catalog on a typical route', () => {
    const whole = JSON.stringify(en).length;
    const scoped = JSON.stringify(pickMessages(en, namespacesForPathname('/shopping'))).length;
    expect(scoped).toBeLessThan(whole / 2);
  });
});
