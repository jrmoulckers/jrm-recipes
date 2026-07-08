/**
 * Recipe importer: fetch a public web page and pull a structured recipe out of
 * its schema.org JSON-LD (`<script type="application/ld+json">`). This is the
 * free, no-API-key path — the overwhelming majority of recipe sites publish
 * this data for Google, so we can reuse it to pre-fill the editor.
 *
 * Everything below the fetch layer is pure and unit-tested: the mapping from
 * schema.org's loose shapes to our editor's string-based rows lives in
 * `parseRecipeFromHtml` and its helpers.
 */

import { promises as dns } from "node:dns";

import { normalizeUnit, roundNice, unitDimension } from "~/lib/units";

export type ImportedIngredient = {
  section: string;
  quantity: string;
  unit: string;
  item: string;
  note: string;
  optional: boolean;
};

export type ImportedStep = {
  instruction: string;
  imageUrl: string;
  timerMinutes: string;
  techniques: string;
};

/** Mirrors the editor's row/field shapes so it can be applied with no mapping. */
export type ImportedRecipe = {
  title: string;
  description: string;
  coverImageUrl: string;
  servings: string;
  servingsNoun: string;
  prepMinutes: string;
  cookMinutes: string;
  cuisine: string;
  sourceName: string;
  sourceUrl: string;
  tags: string;
  ingredients: ImportedIngredient[];
  steps: ImportedStep[];
};

export type ImportResult =
  | { ok: true; recipe: ImportedRecipe }
  | { ok: false; error: string };

// --- small typed helpers over unknown JSON ------------------------------

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? (v as unknown[]) : [];
}

function typeArray(t: unknown): string[] {
  if (typeof t === "string") return [t];
  return asArray(t).filter((x): x is string => typeof x === "string");
}

function safeCodePoint(cp: number): string {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

function decodeEntities(input: string): string {
  return input
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => safeCodePoint(parseInt(d, 10)))
    .replace(/&amp;/gi, "&");
}

/** Strip tags, decode entities, collapse whitespace. */
function htmlToText(input: unknown): string {
  if (typeof input !== "string") return "";
  return decodeEntities(input)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textFrom(v: unknown): string {
  if (typeof v === "string") return htmlToText(v);
  for (const x of asArray(v)) {
    const t = textFrom(x);
    if (t) return t;
  }
  if (v && typeof v === "object") {
    const name = (v as Record<string, unknown>).name;
    if (typeof name === "string") return htmlToText(name);
  }
  return "";
}

function joinList(v: unknown): string {
  if (typeof v === "string") return v;
  return asArray(v)
    .filter((x): x is string => typeof x === "string")
    .join(", ");
}

// --- durations ----------------------------------------------------------

function num(x: string | undefined): number {
  return x ? Number(x) : 0;
}

/** ISO-8601 duration (e.g. "PT1H30M") → whole minutes. */
const ISO_DURATION_RE =
  /^P(?:\d+(?:\.\d+)?Y)?(?:\d+(?:\.\d+)?M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;

export function parseIsoDuration(value: string): number | undefined {
  const m = ISO_DURATION_RE.exec(value.trim());
  if (!m) return undefined;
  const total =
    num(m[1]) * 7 * 24 * 60 +
    num(m[2]) * 24 * 60 +
    num(m[3]) * 60 +
    num(m[4]) +
    num(m[5]) / 60;
  return total > 0 ? Math.round(total) : undefined;
}

function parseDurationText(value: string): number | undefined {
  const s = value.toLowerCase();
  let total = 0;
  let found = false;
  const h = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/.exec(s);
  if (h) {
    total += num(h[1]) * 60;
    found = true;
  }
  const min = /(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/.exec(s);
  if (min) {
    total += num(min[1]);
    found = true;
  }
  if (!found) {
    const bare = /^\s*(\d+(?:\.\d+)?)\s*$/.exec(s);
    if (bare) {
      total = num(bare[1]);
      found = true;
    }
  }
  return found && total > 0 ? Math.round(total) : undefined;
}

/** Coerce a schema.org duration (ISO string, plain text, or number) to minutes. */
export function parseDurationToMinutes(value: unknown): number | undefined {
  if (typeof value === "number")
    return value > 0 ? Math.round(value) : undefined;
  for (const v of asArray(value)) {
    const r = parseDurationToMinutes(v);
    if (r) return r;
  }
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (!s) return undefined;
  if (/^p/i.test(s)) return parseIsoDuration(s) ?? parseDurationText(s);
  return parseDurationText(s);
}

// --- yield / servings ---------------------------------------------------

export function parseYield(value: unknown): { servings: string; noun: string } {
  const pick = (v: unknown): string => {
    if (typeof v === "number") return String(v);
    if (typeof v === "string") return v;
    for (const x of asArray(v)) {
      const p = pick(x);
      if (p) return p;
    }
    return "";
  };
  const raw = pick(value).trim();
  if (!raw) return { servings: "", noun: "" };
  const m = /(\d+)/.exec(raw);
  const servings = m ? (m[1] ?? "") : "";
  const noun = raw
    .replace(/\d+(?:\s*[-–]\s*\d+)?/g, " ")
    .replace(/\b(?:serves?|serving|yields?|makes?|about|approximately|roughly)\b/gi, " ")
    .replace(/[^a-z ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  return { servings, noun };
}

// --- images / source ----------------------------------------------------

function firstImageUrl(v: unknown): string {
  if (typeof v === "string") return /^https?:\/\//i.test(v.trim()) ? v.trim() : "";
  for (const x of asArray(v)) {
    const u = firstImageUrl(x);
    if (u) return u;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.url === "string" && /^https?:\/\//i.test(o.url)) return o.url;
    if (typeof o.contentUrl === "string" && /^https?:\/\//i.test(o.contentUrl))
      return o.contentUrl;
  }
  return "";
}

function mainEntityUrl(v: unknown): string {
  if (typeof v === "string") return /^https?:/i.test(v) ? v : "";
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const id = o["@id"];
    if (typeof id === "string" && /^https?:/i.test(id)) return id;
    if (typeof o.url === "string" && /^https?:/i.test(o.url)) return o.url;
  }
  return "";
}

function normalizeTags(v: unknown): string {
  const joined = joinList(v);
  if (!joined) return "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of joined.split(",")) {
    const tag = htmlToText(part).trim();
    const key = tag.toLowerCase();
    if (tag && tag.length <= 60 && !seen.has(key)) {
      seen.add(key);
      out.push(tag);
      if (out.length >= 30) break;
    }
  }
  return out.join(", ");
}

// --- ingredient line parsing -------------------------------------------

const GLYPHS = "¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒";
const VULGAR: Record<string, number> = {
  "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3,
  "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8, "⅙": 1 / 6, "⅚": 5 / 6,
  "⅐": 1 / 7, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
  "⅑": 1 / 9, "⅒": 0.1,
};

/** Units the app can't convert but should still recognize as a unit word. */
const EXTRA_UNITS = new Set([
  "pinch", "pinches", "dash", "dashes", "clove", "cloves", "can", "cans",
  "package", "packages", "pkg", "slice", "slices", "stick", "sticks",
  "sprig", "sprigs", "stalk", "stalks", "handful", "handfuls", "bunch",
  "bunches", "head", "heads", "piece", "pieces", "strip", "strips",
  "fillet", "fillets", "jar", "jars", "bottle", "bottles", "container",
  "containers", "cube", "cubes", "drop", "drops", "scoop", "scoops",
  "packet", "packets", "sheet", "sheets", "ear", "ears", "wedge", "wedges",
]);

function parseQuantityToken(raw: string): number | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const combo = new RegExp(`^(\\d+)\\s*([${GLYPHS}])$`).exec(s);
  if (combo) return num(combo[1]) + (VULGAR[combo[2] ?? ""] ?? 0);
  if (VULGAR[s] != null) return VULGAR[s];
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  if (mixed) {
    const d = num(mixed[3]);
    return d ? num(mixed[1]) + num(mixed[2]) / d : undefined;
  }
  const frac = /^(\d+)\/(\d+)$/.exec(s);
  if (frac) {
    const d = num(frac[2]);
    return d ? num(frac[1]) / d : undefined;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function splitLeadingQuantity(line: string): { quantity?: number; rest: string } {
  const t = line.trim();
  const token = `\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+(?:\\.\\d+)?\\s*[${GLYPHS}]|\\d+(?:\\.\\d+)?|[${GLYPHS}]`;
  const re = new RegExp(
    `^(${token})(?:\\s*(?:-|–|—|to)\\s*(?:${token}))?\\s+(.*)$`,
  );
  const m = re.exec(t);
  if (!m) return { rest: t };
  const q = parseQuantityToken(m[1] ?? "");
  if (q == null) return { rest: t };
  return { quantity: q, rest: (m[2] ?? "").trim() };
}

function knownUnit(word: string): string | null {
  const w = word.toLowerCase().replace(/\.$/, "").trim();
  if (!w) return null;
  if (unitDimension(w) != null) return normalizeUnit(w);
  if (EXTRA_UNITS.has(w)) return w;
  return null;
}

function splitUnit(rest: string): { unit: string; item: string } {
  const trimmed = rest.trim();
  if (!trimmed) return { unit: "", item: "" };
  const spaceIdx = trimmed.indexOf(" ");
  const firstWord = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const remainder = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();
  const u = knownUnit(firstWord);
  if (u) return { unit: u, item: remainder.replace(/^of\s+/i, "").trim() };
  return { unit: "", item: trimmed };
}

export function parseIngredientLine(raw: string): ImportedIngredient {
  let line = htmlToText(raw);
  let optional = false;
  if (/\(\s*optional\s*\)/i.test(line) || /\boptional\b/i.test(line)) {
    optional = true;
    line = line
      .replace(/\(\s*optional\s*\)/i, "")
      .replace(/,?\s*\boptional\b/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  let note = "";
  const paren = /\(([^)]*)\)/.exec(line);
  if (paren) {
    note = (paren[1] ?? "").trim();
    line = (line.slice(0, paren.index) + line.slice(paren.index + paren[0].length))
      .replace(/\s+/g, " ")
      .trim();
  }
  const { quantity, rest } = splitLeadingQuantity(line);
  const { unit, item } = splitUnit(rest);
  return {
    section: "",
    quantity: quantity != null ? String(roundNice(quantity)) : "",
    unit,
    item: (item || rest || line).trim(),
    note,
    optional,
  };
}

function mapIngredients(value: unknown): ImportedIngredient[] {
  const lines: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n === "string") {
      const t = htmlToText(n);
      if (t) lines.push(t);
      return;
    }
    const arr = asArray(n);
    if (arr.length) {
      arr.forEach(walk);
      return;
    }
    if (n && typeof n === "object") {
      const name = (n as Record<string, unknown>).name;
      if (typeof name === "string") {
        const t = htmlToText(name);
        if (t) lines.push(t);
      }
    }
  };
  walk(value);
  return lines.map(parseIngredientLine).filter((r) => r.item);
}

// --- instruction parsing ------------------------------------------------

function cleanStep(text: string): string {
  return htmlToText(text)
    .replace(/^\s*step\s*\d+\s*[:.)-]?\s*/i, "")
    .replace(/^\s*\d+\s*[.)]\s+/, "")
    .trim();
}

function mapInstructions(value: unknown): ImportedStep[] {
  const steps: ImportedStep[] = [];
  const push = (text: string, image = ""): void => {
    const instruction = cleanStep(text);
    if (instruction)
      steps.push({
        instruction,
        imageUrl: /^https?:\/\//i.test(image) ? image : "",
        timerMinutes: "",
        techniques: "",
      });
  };
  const walk = (node: unknown): void => {
    if (typeof node === "string") {
      const parts = node.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
      if (parts.length > 1) parts.forEach((p) => push(p));
      else push(node);
      return;
    }
    const arr = asArray(node);
    if (arr.length) {
      arr.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      const o = node as Record<string, unknown>;
      if (typeArray(o["@type"]).some((t) => t.toLowerCase() === "howtosection")) {
        walk(o.itemListElement);
        return;
      }
      const text =
        (typeof o.text === "string" && o.text) ||
        (typeof o.name === "string" && o.name) ||
        "";
      if (text) {
        push(text, firstImageUrl(o.image));
        return;
      }
      if (o.itemListElement) walk(o.itemListElement);
    }
  };
  walk(value);
  return steps;
}

// --- recipe node discovery + mapping -----------------------------------

function findRecipeNode(data: unknown): Record<string, unknown> | null {
  const queue: unknown[] = [data];
  let guard = 0;
  while (queue.length && guard++ < 10000) {
    const cur = queue.shift();
    if (Array.isArray(cur)) {
      queue.push(...asArray(cur));
      continue;
    }
    if (cur && typeof cur === "object") {
      const o = cur as Record<string, unknown>;
      if (typeArray(o["@type"]).some((t) => t.toLowerCase() === "recipe")) return o;
      if (o["@graph"]) queue.push(o["@graph"]);
      if (o.mainEntity) queue.push(o.mainEntity);
    }
  }
  return null;
}

function mapRecipe(node: Record<string, unknown>, sourceUrl: string): ImportedRecipe {
  const { servings, noun } = parseYield(node.recipeYield ?? node.yield);
  const prep = parseDurationToMinutes(node.prepTime);
  const cook = parseDurationToMinutes(node.cookTime);
  const canonical =
    (typeof node.url === "string" && /^https?:/i.test(node.url) && node.url) ||
    mainEntityUrl(node.mainEntityOfPage) ||
    sourceUrl;
  return {
    title: textFrom(node.name).slice(0, 200),
    description: htmlToText(node.description).slice(0, 2000),
    coverImageUrl: firstImageUrl(node.image),
    servings,
    servingsNoun: noun,
    prepMinutes: prep ? String(prep) : "",
    cookMinutes: cook ? String(cook) : "",
    cuisine: (joinList(node.recipeCuisine).split(",")[0] ?? "").trim().slice(0, 80),
    sourceName: textFrom(node.author).slice(0, 200),
    sourceUrl: canonical.slice(0, 2048),
    tags: normalizeTags(node.keywords),
    ingredients: mapIngredients(node.recipeIngredient ?? node.ingredients),
    steps: mapInstructions(node.recipeInstructions),
  };
}

// --- JSON-LD extraction -------------------------------------------------

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    const cleaned = raw
      .replace(/^\s*<!\[CDATA\[/i, "")
      .replace(/\]\]>\s*$/i, "")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");
    try {
      return JSON.parse(cleaned) as unknown;
    } catch {
      return undefined;
    }
  }
}

function extractJsonLdBlocks(html: string): unknown[] {
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const blocks: unknown[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = (m[1] ?? "").trim();
    if (!raw) continue;
    const parsed = tryParseJson(raw);
    if (parsed !== undefined) blocks.push(parsed);
  }
  return blocks;
}

/**
 * Pure core: given page HTML, return the first usable recipe found in its
 * JSON-LD, or null. Exported for unit testing.
 */
export function parseRecipeFromHtml(
  html: string,
  sourceUrl: string,
): ImportedRecipe | null {
  for (const block of extractJsonLdBlocks(html)) {
    const node = findRecipeNode(block);
    if (!node) continue;
    const mapped = mapRecipe(node, sourceUrl);
    if (mapped.title || mapped.ingredients.length || mapped.steps.length)
      return mapped;
  }
  return null;
}

// --- fetch orchestration ------------------------------------------------

function normalizeInputUrl(raw: string): URL | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/** Defense-in-depth against SSRF: reject obvious internal/loopback hosts. */
export function isPublicHost(host: string): boolean {
  const h = stripIpv6Brackets(host.trim().toLowerCase()).replace(/\.+$/, "");
  if (!h) return false;
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h === "0.0.0.0"
  )
    return false;

  if (IPV4_DOTTED_QUAD_RE.test(h)) return isPublicIpv4(h);

  if (h.includes(":")) {
    const mapped = ipv4MappedIpv6Tail(h);
    if (mapped) return isPublicIpv4(mapped);
    if (
      h === "::" ||
      h === "::1" ||
      h === "0:0:0:0:0:0:0:0" ||
      h === "0:0:0:0:0:0:0:1" ||
      h.startsWith("fc") ||
      h.startsWith("fd") ||
      /^fe[89ab][0-9a-f]/.test(h)
    )
      return false;
  }

  if (NUMERIC_HOST_RE.test(h) || NUMERIC_DOTTED_HOST_RE.test(h)) return false;

  return true;
}

const IPV4_DOTTED_QUAD_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const NUMERIC_HOST_RE = /^(?:0x[0-9a-f]+|[0-9a-f]*\d[0-9a-f]*)$/i;
const NUMERIC_DOTTED_HOST_RE = /^(?:0x[0-9a-f]+|[0-9a-f]*\d[0-9a-f]*)(?:\.(?:0x[0-9a-f]+|[0-9a-f]*\d[0-9a-f]*))*$/i;

function stripIpv6Brackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

function ipv4MappedIpv6Tail(host: string): string | null {
  const shorthand = /^::ffff:(.+)$/i.exec(host);
  const expanded = /^0:0:0:0:0:ffff:(.+)$/i.exec(host);
  const tail = shorthand?.[1] ?? expanded?.[1] ?? null;
  if (!tail) return null;
  if (IPV4_DOTTED_QUAD_RE.test(tail)) return tail;
  // Node normalizes `::ffff:1.2.3.4` to hex, e.g. `::ffff:0102:0304`.
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(tail);
  if (hex) {
    const high = parseInt(hex[1] ?? "", 16);
    const low = parseInt(hex[2] ?? "", 16);
    if (Number.isNaN(high) || Number.isNaN(low)) return null;
    return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
  }
  return null;
}

function isPublicIpv4(host: string): boolean {
  const v4 = IPV4_DOTTED_QUAD_RE.exec(host);
  if (!v4) return false;
  const octets = v4.slice(1).map((part) => {
    if (!part || (part.length > 1 && part.startsWith("0"))) return NaN;
    return Number(part);
  });
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255))
    return false;

  const [a = 0, b = 0] = octets;
  if (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254)
  )
    return false;
  return true;
}

const IMPORT_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; HeirloomRecipeImporter/1.0; +https://heirloom.jrmoulckers.com)",
  Accept: "text/html,application/xhtml+xml,application/ld+json;q=0.9,*/*;q=0.8",
} as const;

const MAX_IMPORT_REDIRECTS = 5;

/**
 * Hard cap on bytes read from an imported page (issue #222). A malicious or
 * misbehaving server could stream an unbounded response; buffering it whole
 * before slicing would exhaust memory. We reject on an over-large
 * `Content-Length` up front and otherwise stop reading once the cap is hit.
 */
const MAX_IMPORT_BYTES = 3_000_000;

/** Raised when a redirect points at a non-public or invalid host (SSRF guard). */
class BlockedRedirectError extends Error {}

/**
 * Resolves a hostname to its IP addresses. Injectable so the SSRF resolution
 * guard can be unit-tested without real DNS. `verbatim` keeps the resolver from
 * reordering/filtering families, so we validate exactly what would be dialed.
 */
export type HostLookup = (
  host: string,
) => Promise<{ address: string; family: number }[]>;

const defaultHostLookup: HostLookup = (host) =>
  dns.lookup(host, { all: true, verbatim: true });

/**
 * Harden the SSRF guard against DNS-rebinding (issue #194).
 *
 * {@link isPublicHost} only inspects the hostname *string*, so a public name
 * whose `A`/`AAAA` record points at loopback, an RFC-1918 address, or the cloud
 * metadata IP (`169.254.169.254`) sails through and `fetch` dials the internal
 * target. Here we resolve the name ourselves and reject if *any* returned
 * address is non-public — using the same {@link isPublicHost} predicate, which
 * already understands IPv4, IPv6, and IPv4-mapped-IPv6 literals — before a
 * single byte is fetched. Applied on the initial URL and every redirect hop so
 * the address family can't change between check and connect.
 *
 * A resolution *failure* is not itself a forgery risk (there is no IP to reach,
 * so the subsequent fetch simply fails), so we let it fall through rather than
 * masking a genuine "site not found"; only a *successful* resolution to an
 * internal address is blocked here.
 */
async function assertResolvedHostIsPublic(
  host: string,
  lookup: HostLookup,
): Promise<void> {
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(host);
  } catch {
    return;
  }
  for (const { address } of addresses) {
    if (!isPublicHost(address)) {
      throw new BlockedRedirectError("host resolves to a non-public address");
    }
  }
}

function isHttpRedirect(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

/**
 * Fetch `startUrl`, following redirects manually so every hop's host is
 * re-validated with {@link isPublicHost} *and* re-resolved with
 * {@link assertResolvedHostIsPublic}. A public URL that 3xx-redirects to an
 * internal address (loopback, link-local, cloud metadata) — literally or via a
 * crafted DNS record — is rejected instead of being silently followed. Bounded
 * to {@link MAX_IMPORT_REDIRECTS} hops.
 */
async function fetchGuardingRedirects(
  startUrl: URL,
  signal: AbortSignal,
  lookup: HostLookup,
): Promise<Response> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_IMPORT_REDIRECTS; hop++) {
    await assertResolvedHostIsPublic(current.hostname, lookup);
    const res = await fetch(current.toString(), {
      redirect: "manual",
      signal,
      headers: IMPORT_FETCH_HEADERS,
    });
    if (!isHttpRedirect(res.status)) return res;

    const location = res.headers.get("location");
    await res.body?.cancel();
    if (!location) throw new BlockedRedirectError("redirect without location");

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      throw new BlockedRedirectError("invalid redirect target");
    }
    if (next.protocol !== "http:" && next.protocol !== "https:")
      throw new BlockedRedirectError("unsupported redirect protocol");
    if (!isPublicHost(next.hostname))
      throw new BlockedRedirectError("redirect to non-public host");
    current = next;
  }
  throw new BlockedRedirectError("too many redirects");
}

/**
 * Read a response body as text, stopping once `maxBytes` have been consumed so
 * an unbounded stream cannot exhaust memory (issue #222). The excess is dropped
 * and the underlying stream cancelled rather than buffered.
 */
async function readCappedText(res: Response, maxBytes: number): Promise<string> {
  const body = res.body;
  if (!body) return (await res.text()).slice(0, maxBytes);

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        const remaining = value.byteLength - (total - maxBytes);
        out += decoder.decode(value.subarray(0, Math.max(0, remaining)), {
          stream: true,
        });
        await reader.cancel();
        break;
      }
      out += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  out += decoder.decode();
  return out;
}

/** Fetch a URL and extract a recipe. Returns friendly errors, never throws. */
export async function importRecipeFromUrl(
  rawUrl: string,
  options: { lookup?: HostLookup } = {},
): Promise<ImportResult> {
  const lookup = options.lookup ?? defaultHostLookup;
  const url = normalizeInputUrl(rawUrl);
  if (!url) return { ok: false, error: "That doesn't look like a valid web address." };
  if (!isPublicHost(url.hostname))
    return { ok: false, error: "That address can't be imported." };

  let res: Response;
  try {
    res = await fetchGuardingRedirects(url, AbortSignal.timeout(12000), lookup);
  } catch (e) {
    if (e instanceof BlockedRedirectError)
      return { ok: false, error: "That address can't be imported." };
    const timedOut =
      e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      ok: false,
      error: timedOut
        ? "That site took too long to respond. Try again or paste it in manually."
        : "We couldn't reach that site.",
    };
  }

  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    return {
      ok: false,
      error: retryable
        ? `That site returned an error (${res.status}). Try again shortly.`
        : `That site returned an error (${res.status}). Try a different link.`,
    };
  }

  const declaredLength = Number(res.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMPORT_BYTES) {
    await res.body?.cancel();
    return {
      ok: false,
      error: "That page is too large to import. Try adding it by hand.",
    };
  }

  const html = await readCappedText(res, MAX_IMPORT_BYTES);
  const recipe = parseRecipeFromHtml(html, url.toString());
  if (!recipe)
    return {
      ok: false,
      error:
        "We couldn't find a recipe on that page — it may not publish structured recipe data. You can still add it by hand.",
    };
  return { ok: true, recipe };
}
