/**
 * Curated "learn to cook" technique knowledge base.
 *
 * Pure, statically-bundled data so the cook-mode tutor works fully offline.
 * `lookupTechnique` tolerates free-form labels typed in the recipe editor
 * (case, accents, plurals, gerunds, common alternate spellings) and always
 * degrades gracefully to the raw label when a technique isn't in the base.
 */

export type Technique = {
  slug: string;
  name: string;
  /** One-line, glanceable reminder shown first in the tutor popover. */
  shortTip: string;
  /** A couple of sentences with the why/how for the curious cook. */
  description: string;
  /**
   * Optional playful, pre-reader-friendly one-liner shown instead of `shortTip`
   * when Kids mode is active (#446). Plain words a 9-year-old actually knows —
   * no "emulsify" or "until ribbons form". Falls back to `shortTip` when unset.
   */
  kidTip?: string;
};

/** A fuzzy "did you mean …?" pointer to a known technique. */
export type TechniqueSuggestion = { slug: string; label: string };

/** Result of resolving a raw label against the knowledge base. */
export type TechniqueMatch = {
  slug: string;
  /** Canonical name when known, otherwise the trimmed raw label. */
  label: string;
  known: boolean;
  shortTip?: string;
  description?: string;
  /** Kid-friendly one-liner (see {@link Technique.kidTip}), when available. */
  kidTip?: string;
  /**
   * For an unknown label, the closest known technique within a small edit
   * distance (e.g. "braize" -> "Braise"), so the UI can offer a gentle hint.
   */
  suggestion?: TechniqueSuggestion;
};

type TechniqueSeed = Technique & { aliases?: string[] };

/**
 * Kid-friendly one-liners keyed by technique slug (#446). Seeded for the most
 * common beginner techniques; anything unlisted simply falls back to the adult
 * `shortTip`. Static + bundled, so the tutor still works offline.
 */
const KID_TIPS: Record<string, string> = {
  dice: "Cut it into little squares, about the size of dice.",
  mince: "Chop it up super tiny, into teeny-tiny bits.",
  chop: "Cut it into bite-size pieces — not too fussy!",
  julienne: "Cut it into skinny little sticks, like matchsticks.",
  saute: "Cook it fast in a little oil and keep it moving!",
  sear: "Cook one side in a hot pan so it gets brown and yummy.",
  boil: "Heat the water until it's full of big, jumpy bubbles.",
  simmer: "Keep it just below a boil — tiny, gentle bubbles.",
  poach: "Cook it gently in water that's barely wiggling.",
  steam: "Cook it over bubbly water, sitting up in a basket.",
  roast: "Cook it in the oven until it's golden and yummy.",
  grill: "Cook it over the hot grill to get tasty stripes.",
  fold: "Mix it super gently so you don't squish out the air.",
  whisk: "Beat it really fast in circles until it's fluffy!",
  whip: "Beat it fast until it's light, puffy, and fluffy.",
  cream: "Beat the butter and sugar until it's fluffy and pale.",
  knead: "Push and squish the dough until it's smooth and stretchy.",
  sift: "Shake the flour through a sieve so it's soft and lump-free.",
  zest: "Grate just the colorful part of the lemon or orange skin.",
  blanch: "Dip it in boiling water quickly, then into ice-cold water.",
  puree: "Blend it until it's totally smooth, with no lumps.",
  caramelize: "Cook it low and slow until it's golden and sweet.",
};

const SEED: TechniqueSeed[] = [
  {
    slug: "dice",
    name: "Dice",
    shortTip: "Cut into even, square-ish cubes so everything cooks at the same rate.",
    description:
      "Trim the ingredient flat so it doesn't roll, slice into planks, cut the planks into sticks, then cut across to make cubes. Small dice is roughly 6 mm; large dice about 2 cm. Even sizing is what keeps cooking uniform.",
    aliases: ["diced", "dicing"],
  },
  {
    slug: "mince",
    name: "Mince",
    shortTip: "Chop as finely as possible so the flavor disperses evenly.",
    description:
      "Used for garlic, ginger, chiles and herbs. Rock the knife over the pile, gathering and re-cutting until almost paste-like. Finer than a chop, mincing spreads pungent flavors throughout a dish.",
    aliases: ["minced", "mincing"],
  },
  {
    slug: "chop",
    name: "Chop",
    shortTip: "Cut into bite-size, roughly even pieces — tidy but not fussy.",
    description:
      "A general cut where uniformity matters more than precision. Keep the knife tip on the board and rock the blade through the food. 'Roughly chopped' just means bigger, more casual pieces.",
    aliases: ["chopped", "chopping", "rough chop", "roughly chopped"],
  },
  {
    slug: "julienne",
    name: "Julienne",
    shortTip: "Cut into thin matchsticks for quick cooking and elegant texture.",
    description:
      "Square off the sides, slice into thin planks, stack the planks and cut into fine strips about 3 mm thick. Great for stir-fries and slaws where you want delicate, fast-cooking ribbons.",
    aliases: ["julienned", "matchstick", "matchsticks"],
  },
  {
    slug: "saute",
    name: "Sauté",
    shortTip: "Cook fast in a little hot fat, keeping the food moving.",
    description:
      "From the French for 'jump'. Use a wide pan over medium-high heat with a thin film of oil, and stir or toss so pieces brown lightly without steaming. Don't crowd the pan or the food will stew instead of sizzle.",
    aliases: ["sautee", "sauteed", "sauteing", "saute", "pan fry", "pan-fry", "sweat"],
  },
  {
    slug: "sear",
    name: "Sear",
    shortTip: "Blast one side in a hot, dry-ish pan to build a browned crust.",
    description:
      "Get the pan and fat hot before the food goes in, then leave it undisturbed so a deep crust forms via the Maillard reaction. Pat the surface dry first — moisture is the enemy of a good sear.",
    aliases: ["seared", "searing"],
  },
  {
    slug: "caramelize",
    name: "Caramelize",
    shortTip: "Cook sugars low and slow until deeply browned and sweet-nutty.",
    description:
      "Whether it's onions or sugar, gentle sustained heat turns natural sugars golden to brown, unlocking rich, complex flavor. It takes patience — rushing over high heat scorches instead of caramelizes.",
    aliases: ["caramelise", "caramelized", "caramelised", "caramelizing", "caramelising"],
  },
  {
    slug: "deglaze",
    name: "Deglaze",
    shortTip: "Add liquid to a hot pan and scrape up the browned bits for a sauce.",
    description:
      "After searing, pour in wine, stock or water and scrape the fond (the sticky browned residue) off the pan bottom. Those bits are concentrated flavor and become the backbone of a quick pan sauce.",
    aliases: ["deglazed", "deglazing"],
  },
  {
    slug: "braise",
    name: "Braise",
    shortTip: "Brown, then simmer gently in a little liquid, covered, until tender.",
    description:
      "A combination method: sear for flavor, then cook low and slow partly submerged in liquid. Ideal for tough cuts — collagen melts into gelatin, leaving meat meltingly tender and the liquid rich.",
    aliases: ["braised", "braising"],
  },
  {
    slug: "blanch",
    name: "Blanch",
    shortTip: "Boil briefly, then plunge into ice water to lock color and crunch.",
    description:
      "A quick dip in rapidly boiling water sets bright color and par-cooks vegetables; the ice-water 'shock' stops cooking instantly. Also loosens skins on tomatoes and peaches for easy peeling.",
    aliases: ["blanched", "blanching", "shock", "parboil"],
  },
  {
    slug: "simmer",
    name: "Simmer",
    shortTip: "Keep the liquid just below a boil — small bubbles, gentle motion.",
    description:
      "Look for lazy bubbles breaking the surface rather than a rolling boil. Simmering cooks food gently and evenly, keeps proteins tender and lets flavors meld without the violent agitation of a hard boil.",
    aliases: ["simmered", "simmering"],
  },
  {
    slug: "boil",
    name: "Boil",
    shortTip: "Cook in liquid at a full, rolling bubble (100°C / 212°F).",
    description:
      "Vigorous, constant bubbles that keep food moving — right for pasta, grains and blanching. A 'rolling boil' can't be stirred down; for delicate foods, drop to a simmer instead.",
    aliases: ["boiled", "boiling", "rolling boil"],
  },
  {
    slug: "poach",
    name: "Poach",
    shortTip: "Cook gently submerged in barely-trembling liquid (70–80°C).",
    description:
      "The most delicate wet-heat method — the liquid steams and shivers but never bubbles. Perfect for eggs, fish and fruit where you want silky, tender results without toughening.",
    aliases: ["poached", "poaching"],
  },
  {
    slug: "steam",
    name: "Steam",
    shortTip: "Cook over (not in) simmering water to keep nutrients and color.",
    description:
      "Food sits above boiling water in a basket or steamer, cooked by the rising vapor. Gentle and moisture-preserving, it's ideal for vegetables, dumplings and fish. Keep the lid on to trap the steam.",
    aliases: ["steamed", "steaming"],
  },
  {
    slug: "roast",
    name: "Roast",
    shortTip: "Cook uncovered in the oven's dry heat for browning and flavor.",
    description:
      "High, dry oven heat browns the outside while cooking the inside through. Give pieces room on the pan so they roast rather than steam, and consider a rack for all-around air flow.",
    aliases: ["roasted", "roasting"],
  },
  {
    slug: "grill",
    name: "Grill",
    shortTip: "Cook over direct high heat for char and smoky flavor.",
    description:
      "Direct radiant heat from below (or above, when broiling) sears fast and adds char. Oil the food, start the grill hot and clean, and resist moving pieces until they release cleanly.",
    aliases: ["grilled", "grilling", "broil", "broiled", "chargrill"],
  },
  {
    slug: "fold",
    name: "Fold",
    shortTip: "Combine gently with a spatula to keep air in the batter.",
    description:
      "Cut down through the mixture, sweep across the bowl bottom and lift over the top, rotating the bowl. Used for whipped egg whites or cream so the airy volume survives — never stir or beat.",
    aliases: ["folded", "folding", "fold in", "folded in"],
  },
  {
    slug: "whisk",
    name: "Whisk",
    shortTip: "Beat briskly to blend, aerate, or smooth out lumps.",
    description:
      "The wire whisk incorporates air and emulsifies. Whisk eggs to blend, cream to soft peaks, or dressings to a smooth emulsion. Keep the motion fast and use a large bowl to avoid splashing.",
    aliases: ["whisked", "whisking", "beat", "beaten"],
  },
  {
    slug: "whip",
    name: "Whip",
    shortTip: "Beat vigorously to trap air until light and voluminous.",
    description:
      "Whipping cream or egg whites unfolds proteins and fats around air bubbles, building volume and structure. Stop at the peak you need — soft peaks slump, stiff peaks stand — and don't over-whip or it breaks.",
    aliases: ["whipped", "whipping"],
  },
  {
    slug: "cream",
    name: "Cream",
    shortTip: "Beat butter and sugar until pale, fluffy, and aerated.",
    description:
      "The foundation of many cakes and cookies. Beating softened butter with sugar drives in tiny air pockets that leaven the bake. Go until noticeably lighter in color and texture — usually a few minutes.",
    aliases: ["creamed", "creaming"],
  },
  {
    slug: "knead",
    name: "Knead",
    shortTip: "Work the dough to develop gluten into a smooth, elastic ball.",
    description:
      "Push, fold and turn dough repeatedly to align gluten strands, which give bread its chew and rise. It's done when the dough is smooth and springs back when poked — typically 8–10 minutes by hand.",
    aliases: ["kneaded", "kneading"],
  },
  {
    slug: "proof",
    name: "Proof",
    shortTip: "Let yeasted dough rest and rise until puffy before baking.",
    description:
      "Resting time lets yeast produce gas that inflates the dough. Proof somewhere warm and draft-free until roughly doubled; a gentle poke should spring back slowly. Also called proving.",
    aliases: ["proofed", "proofing", "prove", "proved", "proving", "prove the dough"],
  },
  {
    slug: "sift",
    name: "Sift",
    shortTip: "Pass dry ingredients through a sieve to aerate and remove lumps.",
    description:
      "Shaking flour, cocoa or powdered sugar through a fine mesh breaks up clumps and lightens it, so it folds in smoothly and measures evenly. Especially worthwhile for delicate cakes.",
    aliases: ["sifted", "sifting", "sieve", "sieved"],
  },
  {
    slug: "emulsify",
    name: "Emulsify",
    shortTip: "Whisk fat into liquid in a slow stream to make a stable, creamy blend.",
    description:
      "Emulsifying suspends tiny droplets of oil in water (or vice versa) so they don't separate — think vinaigrette, mayo or hollandaise. Add the oil gradually while whisking hard, often with an emulsifier like egg yolk or mustard.",
    aliases: ["emulsified", "emulsifying", "emulsion"],
  },
  {
    slug: "temper",
    name: "Temper",
    shortTip: "Warm eggs (or chocolate) gradually so they don't seize or scramble.",
    description:
      "For custards, whisk a little hot liquid into the eggs to raise their temperature slowly before combining fully — this prevents curdling. For chocolate, controlled heating and cooling sets it glossy and snappy.",
    aliases: ["tempered", "tempering"],
  },
  {
    slug: "zest",
    name: "Zest",
    shortTip: "Grate only the colored citrus peel — avoid the bitter white pith.",
    description:
      "The outer rind holds aromatic oils that add bright citrus flavor. Use a microplane or zester and turn the fruit as you go, stopping at the white pith beneath, which tastes bitter.",
    aliases: ["zested", "zesting"],
  },
  {
    slug: "marinate",
    name: "Marinate",
    shortTip: "Soak in a seasoned liquid to add flavor and, with acid, tenderize.",
    description:
      "A marinade of acid, fat and aromatics seasons the surface and can slightly tenderize proteins. Marinate in the fridge; acidic mixes work in as little as 30 minutes, while tougher cuts benefit from hours.",
    aliases: ["marinated", "marinating", "marinade"],
  },
  {
    slug: "reduce",
    name: "Reduce",
    shortTip: "Simmer a liquid down to concentrate flavor and thicken it.",
    description:
      "Boiling or simmering evaporates water, intensifying taste and body. Reduce sauces, stocks and glazes uncovered until they coat the back of a spoon. It only concentrates — so salt at the end.",
    aliases: ["reduced", "reducing", "reduction"],
  },
  {
    slug: "rest",
    name: "Rest",
    shortTip: "Let cooked meat sit before slicing so juices redistribute.",
    description:
      "Resting lets the muscle fibers relax and reabsorb juices that heat pushed to the center, so they stay on the plate instead of running out. Tent loosely with foil; a few minutes for steaks, longer for roasts.",
    aliases: ["rested", "resting", "let rest"],
  },
  {
    slug: "puree",
    name: "Purée",
    shortTip: "Blend or mash until completely smooth.",
    description:
      "Process cooked or soft ingredients into a uniform, lump-free consistency with a blender, food processor or food mill. The base for smooth soups and sauces; add liquid gradually to reach the texture you want.",
    aliases: ["puree", "pureed", "puréed", "pureeing", "blend", "blended"],
  },
];

export const TECHNIQUES: Record<string, Technique> = Object.fromEntries(
  SEED.map(({ aliases: _aliases, ...technique }) => [
    technique.slug,
    { ...technique, kidTip: KID_TIPS[technique.slug] },
  ]),
);

/** Lowercase, strip accents, and collapse whitespace for tolerant matching. */
function normalize(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

const INDEX = new Map<string, string>();
for (const seed of SEED) {
  for (const key of [seed.slug, seed.name, ...(seed.aliases ?? [])]) {
    INDEX.set(normalize(key), seed.slug);
  }
}

/**
 * Generate spelling variants so plurals/gerunds/past tense still resolve
 * (e.g. "dicing" -> "dice", "reduced" -> "reduce", "matchsticks" -> "matchstick").
 */
function variants(normalized: string): string[] {
  const out = new Set<string>([normalized]);
  const collapsed = normalized.replace(/[\s-]+/g, "");
  out.add(collapsed);
  for (const base of [normalized, collapsed]) {
    if (base.endsWith("ing")) {
      out.add(base.slice(0, -3));
      out.add(base.slice(0, -3) + "e");
    }
    if (base.endsWith("ed")) {
      out.add(base.slice(0, -2));
      out.add(base.slice(0, -1));
    }
    if (base.endsWith("es")) out.add(base.slice(0, -2));
    if (base.endsWith("s")) out.add(base.slice(0, -1));
  }
  return [...out];
}

/**
 * Resolve a free-form technique label to a knowledge-base entry.
 * Unknown labels return `{ known: false }` with the trimmed raw label so the
 * UI can still render them gracefully.
 */
export function lookupTechnique(rawLabel: string): TechniqueMatch {
  const label = (rawLabel ?? "").trim();
  const normalized = normalize(label);

  if (normalized.length > 0) {
    for (const candidate of variants(normalized)) {
      const slug = INDEX.get(candidate);
      if (slug) {
        const technique = TECHNIQUES[slug]!;
        return {
          slug: technique.slug,
          label: technique.name,
          known: true,
          shortTip: technique.shortTip,
          description: technique.description,
          kidTip: technique.kidTip,
        };
      }
    }
  }

  return {
    slug: normalized.replace(/\s+/g, "-") || "technique",
    label,
    known: false,
    suggestion: suggestTechnique(normalized) ?? undefined,
  };
}

/** Look up a single technique by slug (or any known alias). */
export function getTechnique(slug: string): Technique | undefined {
  const direct = TECHNIQUES[slug];
  if (direct) return direct;
  const viaIndex = INDEX.get(normalize(slug));
  return viaIndex ? TECHNIQUES[viaIndex] : undefined;
}

/** Every curated technique, sorted alphabetically by name. */
export function allTechniques(): Technique[] {
  return Object.values(TECHNIQUES).sort((a, b) => a.name.localeCompare(b.name));
}

/** Levenshtein edit distance between two short strings (two-row DP). */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ai = a[i - 1];
    for (let j = 1; j <= n; j++) {
      const cost = ai === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1, // deletion
        (curr[j - 1] ?? 0) + 1, // insertion
        (prev[j - 1] ?? 0) + cost, // substitution
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j] ?? 0;
  }
  return prev[n] ?? 0;
}

/** Candidate alias keys long enough to fuzzy-match against without noise. */
const SUGGESTION_KEYS = [...INDEX.keys()].filter((key) => key.length >= 3);

/**
 * Best fuzzy "did you mean …?" suggestion for an unrecognized label: the
 * closest known technique within a small edit distance, or `null`. Powers a
 * gentle typo hint (e.g. "braize" -> Braise, "sautee" -> Sauté) while staying
 * conservative so genuinely novel techniques aren't second-guessed.
 */
export function suggestTechnique(rawLabel: string): TechniqueSuggestion | null {
  const normalized = normalize(rawLabel ?? "");
  if (normalized.length < 3) return null;
  // Anything the exact/alias index already knows needs no suggestion.
  if (INDEX.has(normalized)) return null;

  let bestSlug: string | null = null;
  let bestDist = Infinity;
  for (const key of SUGGESTION_KEYS) {
    const dist = editDistance(normalized, key);
    if (dist < bestDist) {
      bestDist = dist;
      bestSlug = INDEX.get(key) ?? null;
    }
  }

  if (bestSlug === null || bestDist === 0) return null;
  // Tighter tolerance for short words to avoid spurious matches.
  const threshold = normalized.length <= 4 ? 1 : 2;
  if (bestDist > threshold) return null;

  const technique = TECHNIQUES[bestSlug];
  return technique ? { slug: technique.slug, label: technique.name } : null;
}
