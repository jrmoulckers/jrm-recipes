/**
 * Kid-safety hazard classification for cook mode (#423).
 *
 * A small, documented, **static** mapping (offline-safe, no network) that flags
 * the two everyday kitchen dangers a young cook must stop and get a grown-up
 * for: HEAT (hot pans, ovens, boiling liquid) and SHARP tools (knives, graters,
 * peelers). It works two ways, so it catches both tagged and free-form steps:
 *
 *   1. Canonical technique tags are looked up against {@link TECHNIQUE_HAZARDS}
 *      via the tolerant {@link lookupTechnique} resolver (handles case, accents,
 *      plurals, gerunds).
 *   2. The step's instruction text (and any free-form technique labels) is
 *      scanned for hazard keywords with whole-word matching, after stripping
 *      diacritics — so "Sauté" and "sauteing" both hit, while "stir", "cute",
 *      and "biscuit" never do (no false alarms).
 *
 * Presentation + Kids-mode gating live in `kid-safety-callout.tsx`.
 */

import { lookupTechnique } from "~/lib/techniques";

export type KidHazard = "heat" | "sharp";

/** Stable render order: heat first, then sharp. */
export const KID_HAZARD_ORDER: readonly KidHazard[] = ["heat", "sharp"];

/**
 * Canonical technique slug → hazard. Keyed by the knowledge-base slug so the
 * tolerant lookup does the fuzzy matching for us. Covers techniques whose risk
 * isn't obvious from a single keyword (e.g. `reduce`, `temper`, `deglaze`).
 */
export const TECHNIQUE_HAZARDS: Readonly<Record<string, KidHazard>> = {
  // Heat — hot pan / oven / liquid.
  saute: "heat",
  sear: "heat",
  caramelize: "heat",
  deglaze: "heat",
  braise: "heat",
  blanch: "heat",
  simmer: "heat",
  boil: "heat",
  poach: "heat",
  steam: "heat",
  roast: "heat",
  grill: "heat",
  reduce: "heat",
  temper: "heat",
  // Sharp — knife / blade / grater.
  dice: "sharp",
  mince: "sharp",
  chop: "sharp",
  julienne: "sharp",
  zest: "sharp",
};

/**
 * Whole-word hazard keywords. Single ASCII tokens only (multi-word phrases are
 * covered by their most specific token, e.g. "deep fry" via `fry`). Matched
 * case-insensitively with word boundaries against diacritic-stripped text.
 */
const HEAT_KEYWORDS = [
  "oven",
  "bake",
  "bakes",
  "baked",
  "baking",
  "boil",
  "boils",
  "boiled",
  "boiling",
  "fry",
  "fries",
  "fried",
  "frying",
  "saute",
  "sautes",
  "sauteed",
  "sauteing",
  "sear",
  "sears",
  "seared",
  "searing",
  "simmer",
  "simmers",
  "simmered",
  "simmering",
  "roast",
  "roasts",
  "roasted",
  "roasting",
  "grill",
  "grills",
  "grilled",
  "grilling",
  "broil",
  "broils",
  "broiled",
  "broiling",
  "steam",
  "steams",
  "steamed",
  "steaming",
  "scald",
  "scalds",
  "scalded",
  "scalding",
  "blanch",
  "blanches",
  "blanched",
  "blanching",
  "poach",
  "poaches",
  "poached",
  "poaching",
  "toast",
  "toasts",
  "toasted",
  "toasting",
  "stove",
  "stovetop",
  "burner",
  "burners",
  "microwave",
  "microwaves",
  "microwaved",
  "caramelize",
  "caramelizes",
  "caramelized",
  "caramelizing",
  "deglaze",
  "deglazes",
  "deglazed",
  "deglazing",
  "braise",
  "braises",
  "braised",
  "braising",
  "sizzle",
  "sizzles",
  "sizzling",
  "scorch",
  "scorches",
  "scorched",
  "scorching",
  "torch",
  "torches",
  "flame",
  "flames",
] as const;

const SHARP_KEYWORDS = [
  "knife",
  "knives",
  "cut",
  "cuts",
  "cutting",
  "slice",
  "slices",
  "sliced",
  "slicing",
  "chop",
  "chops",
  "chopped",
  "chopping",
  "dice",
  "dices",
  "diced",
  "dicing",
  "mince",
  "minces",
  "minced",
  "mincing",
  "grate",
  "grates",
  "grated",
  "grating",
  "grater",
  "graters",
  "julienne",
  "juliennes",
  "julienned",
  "zest",
  "zests",
  "zested",
  "zesting",
  "zester",
  "zesters",
  "shred",
  "shreds",
  "shredded",
  "shredding",
  "mandoline",
  "mandolines",
  "blade",
  "blades",
  "carve",
  "carves",
  "carved",
  "carving",
  "scissors",
  "shears",
  "peeler",
  "peelers",
] as const;

function toPattern(keywords: readonly string[]): RegExp {
  // Non-global so the shared instance is safe to reuse with `.test()`.
  return new RegExp(`\\b(?:${keywords.join("|")})\\b`, "i");
}

const HEAT_PATTERN = toPattern(HEAT_KEYWORDS);
const SHARP_PATTERN = toPattern(SHARP_KEYWORDS);

/** Lowercase + strip diacritics so "Sauté" matches the ASCII keyword "saute". */
function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Classify a step's kitchen hazards. Returns heat/sharp in a stable order, or
 * an empty array for plain, safe steps (e.g. "stir the batter").
 */
export function detectStepHazards(input: {
  text?: string | null;
  techniques?: readonly string[] | null;
}): KidHazard[] {
  const found = new Set<KidHazard>();

  // 1) Canonical technique tags → documented hazard (tolerant resolver).
  for (const raw of input.techniques ?? []) {
    const label = raw?.trim();
    if (!label) continue;
    const match = lookupTechnique(label);
    const slug = match.known ? match.slug : match.suggestion?.slug;
    const hazard = slug ? TECHNIQUE_HAZARDS[slug] : undefined;
    if (hazard) found.add(hazard);
  }

  // 2) Keyword scan over the instruction text + any free-form technique labels.
  const haystack = normalizeText(
    [input.text ?? "", ...(input.techniques ?? [])].join(" "),
  );
  if (haystack) {
    if (HEAT_PATTERN.test(haystack)) found.add("heat");
    if (SHARP_PATTERN.test(haystack)) found.add("sharp");
  }

  return KID_HAZARD_ORDER.filter((hazard) => found.has(hazard));
}

/** Friendly, distinct copy + emoji + accessible label per hazard. */
export const KID_HAZARD_INFO: Readonly<
  Record<KidHazard, { emoji: string; message: string; label: string }>
> = {
  heat: {
    emoji: "🔥",
    message: "Careful — this step is hot! Ask a grown-up to help.",
    label: "Safety warning: this step is hot. Ask a grown-up to help.",
  },
  sharp: {
    emoji: "🔪",
    message: "Sharp stuff! Ask a grown-up to help with this step.",
    label:
      "Safety warning: this step uses something sharp. Ask a grown-up to help.",
  },
};
