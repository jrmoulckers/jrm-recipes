/**
 * English-leakage scan for translated catalogs.
 *
 * `findUntranslated` in i18n-validate.mjs only catches values that are
 * byte-identical to the English source. That misses the more common failure:
 * a value that was edited, reformatted, or partially localized but left in
 * English. Those keys differ from the source, so parity and identity checks
 * both report success while a Spanish reader is served English.
 *
 * This looks for English function words instead, which is an independent
 * signal. It is a heuristic, so it is deliberately built to have no known false
 * positives. A guard that reports noise gets muted, and a muted guard protects
 * nothing.
 *
 * The noise it would otherwise produce is structural rather than per-key, so it
 * is removed at the root rather than allowlisted:
 *
 *   - ICU placeholder *names* are English identifiers (`{done} of {total}`
 *     becomes `{done} von {total}` in German). The braces are stripped before
 *     scanning, so the placeholder name is never read as prose.
 *   - Markup tag names are English (`<strong>`), and are stripped for the same
 *     reason. Their text content is kept and still scanned.
 *   - Example addresses and domains (`you@example.com`) are identifiers that
 *     stay in Latin script in every locale.
 *
 * Stripping beats allowlisting here because an allowlisted key stops being
 * checked entirely, so real English added to it later would slip through.
 *
 * Usage:
 *   node scripts/i18n-english-leak.mjs           # exits 1 on a suspected leak
 *   node scripts/i18n-english-leak.mjs --json
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { flatten, readLocaleConfig } from './i18n-validate.mjs';
import { repoRoot } from './lib/walk-source.mjs';

/**
 * Function words that are unambiguously English and are not also words in the
 * target languages. Kept to common closed-class words plus a few product verbs,
 * because those are what a half-finished translation leaves behind.
 */
const ENGLISH_WORDS = [
  'the',
  'and',
  'with',
  'your',
  'you',
  'this',
  'that',
  'from',
  'have',
  'when',
  'what',
  'will',
  'each',
  'into',
  'them',
  'they',
  'these',
  'there',
  'again',
  'back',
  'about',
  'before',
  'after',
  'every',
  'some',
  'only',
  'still',
  'which',
  'would',
  'could',
  'should',
  'been',
  'were',
  'does',
  'add',
  'added',
  'save',
  'saved',
  'cook',
  'cooking',
  'step',
  'steps',
  'recipe',
  'ingredients',
  'done',
  'close',
  'open',
  'next',
];

const ENGLISH_RE = new RegExp(`\\b(${ENGLISH_WORDS.join('|')})\\b`, 'i');

/** Example addresses, bare domains, and URLs are identifiers, not prose. */
const IDENTIFIER_LIKE = /^\S+@\S+\.\S+$|^(?:https?:\/\/)?\S+\.[a-z]{2,}$/;

/**
 * Remove the parts of a message that are structurally English regardless of
 * how well it was translated: ICU placeholders and markup tag names. The text
 * between tags is preserved, so real English inside a tag is still caught.
 */
export function stripNonProse(value) {
  return value.replace(/\{[^{}]*\}/g, ' ').replace(/<\/?[a-zA-Z][\w-]*\s*\/?>/g, ' ');
}

/**
 * Find keys in `targetFlat` whose value still looks like English.
 *
 * A hit requires the same English word to appear in the source value too.
 * Without that, any coincidental match (a loanword, a brand name) would be
 * reported. Sharing the word with the source is what makes it look copied.
 */
export function findEnglishLeaks(sourceFlat, targetFlat) {
  const leaks = [];
  for (const [key, value] of Object.entries(targetFlat)) {
    if (typeof value !== 'string') continue;
    if (IDENTIFIER_LIKE.test(value.trim())) continue;

    const prose = stripNonProse(value);
    const match = ENGLISH_RE.exec(prose);
    if (!match) continue;

    const source = sourceFlat[key];
    if (typeof source !== 'string') continue;

    const word = match[1].toLowerCase();
    if (!new RegExp(`\\b${word}\\b`, 'i').test(stripNonProse(source))) continue;

    leaks.push({ key, word, source, value });
  }
  return leaks;
}

function loadFlat(locale) {
  return flatten(
    JSON.parse(readFileSync(resolve(repoRoot, 'src', 'messages', `${locale}.json`), 'utf8')),
  );
}

function main() {
  const asJson = process.argv.includes('--json');
  const { locales, defaultLocale } = readLocaleConfig(
    readFileSync(resolve(repoRoot, 'src', 'config', 'i18n.ts'), 'utf8'),
  );

  const sourceFlat = loadFlat(defaultLocale);
  const targets = locales.filter((locale) => locale !== defaultLocale);

  const report = {};
  let total = 0;
  for (const locale of targets) {
    const leaks = findEnglishLeaks(sourceFlat, loadFlat(locale));
    report[locale] = leaks;
    total += leaks.length;
  }

  if (asJson) {
    console.log(JSON.stringify({ source: defaultLocale, report }, null, 2));
    process.exit(total ? 1 : 0);
  }

  console.log(
    `i18n: scanning ${targets.length} locale(s) for English left in translated values.\n`,
  );

  for (const locale of targets) {
    const leaks = report[locale];
    if (!leaks.length) {
      console.log(`  ✓ ${locale}: no English detected`);
      continue;
    }
    console.error(`  ✗ ${locale}: ${leaks.length} suspected leak(s)`);
    for (const leak of leaks) {
      console.error(
        `      ${leak.key}  (matched "${leak.word}")\n` +
          `        ${defaultLocale}: ${leak.source}\n` +
          `        ${locale}: ${leak.value}`,
      );
    }
  }

  if (total) {
    console.error(
      `\ni18n: ${total} value(s) look untranslated. Translate them, or if the match is genuinely a false positive, narrow the heuristic rather than muting the key.`,
    );
    process.exit(1);
  }
  console.log('\ni18n: no English leakage detected.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
