/**
 * Empty-alt justification check (decision D12 in docs/voice-and-tone.md).
 *
 * `alt=""` is correct for a decorative image whose meaning is already carried
 * by adjacent text, and wrong for an image that carries meaning of its own. The
 * two are indistinguishable by reading, because a skipped field and a
 * deliberate decision produce identical code. The standard resolves that by
 * requiring a comment next to every empty alt saying why it is empty.
 *
 * This enforces that rule, and also fails on a hardcoded alt string, which is
 * user-facing copy that belongs in the catalog. `i18next/no-literal-string`
 * covers the JSX case, but an alt built in a `.ts` helper is invisible to it.
 *
 * Usage:
 *   node scripts/alt-audit.mjs           # exits 1 on a bare or hardcoded alt
 *   node scripts/alt-audit.mjs --verbose # list every alt found
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { repoRoot, walkSource } from "./lib/walk-source.mjs";

/**
 * How many lines above an `alt=""` may hold its justifying comment.
 *
 * The comment usually sits above the enclosing conditional or JSX element
 * rather than immediately above the attribute, which puts it several lines up:
 *
 *   {/* Decorative: repeats the title below. *\/}
 *   {recipe.coverImageUrl ? (
 *     <CloudinaryImage
 *       src={recipe.coverImageUrl}
 *       alt=""
 *
 * Eight lines covers that shape without reaching so far that an unrelated
 * comment elsewhere in the file counts as justification.
 */
const COMMENT_LOOKBACK = 8;

const ALT_RE = /\balt=(""|"[^"]*"|\{[^}]*\})/;
const COMMENT_RE = /\/\/|\/\*|\{\s*\/\*/;

/**
 * Author-written alt text stored on the recipe itself.
 *
 * `recipes.coverImageAlt` and `recipe_steps.imageAlt` hold a description the
 * cook typed for their own photo, so it is content rather than catalog copy and
 * is never translated. Those reads look like an expression and would otherwise
 * be counted as "from the catalog", which overstates how much alt text the
 * catalog actually owns.
 *
 * A stored alt still needs a fallback for the rows that predate the field, and
 * that fallback is the part worth policing: `?? t(...)` gives the image a
 * generated description, while `?? ""` silently makes it decorative, so the
 * latter is held to the same comment rule as a plain `alt=""`.
 */
const STORED_ALT_RE = /\b(?:coverImageAlt|imageAlt)\b/;
const EMPTY_FALLBACK_RE = /\?\?\s*""\s*\}?$/;

/**
 * Classify every alt attribute in one file.
 *
 * `empty` means `alt=""`, split by whether a comment justifies it.
 * `literal` means a hardcoded string, which should come from the catalog.
 * `stored` means author-written alt read off the recipe, split the same way as
 * `empty` when it falls back to `""`.
 * `dynamic` means an expression, which is assumed to resolve through `t()`.
 */
export function auditFile(relPath, source) {
  const lines = source.split(/\r?\n/);
  const results = [];

  lines.forEach((line, index) => {
    const match = ALT_RE.exec(line);
    if (!match) return;

    const value = match[1];
    const location = `${relPath}:${index + 1}`;
    const justifiedBy = () =>
      COMMENT_RE.test(
        lines.slice(Math.max(0, index - COMMENT_LOOKBACK), index).join(" "),
      );

    if (value === '""') {
      results.push({
        location,
        kind: justifiedBy() ? "justified" : "bare",
      });
    } else if (value.startsWith('"')) {
      results.push({ location, kind: "literal", value });
    } else if (STORED_ALT_RE.test(value)) {
      results.push({
        location,
        kind:
          EMPTY_FALLBACK_RE.test(value) && !justifiedBy() ? "bare" : "stored",
      });
    } else {
      results.push({ location, kind: "dynamic" });
    }
  });

  return results;
}

function main() {
  const verbose = process.argv.includes("--verbose");

  const all = [];
  for (const rel of walkSource()) {
    all.push(...auditFile(rel, readFileSync(resolve(repoRoot, rel), "utf8")));
  }

  const bare = all.filter((r) => r.kind === "bare");
  const literal = all.filter((r) => r.kind === "literal");
  const justified = all.filter((r) => r.kind === "justified");
  const stored = all.filter((r) => r.kind === "stored");
  const dynamic = all.filter((r) => r.kind === "dynamic");

  console.log(
    `a11y: ${all.length} alt attribute(s): ${dynamic.length} from the catalog, ` +
      `${stored.length} written by the cook, ${justified.length} empty and ` +
      `justified, ${bare.length} empty and bare, ${literal.length} hardcoded.`,
  );

  if (verbose) {
    for (const result of all) {
      console.log(`  ${result.kind.padEnd(9)} ${result.location}`);
    }
  }

  for (const result of literal) {
    console.error(
      `HARDCODED ALT  ${result.location}  ${result.value}\n` +
        `    Alt text is user-facing copy. Read it from src/messages via t().`,
    );
  }

  for (const result of bare) {
    console.error(
      `UNJUSTIFIED alt=""  ${result.location}\n` +
        `    Add a comment saying why this image is decorative, or give it real\n` +
        `    alt text. See "Alt text" in docs/voice-and-tone.md.`,
    );
  }

  if (bare.length || literal.length) {
    process.exit(1);
  }
  console.log("a11y: every alt attribute is translated or justified.");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
