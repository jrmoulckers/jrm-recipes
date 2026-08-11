/**
 * Guards for the route-scoped message payload (#674).
 *
 * The point of these is that a *dropped namespace* fails in CI rather than as a
 * `MISSING_MESSAGE` in someone's UI. Two things have to hold:
 *
 * 1. the checked-in manifest still matches what the source tree actually needs;
 * 2. every page's default export is wrapped in `withRouteMessages`, because the
 *    page segment is the only boundary that re-renders on every navigation.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { analyzeRoutes, routePatternFor } from './lib/i18n-route-scope.mjs';
import { renderManifest } from './i18n-route-scope.mjs';
import { repoRoot, walkSource } from './lib/walk-source.mjs';

const APP = join(repoRoot, 'src', 'app');
const MANIFEST = join(repoRoot, 'src', 'i18n', 'route-namespaces.ts');

const analysis = analyzeRoutes();

describe('i18n route scope manifest', () => {
  it('is up to date with the source tree', async () => {
    const current = readFileSync(MANIFEST, 'utf8').replace(/\r\n/g, '\n');
    expect(current, 'src/i18n/route-namespaces.ts is stale — run `pnpm i18n:route-scope`').toBe(
      await renderManifest(analysis),
    );
    // Rendering goes through Prettier, whose first load is slow under Vitest.
  }, 30_000);

  it('resolves every `useTranslations` namespace statically', () => {
    // A computed namespace cannot be proven present in a narrowed payload, so
    // the generator refuses to emit one. Keep it that way.
    expect(analysis.dynamic).toEqual([]);
  });

  it('has no client component reading the catalog root', () => {
    // `useMessages()` or a bare `useTranslations()` reads the whole catalog and
    // would silently break once the payload is narrowed.
    expect(analysis.wantsAll).toBe(false);
  });

  it('covers every route', () => {
    const pages = walkSource(APP, ['.tsx']).filter((file) => file.endsWith('/page.tsx'));
    const patterns = new Set(analysis.routes.map(([pattern]) => pattern));
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(patterns).toContain(routePatternFor(join(repoRoot, page)));
    }
  });
});

describe('route-scoped provider coverage', () => {
  it('wraps every page default export in withRouteMessages', () => {
    // The root layout only carries the shell namespaces, so an unwrapped page
    // would render its feature copy as raw message keys.
    const pages = walkSource(APP, ['.tsx'])
      .filter((file) => file.endsWith('/page.tsx'))
      .map((file) => join(repoRoot, file));

    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      const source = readFileSync(page, 'utf8');
      // Quote-agnostic: the page is read as source text, so matching a
      // double-quoted specifier would pin this guard to the formatter's
      // `singleQuote` setting rather than to the import it is checking for.
      expect(source, `${page} does not import withRouteMessages`).toMatch(
        /from ['"]~\/components\/i18n\/route-messages['"]/,
      );
      expect(source, `${page} default export is not route-scoped`).toMatch(
        /export default withRouteMessages\(/,
      );
    }
  });
});
