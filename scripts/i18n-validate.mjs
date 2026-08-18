/**
 * Locale catalog parity check (issue #254).
 *
 * next-intl resolves messages from `src/messages/<locale>.json`, with English
 * (`DEFAULT_LOCALE`) as the source catalog. Translations drift over time: a new
 * key lands in `en.json` but not the others, or a stale key lingers after the
 * source drops it. This script flattens every supported catalog and compares it
 * against the source, reporting keys that are missing from or extra in each
 * target locale, any ICU placeholder mismatches for shared keys, and any key
 * whose translation is still byte-identical to the English source.
 *
 * That last check exists because key parity alone is not enough. A key can be
 * present in every catalog while its value is still English, so the catalogs
 * report "in sync" and a Spanish reader is served English anyway. Parity is a
 * check on structure, and this is the check on content.
 *
 * The set of locales and the source locale are read straight from
 * `src/config/i18n.ts` (the single source of truth) so QA-only pseudolocales
 * such as `en-XA.json` are ignored automatically.
 *
 * Usage:
 *   node scripts/i18n-validate.mjs            # human-readable report, exits 1 on drift
 *   node scripts/i18n-validate.mjs --json     # machine-readable report
 *   pnpm i18n:validate
 *
 * The pure helpers (flatten, extractPlaceholders, diffCatalog,
 * findUntranslated) are exported for reuse/testing. The CLI only runs when the
 * file is executed directly.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const messagesDir = resolve(repoRoot, 'src', 'messages');
const configPath = resolve(repoRoot, 'src', 'config', 'i18n.ts');

/** Cap on how many untranslated keys are listed before the report truncates. */
const MAX_LISTED = 20;

/**
 * Recursively flatten a nested catalog into dot-delimited leaf keys mapped to
 * their string values. Arrays are indexed (`items.0`) so ordered lists still
 * compare structurally.
 */
export function flatten(value, prefix = '', out = {}) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      flatten(entry, prefix ? `${prefix}.${index}` : String(index), out),
    );
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out[prefix] = value;
  }
  return out;
}

/**
 * Extract the top-level ICU argument names referenced by a message (`{count}`,
 * `{name, plural, ...}`) so a translation that drops or renames a placeholder is
 * flagged. Brace depth is tracked so plural/select *branch* bodies (e.g. the
 * `{person}` inside `one {person}`) are treated as literal text, not arguments.
 * Only the identifier opening a depth-0 `{...}` block counts. Returns a sorted,
 * de-duplicated list. Non-string values yield [].
 */
export function extractPlaceholders(message) {
  if (typeof message !== 'string') return [];
  const names = new Set();
  let depth = 0;
  for (let i = 0; i < message.length; i += 1) {
    const ch = message[i];
    if (ch === '{') {
      if (depth === 0) {
        const rest = message.slice(i + 1);
        const name = rest.match(/^\s*([a-zA-Z0-9_]+)\s*(?:,|\})/);
        if (name) names.add(name[1]);
      }
      depth += 1;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
    }
  }
  return [...names].sort();
}

/**
 * Values that may legitimately match English, keyed by locale. Keep this small
 * and justified: each entry is a claim that a native speaker would write the
 * English word. Anything not listed here is treated as untranslated.
 */
const ALLOWED_IDENTICAL = {
  de: new Set([
    'Plan',
    'Timer',
    'Start',
    'Familie',
    'Import',
    'Links',
    'Pause',
    'optional',
    '(optional)',
    'Status',
    'Vegan',
    'Moderation',
    'Admin',
    // "kcal" is the unit symbol in German too, so a string that is only a
    // number and that symbol is what a native speaker writes (#1047).
    '{value} kcal',
    '≤ {amount} kcal',
  ]),
  es: new Set([
    'Plan',
    'Timer',
    'Ideal',
    'Total',
    'total',
    'min',
    // Same as above: "kcal" is the Spanish unit symbol.
    '{value} kcal',
    '≤ {amount} kcal',
  ]),
  ar: new Set([]),
};

/** Brand and product nouns that stay in English for every locale. */
const BRAND_TERMS = /^(Heirloom|Heirloom Family|Family|PDF|URL|iOS|Android|Google|Apple|GitHub)$/;

/**
 * Example email addresses, bare domains, and file extensions are identifiers
 * rather than prose. They are conventionally left in Latin script even in
 * right-to-left locales, so an identical value carries no signal.
 */
const IDENTIFIER_LIKE = /^\S+@\S+\.\S+$|^(?:https?:\/\/)?\S+\.[a-z]{2,}$/;

/**
 * Find keys whose target value is byte-identical to the English source, which
 * means the key was copied but never actually translated.
 *
 * Key parity cannot detect this: the key exists in every locale, so the catalog
 * reports "in sync" while a Spanish reader is served English. Short or
 * caseless values ("OK", "{count}", "2x") carry no signal, so a value must
 * contain a run of at least three lowercase letters to be worth comparing.
 */
export function findUntranslated(sourceFlat, targetFlat, locale) {
  const allowed = ALLOWED_IDENTICAL[locale];
  const offenders = [];
  for (const [key, value] of Object.entries(sourceFlat)) {
    if (typeof value !== 'string') continue;
    if (!/[a-z]{3}/.test(value)) continue;
    if (BRAND_TERMS.test(value)) continue;
    if (IDENTIFIER_LIKE.test(value)) continue;
    if (allowed?.has(value)) continue;
    if (targetFlat[key] === value) offenders.push(key);
  }
  return offenders.sort();
}

/**
 * Compare one target catalog against the source, returning the keys missing
 * from the target, the extra keys it defines, the shared keys whose ICU
 * placeholders diverge, and the keys left untranslated.
 */
export function diffCatalog(sourceFlat, targetFlat, locale) {
  const sourceKeys = Object.keys(sourceFlat);
  const targetKeys = new Set(Object.keys(targetFlat));

  const missing = sourceKeys.filter((key) => !targetKeys.has(key));
  const extra = [...targetKeys].filter((key) => !(key in sourceFlat));

  const placeholderMismatches = [];
  for (const key of sourceKeys) {
    if (!targetKeys.has(key)) continue;
    const expected = extractPlaceholders(sourceFlat[key]);
    const actual = extractPlaceholders(targetFlat[key]);
    if (expected.join('\u0000') !== actual.join('\u0000')) {
      placeholderMismatches.push({ key, expected, actual });
    }
  }

  return {
    missing: missing.sort(),
    extra: extra.sort(),
    placeholderMismatches,
    untranslated: findUntranslated(sourceFlat, targetFlat, locale),
  };
}

/**
 * Flag catalog values that break the punctuation standard in
 * `docs/voice-and-tone.md`: no em dashes, no en dash used as a prose connector,
 * and no prose semicolons.
 *
 * This runs against every catalog including the source, because translators
 * reintroduce these constructions naturally. German in particular reaches for a
 * spaced en dash as its Gedankenstrich, which is correct German typography but
 * not this product's voice. A numeric range like `2-3` uses an unspaced en dash
 * and is left alone.
 */
export function findBannedPunctuation(flatCatalog) {
  const offenders = [];
  for (const [key, value] of Object.entries(flatCatalog)) {
    if (typeof value !== 'string') continue;
    const reasons = [];
    if (value.includes('\u2014')) reasons.push('em dash');
    if (/ \u2013 /.test(value)) reasons.push('en dash as a prose connector');
    if (/\w; \w/.test(value)) reasons.push('prose semicolon');
    if (reasons.length) offenders.push({ key, reasons });
  }
  return offenders;
}

/** Read a JSON catalog for a locale from src/messages. */
function loadCatalog(locale) {
  const file = resolve(messagesDir, `${locale}.json`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

/**
 * Pull SUPPORTED_LOCALES and DEFAULT_LOCALE out of the framework-free
 * `src/config/i18n.ts` without importing the TS module (this script runs under
 * plain Node). A tolerant regex is enough given the file's stable shape.
 */
export function readLocaleConfig(source) {
  const listMatch = source.match(/SUPPORTED_LOCALES\s*=\s*\[([^\]]*)\]\s*as const/);
  if (!listMatch) {
    throw new Error('Could not find SUPPORTED_LOCALES in src/config/i18n.ts');
  }
  const locales = [...listMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);

  const defaultMatch = source.match(/DEFAULT_LOCALE\s*:\s*Locale\s*=\s*['"]([^'"]+)['"]/);
  const defaultLocale = defaultMatch ? defaultMatch[1] : locales[0];

  return { locales, defaultLocale };
}

function main() {
  const asJson = process.argv.includes('--json');
  const { locales, defaultLocale } = readLocaleConfig(readFileSync(configPath, 'utf8'));

  const sourceFlat = flatten(loadCatalog(defaultLocale));
  const targets = locales.filter((locale) => locale !== defaultLocale);

  const report = {};
  const punctuation = {};
  let hasDrift = false;

  // The source catalog is not diffed against itself, but its punctuation still
  // has to hold, so this pass covers every locale.
  for (const locale of locales) {
    const flat = locale === defaultLocale ? sourceFlat : flatten(loadCatalog(locale));
    const offenders = findBannedPunctuation(flat);
    punctuation[locale] = offenders;
    if (offenders.length) hasDrift = true;
  }

  for (const locale of targets) {
    const result = diffCatalog(sourceFlat, flatten(loadCatalog(locale)), locale);
    report[locale] = result;
    if (
      result.missing.length ||
      result.extra.length ||
      result.placeholderMismatches.length ||
      result.untranslated.length
    ) {
      hasDrift = true;
    }
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          source: defaultLocale,
          sourceKeyCount: Object.keys(sourceFlat).length,
          locales: report,
          punctuation,
        },
        null,
        2,
      ),
    );
    process.exit(hasDrift ? 1 : 0);
  }

  console.log(
    `i18n: validating ${targets.length} locale(s) against "${defaultLocale}" ` +
      `(${Object.keys(sourceFlat).length} keys)\n`,
  );

  for (const locale of targets) {
    const { missing, extra, placeholderMismatches, untranslated } = report[locale];
    const ok =
      !missing.length && !extra.length && !placeholderMismatches.length && !untranslated.length;
    if (ok) {
      console.log(`  \u2713 ${locale}: in sync`);
      continue;
    }
    console.log(`  \u2717 ${locale}:`);
    if (missing.length) {
      console.log(`      missing ${missing.length} key(s):`);
      for (const key of missing) console.log(`        - ${key}`);
    }
    if (extra.length) {
      console.log(`      extra ${extra.length} key(s):`);
      for (const key of extra) console.log(`        + ${key}`);
    }
    for (const { key, expected, actual } of placeholderMismatches) {
      console.log(
        `      placeholder mismatch at ${key}: ` +
          `expected {${expected.join(', ')}} got {${actual.join(', ')}}`,
      );
    }
    if (untranslated.length) {
      const byNamespace = {};
      for (const key of untranslated) {
        const namespace = key.split('.')[0];
        byNamespace[namespace] = (byNamespace[namespace] ?? 0) + 1;
      }
      const summary = Object.entries(byNamespace)
        .sort((a, b) => b[1] - a[1])
        .map(([namespace, count]) => `${namespace}:${count}`)
        .join(', ');
      console.log(
        `      untranslated ${untranslated.length} key(s) still identical ` +
          `to ${defaultLocale} (${summary}):`,
      );
      for (const key of untranslated.slice(0, MAX_LISTED)) {
        console.log(`        = ${key}`);
      }
      if (untranslated.length > MAX_LISTED) {
        console.log(`        ... and ${untranslated.length - MAX_LISTED} more`);
      }
    }
  }

  const punctuationOffenders = Object.entries(punctuation).filter(
    ([, offenders]) => offenders.length,
  );
  if (punctuationOffenders.length) {
    console.log('\n  punctuation standard (docs/voice-and-tone.md):');
    for (const [locale, offenders] of punctuationOffenders) {
      console.log(`    \u2717 ${locale}: ${offenders.length} value(s)`);
      for (const { key, reasons } of offenders.slice(0, MAX_LISTED)) {
        console.log(`        ${key}: ${reasons.join(', ')}`);
      }
      if (offenders.length > MAX_LISTED) {
        console.log(`        ... and ${offenders.length - MAX_LISTED} more`);
      }
    }
  }

  console.log(
    hasDrift
      ? '\ni18n: catalogs are OUT OF SYNC. Resolve the differences above.'
      : '\ni18n: all catalogs are in sync.',
  );
  process.exit(hasDrift ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
