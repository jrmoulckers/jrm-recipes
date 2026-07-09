/**
 * Locale catalog parity check (issue #254).
 *
 * next-intl resolves messages from `src/messages/<locale>.json`, with English
 * (`DEFAULT_LOCALE`) as the source catalog. Translations drift over time: a new
 * key lands in `en.json` but not the others, or a stale key lingers after the
 * source drops it. This script flattens every supported catalog and compares it
 * against the source, reporting keys that are missing from or extra in each
 * target locale, plus any ICU placeholder mismatches for shared keys.
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
 * The pure helpers (flatten, extractPlaceholders, diffCatalog) are exported for
 * reuse/testing; the CLI only runs when the file is executed directly.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const messagesDir = resolve(repoRoot, "src", "messages");
const configPath = resolve(repoRoot, "src", "config", "i18n.ts");

/**
 * Recursively flatten a nested catalog into dot-delimited leaf keys mapped to
 * their string values. Arrays are indexed (`items.0`) so ordered lists still
 * compare structurally.
 */
export function flatten(value, prefix = "", out = {}) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      flatten(entry, prefix ? `${prefix}.${index}` : String(index), out),
    );
  } else if (value !== null && typeof value === "object") {
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
 * `{person}` inside `one {person}`) are treated as literal text, not arguments —
 * only the identifier opening a depth-0 `{...}` block counts. Returns a sorted,
 * de-duplicated list; non-string values yield [].
 */
export function extractPlaceholders(message) {
  if (typeof message !== "string") return [];
  const names = new Set();
  let depth = 0;
  for (let i = 0; i < message.length; i += 1) {
    const ch = message[i];
    if (ch === "{") {
      if (depth === 0) {
        const rest = message.slice(i + 1);
        const name = rest.match(/^\s*([a-zA-Z0-9_]+)\s*(?:,|\})/);
        if (name) names.add(name[1]);
      }
      depth += 1;
    } else if (ch === "}") {
      depth = Math.max(0, depth - 1);
    }
  }
  return [...names].sort();
}

/**
 * Compare one target catalog against the source, returning the keys missing
 * from the target, the extra keys it defines, and the shared keys whose ICU
 * placeholders diverge.
 */
export function diffCatalog(sourceFlat, targetFlat) {
  const sourceKeys = Object.keys(sourceFlat);
  const targetKeys = new Set(Object.keys(targetFlat));

  const missing = sourceKeys.filter((key) => !targetKeys.has(key));
  const extra = [...targetKeys].filter((key) => !(key in sourceFlat));

  const placeholderMismatches = [];
  for (const key of sourceKeys) {
    if (!targetKeys.has(key)) continue;
    const expected = extractPlaceholders(sourceFlat[key]);
    const actual = extractPlaceholders(targetFlat[key]);
    if (expected.join("\u0000") !== actual.join("\u0000")) {
      placeholderMismatches.push({ key, expected, actual });
    }
  }

  return {
    missing: missing.sort(),
    extra: extra.sort(),
    placeholderMismatches,
  };
}

/** Read a JSON catalog for a locale from src/messages. */
function loadCatalog(locale) {
  const file = resolve(messagesDir, `${locale}.json`);
  return JSON.parse(readFileSync(file, "utf8"));
}

/**
 * Pull SUPPORTED_LOCALES and DEFAULT_LOCALE out of the framework-free
 * `src/config/i18n.ts` without importing the TS module (this script runs under
 * plain Node). A tolerant regex is enough given the file's stable shape.
 */
export function readLocaleConfig(source) {
  const listMatch = source.match(
    /SUPPORTED_LOCALES\s*=\s*\[([^\]]*)\]\s*as const/,
  );
  if (!listMatch) {
    throw new Error("Could not find SUPPORTED_LOCALES in src/config/i18n.ts");
  }
  const locales = [...listMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

  const defaultMatch = source.match(
    /DEFAULT_LOCALE\s*:\s*Locale\s*=\s*"([^"]+)"/,
  );
  const defaultLocale = defaultMatch ? defaultMatch[1] : locales[0];

  return { locales, defaultLocale };
}

function main() {
  const asJson = process.argv.includes("--json");
  const { locales, defaultLocale } = readLocaleConfig(
    readFileSync(configPath, "utf8"),
  );

  const sourceFlat = flatten(loadCatalog(defaultLocale));
  const targets = locales.filter((locale) => locale !== defaultLocale);

  const report = {};
  let hasDrift = false;

  for (const locale of targets) {
    const result = diffCatalog(sourceFlat, flatten(loadCatalog(locale)));
    report[locale] = result;
    if (
      result.missing.length ||
      result.extra.length ||
      result.placeholderMismatches.length
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
    const { missing, extra, placeholderMismatches } = report[locale];
    const ok =
      !missing.length && !extra.length && !placeholderMismatches.length;
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
          `expected {${expected.join(", ")}} got {${actual.join(", ")}}`,
      );
    }
  }

  console.log(
    hasDrift
      ? "\ni18n: catalogs are OUT OF SYNC \u2014 resolve the differences above."
      : "\ni18n: all catalogs are in sync.",
  );
  process.exit(hasDrift ? 1 : 0);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
