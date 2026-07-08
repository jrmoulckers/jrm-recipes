/**
 * Allergen detection: a curated, fully-static knowledge base that maps a recipe
 * ingredient's free-text `item` string onto the major allergen groups it
 * carries. This is the safety foundation the "Contains" summary, "safe for"
 * filters, and allergen badges build on.
 *
 * Everything here is pure and dependency-light (only the shared
 * `normalizeIngredient` from `substitutions`), so it works offline, needs no
 * database, and is exhaustively unit-testable. Detection is best-effort: it can
 * miss unusual phrasings and can't see brand-specific formulations, so the UI
 * always pairs it with a "double-check the label" disclaimer.
 */

import { normalizeIngredient } from "./substitutions";

/**
 * The major allergen groups (aligned with the FDA "big 9"). `wheat` doubles as
 * the gluten group and aligns with substitutions' `gluten-free` `DietaryTag`;
 * `dairy`/`egg` align with `dairy-free`/`egg-free`.
 */
export type Allergen =
  | "peanut"
  | "tree-nut"
  | "dairy"
  | "egg"
  | "soy"
  | "wheat"
  | "fish"
  | "shellfish"
  | "sesame";

/** Canonical display order — also the stable sort order for summaries. */
export const ALLERGENS = [
  "peanut",
  "tree-nut",
  "dairy",
  "egg",
  "soy",
  "wheat",
  "fish",
  "shellfish",
  "sesame",
] as const satisfies readonly Allergen[];

/** Human-friendly labels for badges and summaries. */
export const ALLERGEN_LABELS: Record<Allergen, string> = {
  peanut: "Peanuts",
  "tree-nut": "Tree nuts",
  dairy: "Dairy",
  egg: "Eggs",
  soy: "Soy",
  wheat: "Wheat/gluten",
  fish: "Fish",
  shellfish: "Shellfish",
  sesame: "Sesame",
};

const ALLERGEN_ORDER = new Map<Allergen, number>(
  ALLERGENS.map((a, i) => [a, i]),
);

/**
 * One knowledge-base rule: normalized whole-word phrases that indicate one or
 * more allergens. `unless` phrases suppress the rule when present (handling
 * plant-based / non-wheat qualifiers such as "almond milk" or "rice flour").
 * `hidden` marks derived allergens that aren't obvious from the name (populated
 * by the hidden-allergen feature); `note` carries a "check the label" caution.
 */
export type AllergenRule = {
  allergens: Allergen[];
  /** Normalized (lowercase, whole-word) trigger phrases. */
  aliases: string[];
  /**
   * Whole-word phrases that veto this rule when present in the same item, e.g.
   * "almond" vetoes "milk" → dairy so "almond milk" reads as tree-nut only.
   */
  unless?: string[];
  hidden?: boolean;
  note?: string;
};

/**
 * Qualifiers that mean a "milk/butter/cream/cheese/yogurt" is a plant-based (or
 * otherwise non-dairy) product. Also covers non-dairy "butter" spreads (nut,
 * seed, fruit) and "cream of tartar", so "peanut butter", "almond milk",
 * "coconut cream", "cocoa butter", and "cream of tartar" never read as dairy.
 */
const NON_DAIRY_QUALIFIERS = [
  "almond",
  "cashew",
  "walnut",
  "pecan",
  "hazelnut",
  "macadamia",
  "pistachio",
  "peanut",
  "soy",
  "soya",
  "oat",
  "coconut",
  "rice",
  "hemp",
  "flax",
  "sunflower",
  "seed",
  "nut",
  "pea",
  "cocoa",
  "shea",
  "apple",
  "pumpkin",
  "fruit",
  "vegan",
  "plant",
  "tartar",
];

/**
 * Qualifiers that mean a "flour"/"bread"/"pasta"/"tortilla" is not wheat-based
 * (naturally gluten-free grains, nuts, or an explicit gluten-free label), so
 * "almond flour", "rice noodles", and "corn tortilla" don't read as wheat.
 */
const NON_WHEAT_QUALIFIERS = [
  "almond",
  "coconut",
  "rice",
  "corn",
  "chickpea",
  "gram",
  "oat",
  "tapioca",
  "cassava",
  "buckwheat",
  "potato",
  "soy",
  "soya",
  "quinoa",
  "millet",
  "sorghum",
  "nut",
  "gluten free",
  "gluten-free",
  "grain free",
];

/**
 * The curated knowledge base. Aliases are normalized whole-word phrases; the
 * matcher lower-cases, strips accents, and matches on word boundaries (via
 * `normalizeIngredient`), so "egg" never matches inside "eggplant" and "fish"
 * never matches inside "shellfish".
 *
 * Design choice — coconut: the FDA classifies coconut as a tree nut for
 * labeling, but the vast majority of tree-nut-allergic people tolerate it, so
 * we deliberately do NOT flag "coconut" as tree-nut (and it also vetoes the
 * generic dairy terms). Cooks with a true coconut allergy should rely on the
 * "always double-check" disclaimer.
 */
export const ALLERGEN_RULES: AllergenRule[] = [
  {
    allergens: ["peanut"],
    aliases: [
      "peanut",
      "peanuts",
      "peanut butter",
      "peanut oil",
      "peanut flour",
      "groundnut",
      "groundnuts",
      "arachis",
    ],
  },
  {
    allergens: ["tree-nut"],
    aliases: [
      "tree nut",
      "tree nuts",
      "nut",
      "nuts",
      "mixed nuts",
      "almond",
      "almonds",
      "almond flour",
      "almond butter",
      "almond milk",
      "cashew",
      "cashews",
      "walnut",
      "walnuts",
      "pecan",
      "pecans",
      "pistachio",
      "pistachios",
      "hazelnut",
      "hazelnuts",
      "filbert",
      "macadamia",
      "brazil nut",
      "brazil nuts",
      "pine nut",
      "pine nuts",
      "pinenut",
      "praline",
      "nut butter",
      "nut flour",
    ],
  },
  {
    // Chestnuts are tree nuts, but "water chestnut" is an aquatic vegetable.
    allergens: ["tree-nut"],
    aliases: ["chestnut", "chestnuts"],
    unless: ["water"],
  },
  {
    allergens: ["dairy"],
    aliases: [
      "milk",
      "buttermilk",
      "butter",
      "cream",
      "heavy cream",
      "sour cream",
      "whipping cream",
      "half and half",
      "cheese",
      "cream cheese",
      "parmesan",
      "parmigiano",
      "mozzarella",
      "cheddar",
      "feta",
      "ricotta",
      "mascarpone",
      "gouda",
      "brie",
      "yogurt",
      "yoghurt",
      "ghee",
      "custard",
      "curd",
      "whey",
      "casein",
      "caseinate",
      "condensed milk",
      "evaporated milk",
      "ice cream",
      "gelato",
      "creme fraiche",
    ],
    unless: NON_DAIRY_QUALIFIERS,
  },
  {
    allergens: ["egg"],
    aliases: [
      "egg",
      "eggs",
      "egg white",
      "egg whites",
      "egg yolk",
      "egg yolks",
      "large egg",
      "large eggs",
      "albumen",
      "meringue",
      "mayonnaise",
      "mayo",
      "aioli",
    ],
    // "flax egg", "egg replacer/substitute", "vegan egg", "egg-free" aren't egg.
    unless: ["flax", "chia", "replacer", "substitute", "free", "vegan"],
  },
  {
    allergens: ["soy"],
    aliases: [
      "soy",
      "soya",
      "soybean",
      "soybeans",
      "soy sauce",
      "soy milk",
      "soy lecithin",
      "soybean oil",
      "edamame",
      "tofu",
      "tempeh",
      "miso",
      "tamari",
      "natto",
      "tvp",
      "textured vegetable protein",
    ],
    unless: ["free"],
  },
  {
    allergens: ["wheat"],
    aliases: [
      "wheat",
      "whole wheat",
      "flour",
      "all purpose flour",
      "plain flour",
      "bread flour",
      "cake flour",
      "self rising flour",
      "white flour",
      "bread",
      "breadcrumb",
      "breadcrumbs",
      "panko",
      "pasta",
      "spaghetti",
      "noodle",
      "noodles",
      "macaroni",
      "couscous",
      "semolina",
      "durum",
      "spelt",
      "farro",
      "bulgur",
      "seitan",
      "cracker",
      "crackers",
      "pita",
      "tortilla",
      "pretzel",
      "pretzels",
      "barley",
      "rye",
    ],
    unless: NON_WHEAT_QUALIFIERS,
  },
  {
    allergens: ["fish"],
    aliases: [
      "fish",
      "salmon",
      "tuna",
      "cod",
      "halibut",
      "tilapia",
      "trout",
      "anchovy",
      "anchovies",
      "sardine",
      "sardines",
      "haddock",
      "mackerel",
      "snapper",
      "catfish",
      "pollock",
      "fish sauce",
    ],
  },
  {
    allergens: ["shellfish"],
    aliases: [
      "shellfish",
      "shrimp",
      "prawn",
      "prawns",
      "crab",
      "lobster",
      "crawfish",
      "crayfish",
      "clam",
      "clams",
      "mussel",
      "mussels",
      "oyster",
      "oysters",
      "scallop",
      "scallops",
      "squid",
      "calamari",
      "octopus",
      "krill",
      "langoustine",
      "crustacean",
      "mollusk",
    ],
  },
  {
    allergens: ["sesame"],
    aliases: [
      "sesame",
      "sesame seed",
      "sesame seeds",
      "sesame oil",
      "tahini",
      "benne",
      "gomashio",
      "halva",
    ],
  },

  // --- Hidden / derived allergens ---------------------------------------
  // Allergens that a busy cook won't read off the ingredient's name. Each is
  // marked `hidden` and carries a "check the label" note. Sources are the FDA
  // major-allergen guidance plus standard culinary composition; formulations
  // vary by brand, so the copy always defers to the label.
  {
    // Soy sauce is brewed with wheat (the soy itself is caught directly).
    allergens: ["wheat"],
    aliases: ["soy sauce", "shoyu"],
    unless: ["tamari", "gluten free", "gluten-free"],
    hidden: true,
    note: "Soy sauce is usually brewed with wheat — check for a gluten-free tamari.",
  },
  {
    // Teriyaki and hoisin are soy-sauce based; hoisin also commonly has sesame.
    allergens: ["soy", "wheat"],
    aliases: ["teriyaki"],
    unless: ["gluten free", "gluten-free"],
    hidden: true,
    note: "Teriyaki sauce is usually made with soy sauce and wheat.",
  },
  {
    allergens: ["soy", "wheat", "sesame"],
    aliases: ["hoisin"],
    hidden: true,
    note: "Hoisin sauce usually contains soy, wheat, and sesame.",
  },
  {
    // Worcestershire sauce is fermented with anchovies (fish).
    allergens: ["fish"],
    aliases: ["worcestershire"],
    unless: ["vegan", "vegetarian"],
    hidden: true,
    note: "Worcestershire sauce usually contains anchovies (fish).",
  },
  {
    // Classic Caesar dressing has anchovies and egg yolk.
    allergens: ["fish", "egg"],
    aliases: ["caesar"],
    unless: ["vegan"],
    hidden: true,
    note: "Caesar dressing usually contains anchovies (fish) and egg.",
  },
  {
    // Pesto: pine nuts (tree nut) + parmesan (dairy).
    allergens: ["tree-nut", "dairy"],
    aliases: ["pesto"],
    unless: ["vegan"],
    hidden: true,
    note: "Pesto is usually made with pine nuts (tree nut) and parmesan (dairy).",
  },
  {
    // Marzipan / almond paste are ground almonds.
    allergens: ["tree-nut"],
    aliases: ["marzipan", "almond paste", "frangipane"],
    hidden: true,
    note: "Marzipan is made from almonds (tree nut).",
  },
  {
    // Nougat is whipped egg white with nuts.
    allergens: ["egg", "tree-nut"],
    aliases: ["nougat"],
    hidden: true,
    note: "Nougat usually contains egg white and nuts.",
  },
  {
    // Lecithin is most often soy-derived unless labeled sunflower.
    allergens: ["soy"],
    aliases: ["lecithin"],
    unless: ["sunflower"],
    hidden: true,
    note: "Lecithin is usually soy-derived unless labeled sunflower.",
  },
  {
    // Imitation crab (surimi) is minced fish, often bound with wheat.
    allergens: ["fish", "wheat"],
    aliases: ["surimi", "imitation crab"],
    hidden: true,
    note: "Imitation crab (surimi) is made from fish and often contains wheat.",
  },
  {
    // Tempura batter is wheat flour and egg.
    allergens: ["wheat", "egg"],
    aliases: ["tempura"],
    hidden: true,
    note: "Tempura batter is made with wheat flour and egg.",
  },
  {
    // Gravy and roux are thickened with wheat flour.
    allergens: ["wheat"],
    aliases: ["gravy", "roux"],
    unless: ["gluten free", "gluten-free", "cornstarch"],
    hidden: true,
    note: "Gravy is usually thickened with wheat flour.",
  },
  {
    // Udon are wheat noodles (name alone doesn't say so).
    allergens: ["wheat"],
    aliases: ["udon"],
    hidden: true,
    note: "Udon are wheat noodles.",
  },
  // Note: "natural flavors" is deliberately NOT mapped — it can hide soy, dairy,
  // or nuts, but which one is unknowable from the text, so asserting a specific
  // allergen would be misleading. The best-effort disclaimer covers it.
];

// --- Matcher -------------------------------------------------------------

function tokenize(value: string): string[] {
  return value.split(" ").filter(Boolean);
}

/** True when `phrase` appears as a contiguous run of whole words in `haystack`. */
function containsPhrase(haystack: string[], phrase: string[]): boolean {
  if (phrase.length === 0 || phrase.length > haystack.length) return false;
  for (let i = 0; i + phrase.length <= haystack.length; i++) {
    let matched = true;
    for (let j = 0; j < phrase.length; j++) {
      if (haystack[i + j] !== phrase[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

type IndexedRule = {
  rule: AllergenRule;
  aliasTokens: string[][];
  unlessTokens: string[][];
};

const RULE_INDEX: IndexedRule[] = ALLERGEN_RULES.map((rule) => ({
  rule,
  aliasTokens: rule.aliases.map((a) => tokenize(normalizeIngredient(a))),
  unlessTokens: (rule.unless ?? []).map((u) => tokenize(normalizeIngredient(u))),
}));

/** A single allergen detection, tagged with whether it's hidden/derived. */
export type AllergenHit = {
  allergen: Allergen;
  hidden: boolean;
  note?: string;
};

/**
 * A hidden/derived allergen warning: an allergen the ingredient's name doesn't
 * make obvious (e.g. soy sauce → wheat), paired with a cautionary note.
 */
export type HiddenAllergenWarning = {
  allergen: Allergen;
  note: string;
};

function sortAllergens(list: Allergen[]): Allergen[] {
  return [...new Set(list)].sort(
    (a, b) => (ALLERGEN_ORDER.get(a) ?? 99) - (ALLERGEN_ORDER.get(b) ?? 99),
  );
}

/** Every rule hit for an ingredient (direct + hidden), before de-duplication. */
export function detectAllergenHits(item: string | null | undefined): AllergenHit[] {
  const tokens = tokenize(normalizeIngredient(item));
  if (tokens.length === 0) return [];

  const hits: AllergenHit[] = [];
  for (const { rule, aliasTokens, unlessTokens } of RULE_INDEX) {
    if (unlessTokens.some((phrase) => containsPhrase(tokens, phrase))) continue;
    if (!aliasTokens.some((phrase) => containsPhrase(tokens, phrase))) continue;
    for (const allergen of rule.allergens) {
      hits.push({ allergen, hidden: rule.hidden ?? false, note: rule.note });
    }
  }
  return hits;
}

/**
 * The allergens an ingredient directly carries (obvious from its name),
 * de-duplicated and sorted in canonical order. Hidden/derived allergens are
 * excluded here — use {@link detectHiddenAllergens} for those.
 */
export function detectAllergens(item: string | null | undefined): Allergen[] {
  return sortAllergens(
    detectAllergenHits(item)
      .filter((hit) => !hit.hidden)
      .map((hit) => hit.allergen),
  );
}

/**
 * Roll a whole recipe's ingredient list up to a de-duplicated, canonically
 * sorted set of directly-carried allergens.
 */
export function summarizeAllergens(items: string[]): Allergen[] {
  return sortAllergens(items.flatMap((item) => detectAllergens(item)));
}

/**
 * The hidden/derived allergens an ingredient carries that its name doesn't make
 * obvious (e.g. soy sauce → wheat, marzipan → tree-nut), each paired with a
 * cautionary note. De-duplicated by allergen and sorted in canonical order.
 */
export function detectHiddenAllergens(
  item: string | null | undefined,
): HiddenAllergenWarning[] {
  const byAllergen = new Map<Allergen, string>();
  for (const hit of detectAllergenHits(item)) {
    if (!hit.hidden || !hit.note) continue;
    if (!byAllergen.has(hit.allergen)) byAllergen.set(hit.allergen, hit.note);
  }
  return sortAllergens([...byAllergen.keys()]).map((allergen) => ({
    allergen,
    note: byAllergen.get(allergen)!,
  }));
}

/**
 * Recipe-level hidden allergens: derived allergens across all ingredients that
 * are NOT already surfaced as direct "Contains" allergens (so the two lists
 * stay distinct — an allergen that's obvious from one ingredient isn't repeated
 * as "hidden" just because another ingredient hides it).
 */
export function summarizeHiddenAllergens(
  items: string[],
): HiddenAllergenWarning[] {
  const direct = new Set(summarizeAllergens(items));
  const byAllergen = new Map<Allergen, string>();
  for (const item of items) {
    for (const warning of detectHiddenAllergens(item)) {
      if (direct.has(warning.allergen)) continue;
      if (!byAllergen.has(warning.allergen)) {
        byAllergen.set(warning.allergen, warning.note);
      }
    }
  }
  return sortAllergens([...byAllergen.keys()]).map((allergen) => ({
    allergen,
    note: byAllergen.get(allergen)!,
  }));
}
