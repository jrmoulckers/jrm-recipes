/**
 * Ingredient → picture-icon mapping for Kids mode (#440).
 *
 * A single, documented, **static** keyword map so a pre-reader can spot "butter"
 * or "carrot" by its emoji and fetch it themselves. Purely client-side and
 * offline-safe — no schema, no uploads, no network.
 *
 * Matching is case- and plural-tolerant and never throws on odd input:
 *   • the item is lowercased + diacritic-stripped, then split into words;
 *   • each word is checked in singular + plural form (egg/eggs, tomato/tomatoes);
 *   • multi-word keywords ("olive oil", "peanut butter") match as a phrase.
 * Entries are ordered most-specific first so "buttermilk" beats "butter" and
 * "sweet potato" beats "potato". Anything unmatched gets a friendly bowl 🥣.
 */

export const FALLBACK_INGREDIENT_ICON = "🥣";

type IconEntry = { emoji: string; patterns: string[] };

/** Ordered most-specific → most-general; the first match wins. */
const ICON_ENTRIES: IconEntry[] = [
  // Specific compounds first so they aren't shadowed by a broader keyword.
  {
    emoji: "🥜",
    patterns: [
      "peanut butter",
      "peanut",
      "peanuts",
      "almond",
      "walnut",
      "cashew",
      "pecan",
      "hazelnut",
      "nut",
      "nuts",
    ],
  },
  { emoji: "🥛", patterns: ["buttermilk"] },
  { emoji: "🍠", patterns: ["sweet potato", "sweet potatoes", "yam"] },
  { emoji: "🫑", patterns: ["bell pepper", "bell peppers"] },
  {
    emoji: "🌶️",
    patterns: [
      "chili",
      "chilli",
      "chile",
      "jalapeno",
      "jalapenos",
      "cayenne",
      "chipotle",
      "chilies",
    ],
  },
  { emoji: "🫒", patterns: ["olive oil", "olive", "olives", "oil"] },
  { emoji: "🍫", patterns: ["chocolate", "cocoa", "cacao"] },

  // Dairy & eggs.
  { emoji: "🥚", patterns: ["egg", "eggs"] },
  { emoji: "🧈", patterns: ["butter", "margarine"] },
  {
    emoji: "🧀",
    patterns: ["cheese", "cheddar", "parmesan", "mozzarella", "feta"],
  },
  { emoji: "🥛", patterns: ["milk", "cream", "yogurt", "yoghurt"] },

  // Bakery & grains.
  {
    emoji: "🌾",
    patterns: ["flour", "oat", "oats", "wheat", "cornmeal", "bran"],
  },
  {
    emoji: "🍞",
    patterns: [
      "bread",
      "breadcrumb",
      "breadcrumbs",
      "baguette",
      "toast",
      "bun",
      "buns",
      "roll",
      "rolls",
    ],
  },
  { emoji: "🍚", patterns: ["rice"] },
  {
    emoji: "🍝",
    patterns: ["pasta", "spaghetti", "noodle", "noodles", "macaroni", "penne"],
  },

  // Sweeteners & baking.
  { emoji: "🍬", patterns: ["sugar"] },
  { emoji: "🍯", patterns: ["honey", "syrup", "molasses"] },
  { emoji: "🧂", patterns: ["salt", "baking soda", "baking powder"] },

  // Produce — vegetables.
  { emoji: "🥕", patterns: ["carrot", "carrots"] },
  {
    emoji: "🧅",
    patterns: [
      "onion",
      "onions",
      "scallion",
      "scallions",
      "shallot",
      "shallots",
      "leek",
      "leeks",
    ],
  },
  { emoji: "🧄", patterns: ["garlic"] },
  { emoji: "🍅", patterns: ["tomato", "tomatoes"] },
  { emoji: "🥔", patterns: ["potato", "potatoes"] },
  { emoji: "🌽", patterns: ["corn", "sweetcorn"] },
  { emoji: "🍄", patterns: ["mushroom", "mushrooms"] },
  { emoji: "🥦", patterns: ["broccoli"] },
  {
    emoji: "🥬",
    patterns: ["spinach", "lettuce", "kale", "cabbage", "greens", "chard"],
  },
  {
    emoji: "🥒",
    patterns: ["cucumber", "cucumbers", "zucchini", "pickle", "pickles"],
  },
  { emoji: "🍆", patterns: ["eggplant", "aubergine"] },
  { emoji: "🥑", patterns: ["avocado", "avocados"] },
  {
    emoji: "🫘",
    patterns: ["bean", "beans", "lentil", "lentils", "chickpea", "chickpeas"],
  },

  // Produce — fruit.
  { emoji: "🍋", patterns: ["lemon", "lemons", "lime", "limes"] },
  { emoji: "🍎", patterns: ["apple", "apples"] },
  { emoji: "🍌", patterns: ["banana", "bananas"] },
  {
    emoji: "🍓",
    patterns: [
      "strawberry",
      "strawberries",
      "berry",
      "berries",
      "raspberry",
      "raspberries",
    ],
  },
  { emoji: "🫐", patterns: ["blueberry", "blueberries"] },
  { emoji: "🍊", patterns: ["orange", "oranges", "tangerine", "mandarin"] },
  { emoji: "🍑", patterns: ["peach", "peaches", "apricot"] },

  // Proteins.
  { emoji: "🍗", patterns: ["chicken", "turkey", "poultry"] },
  { emoji: "🥩", patterns: ["beef", "steak", "veal", "lamb"] },
  { emoji: "🥓", patterns: ["bacon", "pork", "ham"] },
  { emoji: "🌭", patterns: ["sausage", "sausages", "hot dog", "hotdog"] },
  { emoji: "🐟", patterns: ["fish", "salmon", "tuna", "cod", "tilapia"] },
  { emoji: "🦐", patterns: ["shrimp", "prawn", "prawns"] },

  // Pantry & drinks.
  { emoji: "💧", patterns: ["water"] },
  { emoji: "🧊", patterns: ["ice"] },
  { emoji: "🧃", patterns: ["juice"] },
  { emoji: "🍷", patterns: ["wine"] },
  { emoji: "☕", patterns: ["coffee", "espresso"] },
  { emoji: "🍵", patterns: ["tea", "matcha"] },
  {
    emoji: "🌿",
    patterns: [
      "basil",
      "parsley",
      "cilantro",
      "coriander",
      "mint",
      "thyme",
      "rosemary",
      "oregano",
      "herb",
      "herbs",
      "sage",
      "dill",
    ],
  },
];

/** Lowercase + strip diacritics so "Purée" and "Jalapeño" match ASCII keywords. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Build the set of word forms present in an item, adding singular variants. */
function wordForms(normalized: string): Set<string> {
  const forms = new Set<string>();
  for (const token of normalized.split(/[^a-z]+/)) {
    if (!token) continue;
    forms.add(token);
    if (token.endsWith("es")) forms.add(token.slice(0, -2));
    if (token.endsWith("s")) forms.add(token.slice(0, -1));
  }
  return forms;
}

/**
 * Pick a decorative emoji for an ingredient name. Always returns something —
 * a matched icon or the friendly {@link FALLBACK_INGREDIENT_ICON}. Safe on
 * empty/undefined input.
 */
export function ingredientIcon(item: string | null | undefined): string {
  if (!item) return FALLBACK_INGREDIENT_ICON;
  const normalized = normalize(item);
  if (!normalized.trim()) return FALLBACK_INGREDIENT_ICON;
  const forms = wordForms(normalized);

  for (const entry of ICON_ENTRIES) {
    for (const pattern of entry.patterns) {
      const matched = pattern.includes(" ")
        ? normalized.includes(pattern)
        : forms.has(pattern);
      if (matched) return entry.emoji;
    }
  }
  return FALLBACK_INGREDIENT_ICON;
}
