/**
 * Tests for the copy guards.
 *
 * These matter more than most script tests. A guard that is subtly broken
 * reports success forever, which is worse than having no guard at all: the
 * green check actively discourages anyone from looking. `stripNonProse` is the
 * clearest example. It exists to remove false positives, so if it strips too
 * much the English scan goes permanently blind and still prints a tick.
 */
import { describe, expect, it } from 'vitest';

import { auditFile } from './alt-audit.mjs';
import { findEnglishLeaks, stripNonProse } from './i18n-english-leak.mjs';
import { checkFile, collectTagsByKey, parseHandlers } from './i18n-rich-tags.mjs';

describe('stripNonProse', () => {
  it('removes ICU placeholders, whose names are English identifiers', () => {
    expect(stripNonProse('{done} von {total}')).not.toMatch(/done|total/);
  });

  it('removes markup tag names but keeps the text inside them', () => {
    const result = stripNonProse('<strong>Rezept</strong> und mehr');
    expect(result).not.toMatch(/strong/);
    expect(result).toMatch(/Rezept/);
  });

  it('leaves ordinary prose intact, so the scan can still see English', () => {
    expect(stripNonProse('Save the recipe')).toBe('Save the recipe');
  });
});

describe('findEnglishLeaks', () => {
  const source = { greeting: 'Save the recipe', count: '{done} of {total}' };

  it('flags a value left in English', () => {
    const leaks = findEnglishLeaks(source, { greeting: 'Save the recipe' });
    expect(leaks).toHaveLength(1);
    expect(leaks[0].key).toBe('greeting');
  });

  it('flags English that was reworded, which an identity check cannot catch', () => {
    const target = { greeting: 'Save the recipe now please' };
    expect(target.greeting).not.toBe(source.greeting);
    expect(findEnglishLeaks(source, target)).toHaveLength(1);
  });

  it('accepts a real translation', () => {
    expect(findEnglishLeaks(source, { greeting: 'Guarda la receta' })).toEqual([]);
  });

  it('does not flag a translation whose only English is a placeholder name', () => {
    expect(findEnglishLeaks(source, { count: '{done} von {total}' })).toEqual([]);
  });

  it('does not flag example email addresses', () => {
    const identifiers = { email: 'you@example.com' };
    expect(findEnglishLeaks(identifiers, identifiers)).toEqual([]);
  });
});

describe('parseHandlers', () => {
  it('reads handler names past nested braces in their bodies', () => {
    const source = 't.rich("k", { code: (c) => <code>{c}</code>, file: (c) => <b>{c}</b> })';
    const handlers = parseHandlers(source, source.indexOf('{ code'));
    expect([...handlers].sort()).toEqual(['code', 'file']);
  });
});

describe('collectTagsByKey', () => {
  it('unions tags across locales, since a stale tag only throws in its locale', () => {
    const tags = collectTagsByKey([{ intro: '<b>hi</b>' }, { intro: '<b>hola</b> <i>si</i>' }]);
    expect([...tags.get('intro')].sort()).toEqual(['b', 'i']);
  });
});

describe('checkFile', () => {
  const tags = collectTagsByKey([{ 'ns.intro': '<b>hi</b> <i>there</i>' }]);

  it('reports a tag with no handler', () => {
    const source = [
      'const t = useTranslations("ns");',
      't.rich("intro", { b: (c) => <b>{c}</b> })',
    ].join('\n');
    const { problems } = checkFile('f.tsx', source, tags);
    expect(problems).toHaveLength(1);
    expect(problems[0].missing).toEqual(['i']);
  });

  it('passes when every tag has a handler', () => {
    const source = [
      'const t = useTranslations("ns");',
      't.rich("intro", { b: (c) => <b>{c}</b>, i: (c) => <i>{c}</i> })',
    ].join('\n');
    expect(checkFile('f.tsx', source, tags).problems).toEqual([]);
  });
});

describe('auditFile', () => {
  it('flags an empty alt with no justifying comment', () => {
    const results = auditFile('f.tsx', '<img src={x} alt="" />');
    expect(results[0].kind).toBe('bare');
  });

  it('accepts an empty alt justified by a nearby comment', () => {
    const source = [
      '{/* Decorative: repeats the title below. */}',
      '{cover ? (',
      '  <Image',
      '    src={cover}',
      '    alt=""',
    ].join('\n');
    expect(auditFile('f.tsx', source)[0].kind).toBe('justified');
  });

  it('does not let a distant comment justify an empty alt', () => {
    const source = [
      '// unrelated comment',
      ...Array.from({ length: 9 }, (_, i) => `const filler${i} = 1;`),
      '<img alt="" />',
    ].join('\n');
    expect(auditFile('f.tsx', source)[0].kind).toBe('bare');
  });

  it('flags a hardcoded alt string as untranslated copy', () => {
    const results = auditFile('f.tsx', '<img alt="Group avatar" />');
    expect(results[0].kind).toBe('literal');
  });

  it('treats an expression alt as catalog-backed', () => {
    const results = auditFile('f.tsx', '<img alt={t("photoAlt")} />');
    expect(results[0].kind).toBe('dynamic');
  });

  it('counts author-written alt separately from catalog copy', () => {
    const results = auditFile('f.tsx', '<img alt={step.imageAlt ?? t("stepImageAlt")} />');
    expect(results[0].kind).toBe('stored');
  });

  it('flags author-written alt that falls back to decorative with no reason', () => {
    const results = auditFile('f.tsx', '<img alt={recipe.coverImageAlt ?? ""} />');
    expect(results[0].kind).toBe('bare');
  });

  it('accepts a decorative fallback justified by a nearby comment', () => {
    const source = [
      '{/* Decorative: the title sits right beside it. */}',
      '<img alt={recipe.coverImageAlt ?? ""} />',
    ].join('\n');
    expect(auditFile('f.tsx', source)[0].kind).toBe('stored');
  });
});
