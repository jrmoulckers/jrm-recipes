import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Regression guard for issue #129. The "Easy-reading text" preference must
 * actually LOAD a dyslexia-friendly typeface, not merely name one and hope the
 * reader has it installed.
 *
 * These assertions read the real source/asset files (the single source of
 * truth) so the feature can't silently regress to a system-font fallback:
 *   • a11y.css maps --font-body / --font-display onto the self-hosted
 *     --font-atkinson variable when [data-reading="readable"] is set.
 *   • the woff2 assets are committed (self-hosted → works offline in the PWA).
 *   • the OFL license ships alongside them.
 *   • the next/font loader exposes --font-atkinson with font-display: swap.
 *   • the root layout puts that variable on <html> so the CSS can resolve it.
 */

const ROOT = process.cwd();

// Quote style is a formatting concern, and Prettier's `singleQuote` applies to
// CSS attribute selectors too. Normalize it at each read so a formatter change
// cannot turn these assertions into ones that match nothing and pass.
const normalizeQuotes = (source: string) => source.replace(/'/g, '"');

const A11Y_CSS = normalizeQuotes(
  readFileSync(join(ROOT, 'src', 'styles', 'a11y.css'), 'utf8'),
).replace(/\/\*[\s\S]*?\*\//g, '');

const FONT_LOADER = normalizeQuotes(
  readFileSync(join(ROOT, 'src', 'fonts', 'atkinson.ts'), 'utf8'),
);

const LAYOUT = normalizeQuotes(readFileSync(join(ROOT, 'src', 'app', 'layout.tsx'), 'utf8'));

const FONT_DIR = join(ROOT, 'src', 'fonts', 'atkinson-hyperlegible');

const BARE_FAMILY = '"Atkinson Hyperlegible"';

const FONT_FILES = [
  'AtkinsonHyperlegible-Regular.woff2',
  'AtkinsonHyperlegible-Italic.woff2',
  'AtkinsonHyperlegible-Bold.woff2',
  'AtkinsonHyperlegible-BoldItalic.woff2',
] as const;

/** Grab the body of a top-level rule by its exact selector. */
function ruleBody(css: string, selector: string): string | null {
  const rules = css.matchAll(/([^{}]+)\{([^{}]*)\}/g);
  for (const rule of rules) {
    if ((rule[1] ?? '').trim() === selector) return (rule[2] ?? '').trim();
  }
  return null;
}

describe('easy-reading dyslexia font (issue #129)', () => {
  it('still matches a bare local family name, so the ban can fire (#750)', () => {
    // The ban below is the only check that can notice its violation: a bare
    // family name is *added* to a font stack beside `var(--font-atkinson)`, so
    // the positive assertions pass with it present. A negative over source text
    // passes whenever the literal is absent, and a misspelled literal is always
    // absent.
    expect('--font-body: "Atkinson Hyperlegible", var(--font-atkinson);').toContain(BARE_FAMILY);
  });

  it('maps body + display type onto the self-hosted --font-atkinson variable', () => {
    const body = ruleBody(A11Y_CSS, '[data-reading="readable"]');
    expect(body, '[data-reading=readable] rule should exist').not.toBeNull();
    expect(body).toMatch(/--font-body:\s*var\(--font-atkinson\)/);
    expect(body).toMatch(/--font-display:\s*var\(--font-atkinson\)/);
  });

  it("does not depend on a locally-installed 'Atkinson Hyperlegible' family", () => {
    const body = ruleBody(A11Y_CSS, '[data-reading="readable"]');
    // Assert the extraction before the ban (#844). This previously read
    // `?? ''`, which turned a rotted extractor -- renamed selector,
    // restructured rule -- into a clean pass, because an empty string contains
    // nothing. The sibling above happens to catch that today, but a ban should
    // not depend on an unrelated test to mean anything.
    expect(body, '[data-reading=readable] rule should exist').not.toBeNull();
    // The bare family name assumes the reader already has the font. The fix
    // loads it via the CSS variable instead.
    expect(body ?? '').not.toContain(BARE_FAMILY);
  });

  it('ships the self-hosted woff2 assets (offline-capable PWA)', () => {
    for (const file of FONT_FILES) {
      const path = join(FONT_DIR, file);
      expect(existsSync(path), `${file} should be committed`).toBe(true);
      const bytes = readFileSync(path);
      // woff2 magic number: 'wOF2'.
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
    }
  });

  it('includes the OFL license/attribution', () => {
    const ofl = join(FONT_DIR, 'OFL.txt');
    expect(existsSync(ofl)).toBe(true);
    const text = readFileSync(ofl, 'utf8');
    expect(text).toMatch(/SIL OPEN FONT LICENSE/i);
    expect(text).toMatch(/Braille Institute/i);
  });

  it('loads every weight/style via next/font with font-display: swap', () => {
    expect(FONT_LOADER).toContain('variable: "--font-atkinson"');
    expect(FONT_LOADER).toContain('display: "swap"');
    for (const file of FONT_FILES) {
      expect(FONT_LOADER).toContain(file);
    }
  });

  it('applies the font variable on <html> in the root layout', () => {
    expect(LAYOUT).toMatch(/from "~\/fonts\/atkinson"/);
    expect(LAYOUT).toContain('atkinson.variable');
  });
});
