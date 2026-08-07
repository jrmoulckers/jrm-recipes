/**
 * Rich-text tag handler check.
 *
 * next-intl's `t.rich(key, handlers)` throws at runtime when the message
 * contains a tag that `handlers` does not supply. Nothing else catches this:
 * TypeScript does not read catalog values, and `i18next/no-literal-string` only
 * looks at JSX literals. The result is a page that renders fine in English and
 * crashes in another locale, which is the worst shape a bug can take because
 * the locale nobody develops in is the one that breaks.
 *
 * The check uses the *union* of tags across every locale for a key, not just
 * the English source. A translator can keep a tag the source later dropped, and
 * that stale tag still throws for readers of that locale alone.
 *
 * Usage:
 *   node scripts/i18n-rich-tags.mjs             # exits 1 when a handler is missing
 *   node scripts/i18n-rich-tags.mjs --verbose   # also list the passing call sites
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { flatten, readLocaleConfig } from "./i18n-validate.mjs";
import { repoRoot, walkSource } from "./lib/walk-source.mjs";

/**
 * Collect every rich-text tag used for each key, across all locales.
 * Returns a Map of full key to a Set of tag names.
 */
export function collectTagsByKey(flatCatalogs) {
  const tagsByKey = new Map();
  for (const flat of flatCatalogs) {
    for (const [key, value] of Object.entries(flat)) {
      if (typeof value !== "string") continue;
      for (const match of value.matchAll(/<([a-zA-Z][\w-]*)>/g)) {
        if (!tagsByKey.has(key)) tagsByKey.set(key, new Set());
        tagsByKey.get(key).add(match[1]);
      }
    }
  }
  return tagsByKey;
}

/**
 * Extract the handler names from a `t.rich` argument object by walking braces
 * from the opening `{` to its match. A regex alone cannot do this because
 * handler bodies contain their own braces and JSX.
 */
export function parseHandlers(source, openBraceIndex) {
  let depth = 0;
  let end = openBraceIndex;
  for (let i = openBraceIndex; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = source.slice(openBraceIndex, end + 1);
  return new Set(
    [...body.matchAll(/(?:^|[{,\s])([a-zA-Z][\w-]*)\s*:\s*\(/g)].map(
      (m) => m[1],
    ),
  );
}

/**
 * Check one file's `.rich(` call sites. A call's key may be written relative to
 * the namespace passed to `useTranslations`/`getTranslations`, so each
 * namespace in the file is tried as a prefix before the bare key.
 */
export function checkFile(relPath, source, tagsByKey) {
  const problems = [];
  const checked = [];
  if (!source.includes(".rich(")) return { problems, checked };

  const namespaces = [
    ...source.matchAll(/(?:useTranslations|getTranslations)\(\s*"([^"]+)"/g),
  ].map((m) => m[1]);

  for (const call of source.matchAll(/\.rich\(\s*"([^"]+)"\s*,\s*\{/g)) {
    const key = call[1];
    const handlers = parseHandlers(source, call.index + call[0].length - 1);

    const fullKey = namespaces
      .map((ns) => `${ns}.${key}`)
      .concat(key)
      .find((candidate) => tagsByKey.has(candidate));

    // A key with no tags in any catalog needs no handlers, so it is not a
    // failure. It is reported under --verbose because it usually means the
    // message lost its markup and the handlers are now dead code.
    if (!fullKey) {
      checked.push(`  no tags  ${relPath}  .rich("${key}")`);
      continue;
    }

    const tags = [...tagsByKey.get(fullKey)];
    const missing = tags.filter((tag) => !handlers.has(tag));
    if (missing.length) {
      problems.push({
        file: relPath,
        key: fullKey,
        tags,
        handlers: [...handlers],
        missing,
      });
    } else {
      checked.push(`  ok       ${relPath}  ${fullKey}  [${tags.join(",")}]`);
    }
  }

  return { problems, checked };
}

function main() {
  const verbose = process.argv.includes("--verbose");
  const { locales } = readLocaleConfig(
    readFileSync(resolve(repoRoot, "src", "config", "i18n.ts"), "utf8"),
  );

  const flatCatalogs = locales.map((locale) =>
    flatten(
      JSON.parse(
        readFileSync(
          resolve(repoRoot, "src", "messages", `${locale}.json`),
          "utf8",
        ),
      ),
    ),
  );

  const tagsByKey = collectTagsByKey(flatCatalogs);

  const allProblems = [];
  const allChecked = [];
  for (const rel of walkSource()) {
    const { problems, checked } = checkFile(
      rel,
      readFileSync(resolve(repoRoot, rel), "utf8"),
      tagsByKey,
    );
    allProblems.push(...problems);
    allChecked.push(...checked);
  }

  for (const problem of allProblems) {
    console.error(
      `MISSING HANDLER  ${problem.file}\n` +
        `    key:      ${problem.key}\n` +
        `    tags:     ${problem.tags.join(", ")}\n` +
        `    handlers: ${problem.handlers.join(", ") || "(none)"}\n` +
        `    missing:  ${problem.missing.join(", ")}\n`,
    );
  }

  const total = allChecked.length + allProblems.length;
  console.log(
    `i18n: checked ${total} t.rich call site(s) against ${locales.length} locale(s).`,
  );
  if (verbose) allChecked.forEach((line) => console.log(line));

  if (allProblems.length) {
    console.error(
      `\n${allProblems.length} call site(s) would throw at runtime. Add a handler for each tag listed above.`,
    );
    process.exit(1);
  }
  console.log("i18n: every rich-text tag has a handler.");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
