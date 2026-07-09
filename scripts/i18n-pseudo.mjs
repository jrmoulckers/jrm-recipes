/**
 * Pseudolocale generator for i18n QA (issue #254).
 *
 * Produces a synthetic catalog from the source (English) messages so untranslated
 * strings, truncation, and hard-coded copy are obvious at a glance without a real
 * translation. Every translatable character is accented, the text is padded ~40%
 * to surface layout that can't absorb longer languages, and the whole string is
 * bracketed so anything rendered *without* brackets is a string that never went
 * through i18n. ICU placeholders (`{name}`, `{count, plural, ...}`) and simple
 * `<tag>` markup are preserved verbatim so the message still parses.
 *
 * The generated catalog is written to `src/messages/en-XA.json` by default
 * (`en-XA` is the conventional pseudolocale tag). It is intentionally NOT added
 * to SUPPORTED_LOCALES, so it ships nowhere and the parity validator ignores it;
 * point next-intl at it manually during a QA pass.
 *
 * Usage:
 *   node scripts/i18n-pseudo.mjs                 # write src/messages/en-XA.json
 *   node scripts/i18n-pseudo.mjs --check         # verify it is up to date (exit 1 if stale)
 *   node scripts/i18n-pseudo.mjs --out path.json # custom output path
 *   pnpm i18n:pseudo
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readLocaleConfig } from "./i18n-validate.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const messagesDir = resolve(repoRoot, "src", "messages");
const configPath = resolve(repoRoot, "src", "config", "i18n.ts");

/** Latin-1 look-alikes so accented text stays readable but visibly "off". */
const ACCENTS = {
  a: "\u00e5",
  b: "\u0180",
  c: "\u00e7",
  d: "\u00f0",
  e: "\u00e9",
  f: "\u0192",
  g: "\u011d",
  h: "\u0125",
  i: "\u00ee",
  j: "\u0135",
  k: "\u0137",
  l: "\u013c",
  m: "\u1e3f",
  n: "\u00f1",
  o: "\u00f8",
  p: "\u00fe",
  q: "\u01eb",
  r: "\u0155",
  s: "\u0161",
  t: "\u0163",
  u: "\u00fc",
  v: "\u1e7d",
  w: "\u0175",
  x: "\u1e8b",
  y: "\u00fd",
  z: "\u017e",
  A: "\u00c5",
  B: "\u0181",
  C: "\u00c7",
  D: "\u00d0",
  E: "\u00c9",
  F: "\u0191",
  G: "\u011c",
  H: "\u0124",
  I: "\u00ce",
  J: "\u0134",
  K: "\u0136",
  L: "\u013b",
  M: "\u1e3e",
  N: "\u00d1",
  O: "\u00d8",
  P: "\u00de",
  Q: "\u01ea",
  R: "\u0154",
  S: "\u0160",
  T: "\u0162",
  U: "\u00dc",
  V: "\u1e7c",
  W: "\u0174",
  X: "\u1e8a",
  Y: "\u00dd",
  Z: "\u017d",
};

const PAD = "\u2022\u2022\u2022"; // trailing padding to force ~expansion

/**
 * Pseudo-localize a single message: accent letters, but pass through any
 * `{...}` ICU argument block and `<...>` markup untouched so the message still
 * compiles. Empty strings stay empty.
 */
export function pseudoString(message) {
  if (typeof message !== "string" || message.length === 0) return message;

  let out = "";
  let i = 0;
  while (i < message.length) {
    const ch = message[i];
    if (ch === "{" || ch === "<") {
      const close = ch === "{" ? "}" : ">";
      const end = message.indexOf(close, i);
      if (end !== -1) {
        out += message.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    out += ACCENTS[ch] ?? ch;
    i += 1;
  }

  return `[${out}${PAD}]`;
}

/** Recursively map a catalog's leaf strings through {@link pseudoString}. */
export function pseudoCatalog(value) {
  if (Array.isArray(value)) return value.map(pseudoCatalog);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, pseudoCatalog(child)]),
    );
  }
  return pseudoString(value);
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const outArg = args.indexOf("--out");
  const outPath =
    outArg !== -1 && args[outArg + 1]
      ? resolve(repoRoot, args[outArg + 1])
      : resolve(messagesDir, "en-XA.json");

  const { defaultLocale } = readLocaleConfig(readFileSync(configPath, "utf8"));
  const source = JSON.parse(
    readFileSync(resolve(messagesDir, `${defaultLocale}.json`), "utf8"),
  );
  const generated = JSON.stringify(pseudoCatalog(source), null, 2) + "\n";

  if (check) {
    let current = "";
    try {
      current = readFileSync(outPath, "utf8");
    } catch {
      current = "";
    }
    if (current !== generated) {
      console.error(
        `i18n: pseudolocale at ${outPath} is stale \u2014 run \`pnpm i18n:pseudo\`.`,
      );
      process.exit(1);
    }
    console.log("i18n: pseudolocale is up to date.");
    return;
  }

  writeFileSync(outPath, generated, "utf8");
  console.log(`i18n: wrote pseudolocale from "${defaultLocale}" to ${outPath}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
