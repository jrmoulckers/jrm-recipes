/**
 * Smart ingredient substitutions: a curated, fully-static knowledge base of
 * common pantry swaps plus a tolerant matcher that maps a recipe ingredient's
 * free-text `item` string onto a knowledge-base entry.
 *
 * Everything here is pure and dependency-light (only quantity formatting from
 * `units`), so it works offline, needs no database, and is easy to unit-test.
 */

import { formatQuantity, roundNice } from "./units";

/**
 * The canonical dietary tags, in display order. This is the single source of
 * truth for both substitution badges and a recipe's structured dietary
 * self-declaration (issue #404), so the two can never drift.
 */
export const DIETARY_TAGS = [
  "vegan",
  "vegetarian",
  "dairy-free",
  "gluten-free",
  "egg-free",
] as const;

/** Dietary badges surfaced alongside a suggested swap. */
export type DietaryTag = (typeof DIETARY_TAGS)[number];

/** Human-friendly labels for the dietary tags. */
export const DIETARY_TAG_LABELS: Record<DietaryTag, string> = {
  vegan: "Vegan",
  vegetarian: "Vegetarian",
  "dairy-free": "Dairy-free",
  "gluten-free": "Gluten-free",
  "egg-free": "Egg-free",
};

const DIETARY_TAG_SET: ReadonlySet<string> = new Set(DIETARY_TAGS);

/** Narrow an arbitrary string (e.g. a DB row value) to a canonical DietaryTag. */
export function isDietaryTag(value: string): value is DietaryTag {
  return DIETARY_TAG_SET.has(value);
}

/** A single suggested swap for an ingredient. */
export type Substitution = {
  /** Short name of the replacement, e.g. "Milk + acid". */
  substitute: string;
  /** The ratio and any prep guidance, e.g. "1 cup milk + 1 tbsp lemon juice". */
  ratioOrNotes: string;
  /** Optional dietary properties of *this* swap. */
  dietaryTags?: DietaryTag[];
};

/** A knowledge-base entry: one staple ingredient and how to replace it. */
export type SubstitutionEntry = {
  /** Human-friendly display name, e.g. "Buttermilk". */
  name: string;
  /**
   * Normalized match phrases (lowercase, no punctuation/accents). Include both
   * singular and plural forms; the matcher prefers the longest phrase that
   * appears as whole words in the ingredient text.
   */
  aliases: string[];
  substitutions: Substitution[];
};

/**
 * The curated knowledge base. ~40 common baking and cooking staples. Keep
 * ratios realistic and phrase herb swaps neutrally so they read correctly
 * whether the cook has the fresh or the dried form.
 */
export const SUBSTITUTIONS: SubstitutionEntry[] = [
  {
    name: "Buttermilk",
    aliases: ["buttermilk"],
    substitutions: [
      {
        substitute: "Milk + acid",
        ratioOrNotes:
          "1 cup milk + 1 tbsp lemon juice or white vinegar; rest 5 min until curdled.",
      },
      {
        substitute: "Plain yogurt",
        ratioOrNotes: "1:1; thin with a splash of milk if needed.",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Plant milk + acid",
        ratioOrNotes:
          "1 cup soy or almond milk + 1 tbsp lemon juice; rest 5 min.",
        dietaryTags: ["vegan", "dairy-free"],
      },
    ],
  },
  {
    name: "Butter",
    aliases: ["butter", "unsalted butter", "salted butter"],
    substitutions: [
      {
        substitute: "Neutral or olive oil",
        ratioOrNotes: "Use about ¾ cup oil per 1 cup butter (baking results vary).",
        dietaryTags: ["vegan", "dairy-free"],
      },
      {
        substitute: "Coconut oil",
        ratioOrNotes: "1:1 measured solid; great for baking.",
        dietaryTags: ["vegan", "dairy-free"],
      },
      {
        substitute: "Unsweetened applesauce",
        ratioOrNotes: "Replace up to half the butter for lower-fat baking.",
        dietaryTags: ["vegan", "dairy-free"],
      },
    ],
  },
  {
    name: "Egg",
    aliases: ["egg", "eggs", "large egg", "large eggs"],
    substitutions: [
      {
        substitute: "Flax egg",
        ratioOrNotes:
          "1 tbsp ground flax + 3 tbsp water per egg; rest 5 min to gel.",
        dietaryTags: ["vegan", "egg-free", "dairy-free"],
      },
      {
        substitute: "Unsweetened applesauce",
        ratioOrNotes: "¼ cup per egg for binding in baked goods.",
        dietaryTags: ["vegan", "egg-free", "dairy-free"],
      },
      {
        substitute: "Mashed banana",
        ratioOrNotes: "¼ cup (about ½ banana) per egg; adds a little flavor.",
        dietaryTags: ["vegan", "egg-free", "dairy-free"],
      },
      {
        substitute: "Commercial egg replacer",
        ratioOrNotes: "Whisk per package directions, one portion per egg.",
        dietaryTags: ["vegan", "egg-free"],
      },
    ],
  },
  {
    name: "Sour cream",
    aliases: ["sour cream"],
    substitutions: [
      {
        substitute: "Plain Greek yogurt",
        ratioOrNotes: "1:1; the closest everyday swap.",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Blended cottage cheese",
        ratioOrNotes: "Blend smooth and use 1:1.",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Cashew or coconut sour cream",
        ratioOrNotes: "1:1.",
        dietaryTags: ["vegan", "dairy-free"],
      },
    ],
  },
  {
    name: "Heavy cream",
    aliases: [
      "heavy cream",
      "heavy whipping cream",
      "whipping cream",
      "double cream",
      "cream",
    ],
    substitutions: [
      {
        substitute: "Milk + melted butter",
        ratioOrNotes:
          "¾ cup milk + ¼ cup melted butter per cup (for cooking, not whipping).",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Evaporated milk",
        ratioOrNotes: "1:1 for cooking; it won't whip.",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Chilled coconut cream",
        ratioOrNotes: "1:1; whips when cold.",
        dietaryTags: ["vegan", "dairy-free"],
      },
    ],
  },
  {
    name: "Half-and-half",
    aliases: ["half and half", "half half"],
    substitutions: [
      {
        substitute: "Milk + cream",
        ratioOrNotes: "¾ cup milk + ¼ cup heavy cream per cup.",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Whole milk + butter",
        ratioOrNotes: "1 cup whole milk + 1 tbsp melted butter.",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Evaporated milk",
        ratioOrNotes: "1:1.",
        dietaryTags: ["vegetarian"],
      },
    ],
  },
  {
    name: "Milk",
    aliases: ["milk", "whole milk", "skim milk"],
    substitutions: [
      {
        substitute: "Plant milk",
        ratioOrNotes: "1:1 soy, oat, or almond milk.",
        dietaryTags: ["vegan", "dairy-free"],
      },
      {
        substitute: "Evaporated milk + water",
        ratioOrNotes: "½ cup evaporated milk + ½ cup water per cup.",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Water or broth",
        ratioOrNotes: "1:1 in savory cooking; slightly thinner and less rich.",
        dietaryTags: ["vegan", "dairy-free"],
      },
    ],
  },
  {
    // Plant milks are already vegan and dairy-free, so they must not inherit the
    // cow-milk swaps from the "Milk" entry (#59). Guidance here helps cooks swap
    // between plant milks — e.g. away from a nut milk for an allergy.
    name: "Plant milk",
    aliases: [
      "plant milk",
      "plant based milk",
      "non dairy milk",
      "nondairy milk",
      "almond milk",
      "oat milk",
      "soy milk",
      "soya milk",
      "rice milk",
      "cashew milk",
      "coconut milk",
      "hemp milk",
      "pea milk",
      "hazelnut milk",
    ],
    substitutions: [
      {
        substitute: "Any other unsweetened plant milk",
        ratioOrNotes:
          "1:1 oat, soy, almond, or rice — choose one that suits the eater's allergies.",
        dietaryTags: ["vegan", "dairy-free"],
      },
      {
        substitute: "Oat or soy milk (nut-free)",
        ratioOrNotes: "1:1; closest body to dairy milk and safe for nut allergies.",
        dietaryTags: ["vegan", "dairy-free"],
      },
      {
        substitute: "Dairy milk",
        ratioOrNotes: "1:1 if dairy is fine; richer, but not vegan.",
        dietaryTags: ["vegetarian"],
      },
    ],
  },
  {
    // Coconut cream is dairy-free, so it must not fall through to the "Heavy
    // cream" cow-dairy swaps (#59).
    name: "Coconut cream",
    aliases: ["coconut cream"],
    substitutions: [
      {
        substitute: "Chilled full-fat coconut milk",
        ratioOrNotes:
          "Refrigerate a can overnight and scoop the thick top; whips when cold.",
        dietaryTags: ["vegan", "dairy-free"],
      },
      {
        substitute: "Cashew cream",
        ratioOrNotes: "Blend soaked cashews with a little water until thick; 1:1.",
        dietaryTags: ["vegan", "dairy-free"],
      },
      {
        substitute: "Heavy cream",
        ratioOrNotes: "1:1 if dairy is fine; not vegan and without coconut flavor.",
        dietaryTags: ["vegetarian"],
      },
    ],
  },
  {
    name: "Crème fraîche",
    aliases: ["creme fraiche"],
    substitutions: [
      {
        substitute: "Sour cream",
        ratioOrNotes: "1:1; a touch tangier.",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Heavy cream + buttermilk",
        ratioOrNotes: "1 cup cream + 2 tbsp buttermilk; rest 12–24h to thicken.",
        dietaryTags: ["vegetarian"],
      },
    ],
  },
  {
    name: "Yogurt",
    aliases: ["yogurt", "greek yogurt", "plain yogurt"],
    substitutions: [
      {
        substitute: "Sour cream",
        ratioOrNotes: "1:1.",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Buttermilk",
        ratioOrNotes: "In baking use ¾ cup per cup and reduce other liquid.",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Coconut or soy yogurt",
        ratioOrNotes: "1:1.",
        dietaryTags: ["vegan", "dairy-free"],
      },
    ],
  },
  {
    name: "Cream cheese",
    aliases: ["cream cheese"],
    substitutions: [
      {
        substitute: "Mascarpone",
        ratioOrNotes: "1:1; richer with less tang.",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Blended cottage cheese + yogurt",
        ratioOrNotes: "Blend smooth and use 1:1.",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Cashew cream cheese",
        ratioOrNotes: "1:1.",
        dietaryTags: ["vegan", "dairy-free"],
      },
    ],
  },
  {
    name: "Ricotta",
    aliases: ["ricotta"],
    substitutions: [
      {
        substitute: "Blended cottage cheese",
        ratioOrNotes: "Blend smooth and use 1:1.",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Mascarpone",
        ratioOrNotes: "1:1 in sweet dishes; richer.",
        dietaryTags: ["vegetarian"],
      },
    ],
  },
  {
    name: "Mascarpone",
    aliases: ["mascarpone"],
    substitutions: [
      {
        substitute: "Cream cheese + cream",
        ratioOrNotes: "8 oz cream cheese + 2–3 tbsp heavy cream, beaten smooth.",
        dietaryTags: ["vegetarian"],
      },
    ],
  },
  {
    name: "Parmesan",
    aliases: ["parmesan", "parmigiano reggiano", "parmigiano"],
    substitutions: [
      {
        substitute: "Pecorino or Grana Padano",
        ratioOrNotes: "1:1 (pecorino is saltier).",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Nutritional yeast",
        ratioOrNotes: "Sprinkle to taste for a savory, cheesy note.",
        dietaryTags: ["vegan", "dairy-free"],
      },
    ],
  },
  {
    name: "Mayonnaise",
    aliases: ["mayonnaise", "mayo"],
    substitutions: [
      {
        substitute: "Plain Greek yogurt",
        ratioOrNotes: "1:1; lighter and tangier.",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Sour cream",
        ratioOrNotes: "1:1 in dressings and dips.",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Vegan mayo",
        ratioOrNotes: "1:1.",
        dietaryTags: ["vegan", "egg-free", "dairy-free"],
      },
    ],
  },
  {
    name: "All-purpose flour",
    aliases: ["all purpose flour", "plain flour", "ap flour", "white flour", "flour"],
    substitutions: [
      {
        substitute: "Cake + bread flour",
        ratioOrNotes: "A 50/50 blend approximates all-purpose.",
        dietaryTags: ["vegan", "dairy-free"],
      },
      {
        substitute: "Gluten-free 1:1 blend",
        ratioOrNotes: "Use a measure-for-measure GF baking blend.",
        dietaryTags: ["gluten-free", "vegan"],
      },
      {
        substitute: "Whole wheat flour",
        ratioOrNotes: "Swap up to half; expect a denser, nuttier result.",
        dietaryTags: ["vegan", "dairy-free"],
      },
    ],
  },
  {
    name: "Self-rising flour",
    aliases: ["self rising flour", "self raising flour"],
    substitutions: [
      {
        substitute: "All-purpose + leavening",
        ratioOrNotes:
          "1 cup AP flour + 1½ tsp baking powder + ¼ tsp salt per cup.",
        dietaryTags: ["vegan", "dairy-free"],
      },
    ],
  },
  {
    name: "Cake flour",
    aliases: ["cake flour"],
    substitutions: [
      {
        substitute: "AP flour + cornstarch",
        ratioOrNotes:
          "1 cup = ¾ cup + 2 tbsp AP flour + 2 tbsp cornstarch, sifted.",
        dietaryTags: ["vegan", "dairy-free"],
      },
    ],
  },
  {
    name: "Bread flour",
    aliases: ["bread flour"],
    substitutions: [
      {
        substitute: "All-purpose flour",
        ratioOrNotes:
          "1:1; slightly less chew. Add 1 tsp vital wheat gluten per cup if you have it.",
        dietaryTags: ["vegan", "dairy-free"],
      },
    ],
  },
  {
    name: "Cornstarch",
    aliases: ["cornstarch", "corn starch", "cornflour"],
    substitutions: [
      {
        substitute: "All-purpose flour",
        ratioOrNotes: "Use 2 tbsp flour per 1 tbsp cornstarch for thickening.",
        dietaryTags: ["vegan", "dairy-free"],
      },
      {
        substitute: "Arrowroot or tapioca",
        ratioOrNotes: "1:1 (arrowroot) for a clear, glossy finish.",
        dietaryTags: ["gluten-free", "vegan"],
      },
    ],
  },
  {
    name: "Baking powder",
    aliases: ["baking powder"],
    substitutions: [
      {
        substitute: "Baking soda + cream of tartar",
        ratioOrNotes: "¼ tsp baking soda + ½ tsp cream of tartar per 1 tsp.",
        dietaryTags: ["vegan", "gluten-free", "dairy-free"],
      },
    ],
  },
  {
    name: "Baking soda",
    aliases: ["baking soda", "bicarbonate of soda", "bicarb"],
    substitutions: [
      {
        substitute: "Baking powder",
        ratioOrNotes:
          "Use about 3× the baking soda amount; consider reducing added salt.",
        dietaryTags: ["vegan", "gluten-free", "dairy-free"],
      },
    ],
  },
  {
    name: "Brown sugar",
    aliases: ["brown sugar", "light brown sugar", "dark brown sugar"],
    substitutions: [
      {
        substitute: "White sugar + molasses",
        ratioOrNotes: "1 cup sugar + 1 tbsp molasses (2 tbsp for dark).",
        dietaryTags: ["vegan", "gluten-free"],
      },
      {
        substitute: "White sugar",
        ratioOrNotes: "1:1 in a pinch; slightly less moisture.",
        dietaryTags: ["vegan", "gluten-free"],
      },
      {
        substitute: "Coconut sugar",
        ratioOrNotes: "1:1.",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "Granulated sugar",
    aliases: ["white sugar", "granulated sugar", "caster sugar", "sugar"],
    substitutions: [
      {
        substitute: "Brown sugar",
        ratioOrNotes: "1:1; adds moisture and a little color.",
        dietaryTags: ["vegan", "gluten-free"],
      },
      {
        substitute: "Honey",
        ratioOrNotes:
          "¾ cup per cup; reduce other liquid by 2 tbsp and lower oven 25°F.",
        dietaryTags: ["vegetarian", "gluten-free"],
      },
      {
        substitute: "Coconut sugar",
        ratioOrNotes: "1:1.",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "Powdered sugar",
    aliases: ["powdered sugar", "confectioners sugar", "icing sugar"],
    substitutions: [
      {
        substitute: "Blended sugar + cornstarch",
        ratioOrNotes: "1 cup granulated sugar + 1 tbsp cornstarch, blended fine.",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "Honey",
    aliases: ["honey"],
    substitutions: [
      {
        substitute: "Maple syrup",
        ratioOrNotes: "1:1.",
        dietaryTags: ["vegan", "gluten-free"],
      },
      {
        substitute: "Sugar + water",
        ratioOrNotes: "1¼ cup sugar + ¼ cup water per cup of honey.",
        dietaryTags: ["vegan", "gluten-free"],
      },
      {
        substitute: "Agave nectar",
        ratioOrNotes: "Use about ⅔–¾ cup per cup; it's sweeter.",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "Maple syrup",
    aliases: ["maple syrup"],
    substitutions: [
      {
        substitute: "Honey",
        ratioOrNotes: "1:1 (not vegan).",
        dietaryTags: ["vegetarian", "gluten-free"],
      },
      {
        substitute: "Sugar + water",
        ratioOrNotes: "¾ cup sugar dissolved in ¼ cup water per cup.",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "Corn syrup",
    aliases: ["corn syrup", "light corn syrup"],
    substitutions: [
      {
        substitute: "Sugar syrup",
        ratioOrNotes:
          "1¼ cup sugar dissolved in ¼ cup water per cup (not for hard candy).",
        dietaryTags: ["vegan", "gluten-free"],
      },
      {
        substitute: "Honey or golden syrup",
        ratioOrNotes: "1:1; flavor will differ.",
        dietaryTags: ["vegetarian", "gluten-free"],
      },
    ],
  },
  {
    name: "Molasses",
    aliases: ["molasses", "treacle"],
    substitutions: [
      {
        substitute: "Dark brown sugar",
        ratioOrNotes: "¾ cup packed per cup; add a splash of liquid.",
        dietaryTags: ["vegan", "gluten-free"],
      },
      {
        substitute: "Maple syrup or honey",
        ratioOrNotes: "1:1; milder flavor.",
        dietaryTags: ["vegetarian", "gluten-free"],
      },
    ],
  },
  {
    name: "Cocoa powder",
    aliases: ["cocoa powder", "cocoa", "unsweetened cocoa"],
    substitutions: [
      {
        substitute: "Unsweetened baking chocolate",
        ratioOrNotes: "1 oz per 3 tbsp cocoa; cut fat elsewhere by 1 tbsp.",
        dietaryTags: ["vegetarian", "gluten-free"],
      },
    ],
  },
  {
    name: "Vanilla extract",
    aliases: ["vanilla extract", "vanilla"],
    substitutions: [
      {
        substitute: "Vanilla bean paste or seeds",
        ratioOrNotes: "1:1 paste, or the seeds of ½ bean per tsp.",
        dietaryTags: ["vegan", "gluten-free"],
      },
      {
        substitute: "Maple syrup or bourbon",
        ratioOrNotes: "1:1 in a pinch.",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "Breadcrumbs",
    aliases: ["breadcrumbs", "bread crumbs", "panko"],
    substitutions: [
      {
        substitute: "Crushed crackers or cornflakes",
        ratioOrNotes: "1:1.",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Rolled oats",
        ratioOrNotes: "Use about ¾ cup per cup as a binder in meatballs.",
        dietaryTags: ["vegan", "dairy-free"],
      },
      {
        substitute: "Gluten-free crumbs or almond meal",
        ratioOrNotes: "1:1.",
        dietaryTags: ["gluten-free", "vegetarian"],
      },
    ],
  },
  {
    name: "Vegetable oil",
    aliases: [
      "vegetable oil",
      "canola oil",
      "neutral oil",
      "cooking oil",
      "oil",
    ],
    substitutions: [
      {
        substitute: "Melted butter",
        ratioOrNotes: "1:1; adds flavor (not dairy-free).",
        dietaryTags: ["vegetarian"],
      },
      {
        substitute: "Unsweetened applesauce",
        ratioOrNotes: "1:1 in baking to cut fat.",
        dietaryTags: ["vegan", "dairy-free"],
      },
      {
        substitute: "Another neutral oil",
        ratioOrNotes: "Sunflower, grapeseed, or light olive oil 1:1.",
        dietaryTags: ["vegan", "dairy-free"],
      },
    ],
  },
  {
    name: "Lemon juice",
    aliases: ["lemon juice"],
    substitutions: [
      {
        substitute: "Lime juice",
        ratioOrNotes: "1:1.",
        dietaryTags: ["vegan", "gluten-free"],
      },
      {
        substitute: "White wine vinegar",
        ratioOrNotes: "Use half the amount for acidity (no citrus aroma).",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "Garlic",
    aliases: ["garlic", "garlic clove", "garlic cloves"],
    substitutions: [
      {
        substitute: "Garlic powder",
        ratioOrNotes: "⅛ tsp per clove.",
        dietaryTags: ["vegan", "gluten-free"],
      },
      {
        substitute: "Jarred minced garlic",
        ratioOrNotes: "½ tsp per clove.",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "Onion",
    aliases: ["onion", "onions", "yellow onion", "white onion", "red onion"],
    substitutions: [
      {
        substitute: "Onion powder",
        ratioOrNotes: "1 tbsp per medium onion.",
        dietaryTags: ["vegan", "gluten-free"],
      },
      {
        substitute: "Shallots or leeks",
        ratioOrNotes: "1:1 by volume; milder and a touch sweeter.",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "Shallot",
    aliases: ["shallot", "shallots"],
    substitutions: [
      {
        substitute: "Onion + a little garlic",
        ratioOrNotes: "About ½ small onion + a pinch of garlic per shallot.",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "Tomato paste",
    aliases: ["tomato paste"],
    substitutions: [
      {
        substitute: "Reduced tomato sauce",
        ratioOrNotes: "2–3 tbsp sauce per 1 tbsp paste; simmer to thicken.",
        dietaryTags: ["vegan", "gluten-free"],
      },
      {
        substitute: "Ketchup",
        ratioOrNotes: "1:1 in a pinch; it's sweeter and tangier.",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "Dijon mustard",
    aliases: ["dijon mustard", "dijon"],
    substitutions: [
      {
        substitute: "Yellow or stone-ground mustard",
        ratioOrNotes: "1:1; yellow is milder, stone-ground is grainier.",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "Soy sauce",
    aliases: ["soy sauce"],
    substitutions: [
      {
        substitute: "Tamari",
        ratioOrNotes: "1:1.",
        dietaryTags: ["gluten-free", "vegan"],
      },
      {
        substitute: "Coconut aminos",
        ratioOrNotes: "Use about 1.25×; milder and less salty.",
        dietaryTags: ["gluten-free", "vegan"],
      },
    ],
  },
  {
    name: "Red wine",
    aliases: ["red wine", "dry red wine"],
    substitutions: [
      {
        substitute: "Broth + red wine vinegar",
        ratioOrNotes: "1 cup beef or vegetable broth + 1 tbsp red wine vinegar.",
        dietaryTags: ["gluten-free"],
      },
      {
        substitute: "Grape juice + vinegar",
        ratioOrNotes: "1 cup grape juice + 1 tbsp vinegar (non-alcoholic).",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "White wine",
    aliases: ["white wine", "dry white wine"],
    substitutions: [
      {
        substitute: "Broth + lemon",
        ratioOrNotes: "1 cup chicken or vegetable broth + a squeeze of lemon.",
        dietaryTags: ["gluten-free"],
      },
      {
        substitute: "White grape juice + vinegar",
        ratioOrNotes: "1 cup juice + 1 tbsp white wine vinegar (non-alcoholic).",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "Basil",
    aliases: ["basil", "fresh basil", "dried basil"],
    substitutions: [
      {
        substitute: "Swap fresh ↔ dried",
        ratioOrNotes: "1 tbsp fresh = 1 tsp dried (about 1:3).",
        dietaryTags: ["vegan", "gluten-free"],
      },
      {
        substitute: "Oregano or thyme",
        ratioOrNotes: "1:1 as a substitute; flavor differs.",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "Parsley",
    aliases: ["parsley", "fresh parsley", "dried parsley"],
    substitutions: [
      {
        substitute: "Swap fresh ↔ dried",
        ratioOrNotes: "1 tbsp fresh = 1 tsp dried (about 1:3).",
        dietaryTags: ["vegan", "gluten-free"],
      },
      {
        substitute: "Cilantro or chervil",
        ratioOrNotes: "1:1 for color; flavor differs.",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "Cilantro",
    aliases: ["cilantro", "fresh cilantro", "coriander leaves"],
    substitutions: [
      {
        substitute: "Fresh parsley + lime",
        ratioOrNotes: "1:1 parsley for color, with a squeeze of lime.",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "Oregano",
    aliases: ["oregano", "fresh oregano", "dried oregano"],
    substitutions: [
      {
        substitute: "Swap fresh ↔ dried",
        ratioOrNotes: "1 tbsp fresh = 1 tsp dried (about 1:3).",
        dietaryTags: ["vegan", "gluten-free"],
      },
      {
        substitute: "Marjoram or basil",
        ratioOrNotes: "1:1; marjoram is closest.",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "Thyme",
    aliases: ["thyme", "fresh thyme", "dried thyme"],
    substitutions: [
      {
        substitute: "Swap fresh ↔ dried",
        ratioOrNotes: "1 tbsp fresh = 1 tsp dried (about 1:3).",
        dietaryTags: ["vegan", "gluten-free"],
      },
      {
        substitute: "Oregano or marjoram",
        ratioOrNotes: "1:1; flavor differs.",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
  {
    name: "Rosemary",
    aliases: ["rosemary", "fresh rosemary", "dried rosemary"],
    substitutions: [
      {
        substitute: "Swap fresh ↔ dried",
        ratioOrNotes: "1 tbsp fresh = 1 tsp dried (about 1:3).",
        dietaryTags: ["vegan", "gluten-free"],
      },
      {
        substitute: "Thyme or sage",
        ratioOrNotes: "1:1; use a little less sage.",
        dietaryTags: ["vegan", "gluten-free"],
      },
    ],
  },
];

// --- Matcher -------------------------------------------------------------

/**
 * Normalize a free-text ingredient string for matching: lowercase, strip
 * accents and parentheticals, drop anything after the first comma (usually a
 * prep note), and reduce punctuation/hyphens to single spaces.
 */
export function normalizeIngredient(item: string | null | undefined): string {
  if (!item) return "";
  let s = item.toLowerCase();
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // strip accents
  s = s.replace(/\([^)]*\)/g, " "); // drop parentheticals
  s = s.split(",")[0] ?? s; // keep the part before the first comma
  s = s.replace(/[^a-z0-9]+/g, " "); // punctuation & hyphens -> space
  return s.replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
  return value.split(" ").filter(Boolean);
}

/** Index where `phrase` first appears as a contiguous run of whole words in
 * `haystack`, or -1 when it doesn't. */
function phraseIndex(haystack: string[], phrase: string[]): number {
  if (phrase.length === 0 || phrase.length > haystack.length) return -1;
  for (let i = 0; i + phrase.length <= haystack.length; i++) {
    let matched = true;
    for (let j = 0; j < phrase.length; j++) {
      if (haystack[i + j] !== phrase[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return i;
  }
  return -1;
}

/**
 * Tokens that, sitting immediately before a bare "milk" or "cream", name a
 * distinct plant-based ingredient rather than the dairy staple. "almond milk"
 * and "coconut cream" are already vegan, so offering cow-milk / heavy-cream
 * swaps is wrong (#59); guarding these lets the dedicated plant entries win.
 */
const PLANT_DAIRY_QUALIFIERS = new Set([
  "almond",
  "oat",
  "soy",
  "soya",
  "rice",
  "cashew",
  "cashews",
  "coconut",
  "hemp",
  "pea",
  "hazelnut",
  "macadamia",
  "flax",
  "walnut",
]);

/**
 * Head nouns that turn a leading "egg"/"eggs" into a modifier for a different
 * dish rather than the whole-egg staple, e.g. "egg noodles" (#59).
 */
const EGG_COMPOUND_HEADS = new Set(["noodle", "noodles"]);

/**
 * Reject an otherwise-valid alias hit when a generic dairy/egg head noun is used
 * inside a compound that names a different ingredient (#59): "almond milk",
 * "coconut cream", "egg noodles". Only bare single-token aliases are guarded, so
 * full phrases (their own entries, or "whole milk") are unaffected.
 */
function isCompoundMismatch(
  haystack: string[],
  phrase: string[],
  at: number,
): boolean {
  if (phrase.length !== 1) return false;
  const word = phrase[0];
  if (word === "milk" || word === "cream") {
    const prev = at > 0 ? haystack[at - 1] : undefined;
    return prev != null && PLANT_DAIRY_QUALIFIERS.has(prev);
  }
  if (word === "egg" || word === "eggs") {
    const next = haystack[at + 1];
    return next != null && EGG_COMPOUND_HEADS.has(next);
  }
  return false;
}

type IndexedEntry = { entry: SubstitutionEntry; aliasTokens: string[][] };

const INDEX: IndexedEntry[] = SUBSTITUTIONS.map((entry) => ({
  entry,
  aliasTokens: entry.aliases.map((alias) => tokenize(normalizeIngredient(alias))),
}));

export type IngredientMatchConfidence = "high" | "medium" | "low";

export type DetailedIngredientMatch = {
  entry: SubstitutionEntry;
  score: number;
  confidence: IngredientMatchConfidence;
};

function confidenceForAlias(phrase: string[]): IngredientMatchConfidence {
  if (phrase.length > 1) return "high";
  const [onlyToken] = phrase;
  if (onlyToken && onlyToken.length >= 6) return "medium";
  return "low";
}

function hasAllDietaryTags(sub: Substitution, required: DietaryTag[]): boolean {
  if (required.length === 0) return true;
  const tags = sub.dietaryTags ?? [];
  return required.every((tag) => tags.includes(tag));
}

export function filterSubstitutionsByDiet(
  subs: Substitution[],
  required: DietaryTag[],
): Substitution[] {
  if (required.length === 0) return subs;
  return subs.filter((sub) => hasAllDietaryTags(sub, required));
}

export function orderSubstitutionsByDiet(
  subs: Substitution[],
  preferred: DietaryTag[],
): Substitution[] {
  if (preferred.length === 0) return subs;
  return [...subs].sort((a, b) => {
    const aMatches = hasAllDietaryTags(a, preferred);
    const bMatches = hasAllDietaryTags(b, preferred);
    if (aMatches === bMatches) return 0;
    return aMatches ? -1 : 1;
  });
}

/**
 * Match a recipe ingredient's `item` string to a knowledge-base entry, or
 * `null` when nothing sensible matches. Prefers the most specific alias (the
 * one with the most words), so "sour cream" beats "cream" and
 * "self-rising flour" beats "flour". Whole-word matching keeps "buttermilk"
 * from matching "milk".
 */
export function matchIngredientDetailed(
  item: string | null | undefined,
): DetailedIngredientMatch | null {
  const tokens = tokenize(normalizeIngredient(item));
  if (tokens.length === 0) return null;

  let best: DetailedIngredientMatch | null = null;
  for (const { entry, aliasTokens } of INDEX) {
    for (const phrase of aliasTokens) {
      const at = phraseIndex(tokens, phrase);
      if (at < 0) continue;
      if (isCompoundMismatch(tokens, phrase, at)) continue;
      const score = phrase.length * 100 + phrase.join(" ").length;
      if (!best || score > best.score) {
        best = { entry, score, confidence: confidenceForAlias(phrase) };
      }
    }
  }
  return best;
}

export function matchIngredient(
  item: string | null | undefined,
): SubstitutionEntry | null {
  return matchIngredientDetailed(item)?.entry ?? null;
}

/** Convenience: the list of swaps for an ingredient (empty when unmatched). */
export function getSubstitutions(
  item: string | null | undefined,
  required: DietaryTag[] = [],
): Substitution[] {
  const substitutions = matchIngredient(item)?.substitutions ?? [];
  if (required.length === 0) return substitutions;
  return filterSubstitutionsByDiet(
    orderSubstitutionsByDiet(substitutions, required),
    required,
  );
}

// --- Scaling nudge -------------------------------------------------------

/**
 * When scaling servings produces an awkward fractional amount of a countable
 * ingredient (no measuring unit, e.g. "1½ eggs"), return a short, friendly
 * rounding tip. Returns `null` for measured units (fractional cups are fine),
 * missing quantities, or amounts that are already close to whole.
 */
export function scalingNudge(
  quantity: number | null | undefined,
  unit: string | null | undefined,
  item: string | null | undefined,
): string | null {
  if (quantity == null || Number.isNaN(quantity)) return null;
  if (unit && unit.trim() !== "") return null; // measured units scale fine

  const value = roundNice(quantity);
  if (value <= 0) return null;

  const lower = Math.floor(value);
  const upper = Math.ceil(value);
  const frac = value - lower;
  if (frac <= 0.08 || frac >= 0.92) return null; // already effectively whole

  const pretty = formatQuantity(value);
  const normalized = normalizeIngredient(item);

  if (/\begg\b|\beggs\b/.test(normalized)) {
    const tbsp = formatQuantity(roundNice(value * 3));
    return `About ${pretty} eggs — whisk and measure ${tbsp} tbsp (1 egg ≈ 3 tbsp).`;
  }

  if (lower === 0) {
    return `About ${pretty} — round up to ${upper}.`;
  }
  return `About ${pretty} — round to ${lower} or ${upper}.`;
}
