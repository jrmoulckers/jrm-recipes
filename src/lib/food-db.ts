/**
 * Food / ingredient knowledge base: a curated, fully-static dataset that maps a
 * recipe ingredient's free-text `item` string onto a **food category** (liquid,
 * spice, produce-whole, …) and, where known, an approximate density. This is the
 * foundation the interchangeable-units picker builds on — see `food-units.ts`
 * for the category → suggested-units mapping and `getSuggestedUnitsForFood`.
 *
 * Everything here is pure and dependency-free (it deliberately does **not**
 * import from `units.ts` or `substitutions.ts`), so it works offline, needs no
 * database, is trivially unit-testable, and can never become a merge hotspot
 * with the units-conversion library. The tolerant matcher mirrors the
 * normalizer style used across the app (`substitutions.ts`, `units.ts`
 * `densityTokens`): lowercase, strip accents/parentheticals, keep the text
 * before the first comma, then whole-word phrase match with longest-match-wins
 * so "brown sugar" beats "sugar" and "sweet potato" beats "potato".
 *
 * A Drizzle `food_items` table (`src/server/db/schema/ingredients.ts`) mirrors
 * this dataset and is seeded from it, but the picker reads this module directly
 * so its suggestions stay synchronous and client-safe.
 */

/**
 * The food taxonomy. Categories are chosen for how a cook *measures* the food,
 * not botanical accuracy: `produce-whole` (measured by count/weight) is distinct
 * from `produce-leafy` (loose-packed by volume/weight) and `produce-fruit`
 * (often by the cup). `baking` covers dry baking staples weighed most precisely
 * (flour, sugar, cocoa, leaveners); `dry-good` covers pantry dry goods
 * (rice/pasta/dry beans). `other` is the safe fallback.
 */
export type FoodCategory =
  | "liquid"
  | "dairy"
  | "baking"
  | "dry-good"
  | "grain"
  | "legume"
  | "produce-whole"
  | "produce-leafy"
  | "produce-fruit"
  | "herb"
  | "spice"
  | "meat"
  | "seafood"
  | "egg"
  | "fat-oil"
  | "sweetener"
  | "nut-seed"
  | "condiment"
  | "other";

/** Canonical display order — also a stable order for any category listing. */
export const FOOD_CATEGORIES = [
  "liquid",
  "dairy",
  "baking",
  "dry-good",
  "grain",
  "legume",
  "produce-whole",
  "produce-leafy",
  "produce-fruit",
  "herb",
  "spice",
  "meat",
  "seafood",
  "egg",
  "fat-oil",
  "sweetener",
  "nut-seed",
  "condiment",
  "other",
] as const satisfies readonly FoodCategory[];

/**
 * English fallback labels. User-facing surfaces should prefer the `next-intl`
 * `foodCategories` namespace; these keep the module usable without a translator
 * (tests, server logs, non-localized contexts) and document each category.
 */
export const FOOD_CATEGORY_LABELS: Record<FoodCategory, string> = {
  liquid: "Liquid",
  dairy: "Dairy",
  baking: "Baking staple",
  "dry-good": "Dry good",
  grain: "Grain",
  legume: "Legume",
  "produce-whole": "Whole produce",
  "produce-leafy": "Leafy produce",
  "produce-fruit": "Fruit",
  herb: "Herb",
  spice: "Spice",
  meat: "Meat",
  seafood: "Seafood",
  egg: "Egg",
  "fat-oil": "Fat / oil",
  sweetener: "Sweetener",
  "nut-seed": "Nut / seed",
  condiment: "Condiment",
  other: "Other",
};

const FOOD_CATEGORY_SET: ReadonlySet<string> = new Set(FOOD_CATEGORIES);

/** Narrow an arbitrary string (e.g. a DB row value) to a canonical category. */
export function isFoodCategory(value: string): value is FoodCategory {
  return FOOD_CATEGORY_SET.has(value);
}

/** One entry in the knowledge base. */
export type FoodItem = {
  /** Human-friendly display name, e.g. "Brown sugar". */
  name: string;
  /** How the food is measured — drives unit suggestions. */
  category: FoodCategory;
  /**
   * Approximate density in grams per millilitre, where a cook would weigh it.
   * Values mirror kitchen references (coverage matters more than precision).
   * Omitted for foods measured by count/weight (most produce, meat, eggs).
   */
  densityGPerMl?: number;
  /**
   * Normalized match phrases (lowercase, no punctuation/accents). Include
   * singular *and* plural forms; the matcher prefers the longest phrase that
   * appears as whole words in the ingredient text.
   */
  aliases: string[];
};

/**
 * The curated knowledge base. Ordered loosely by category for readability; the
 * matcher is order-independent (longest alias wins), so ordering here is purely
 * cosmetic. Densities for liquids/baking staples/oils mirror the `units.ts`
 * density set and extend it. Keep aliases realistic and include obvious
 * synonyms so free-text ingredient lines resolve.
 */
export const FOOD_ITEMS: FoodItem[] = [
  // --- Liquids -----------------------------------------------------------
  { name: "Water", category: "liquid", densityGPerMl: 1.0, aliases: ["water"] },
  {
    name: "Stock / broth",
    category: "liquid",
    densityGPerMl: 1.0,
    aliases: [
      "stock",
      "broth",
      "chicken stock",
      "beef stock",
      "vegetable stock",
      "chicken broth",
      "beef broth",
      "vegetable broth",
      "bone broth",
    ],
  },
  {
    name: "Wine",
    category: "liquid",
    densityGPerMl: 0.99,
    aliases: ["wine", "red wine", "white wine", "cooking wine"],
  },
  {
    name: "Beer",
    category: "liquid",
    densityGPerMl: 1.01,
    aliases: ["beer", "lager", "ale", "stout"],
  },
  {
    name: "Juice",
    category: "liquid",
    densityGPerMl: 1.05,
    aliases: [
      "juice",
      "orange juice",
      "apple juice",
      "lemon juice",
      "lime juice",
      "pineapple juice",
    ],
  },
  {
    name: "Coffee",
    category: "liquid",
    densityGPerMl: 1.0,
    aliases: ["coffee", "brewed coffee", "espresso"],
  },
  {
    name: "Tea",
    category: "liquid",
    densityGPerMl: 1.0,
    aliases: ["tea", "brewed tea"],
  },
  {
    name: "Coconut milk",
    category: "liquid",
    densityGPerMl: 0.99,
    aliases: ["coconut milk", "coconut cream"],
  },
  {
    name: "Plant milk",
    category: "liquid",
    densityGPerMl: 1.03,
    aliases: [
      "almond milk",
      "soy milk",
      "oat milk",
      "rice milk",
      "cashew milk",
      "hemp milk",
      "plant milk",
      "non dairy milk",
    ],
  },

  // --- Dairy -------------------------------------------------------------
  {
    name: "Milk",
    category: "dairy",
    densityGPerMl: 1.03,
    aliases: ["milk", "whole milk", "skim milk", "buttermilk"],
  },
  {
    name: "Cream",
    category: "dairy",
    densityGPerMl: 1.0,
    aliases: [
      "cream",
      "heavy cream",
      "double cream",
      "whipping cream",
      "sour cream",
      "half and half",
    ],
  },
  {
    name: "Yogurt",
    category: "dairy",
    densityGPerMl: 1.03,
    aliases: ["yogurt", "yoghurt", "greek yogurt", "greek yoghurt"],
  },
  {
    name: "Cheese",
    category: "dairy",
    aliases: [
      "cheese",
      "cheddar",
      "parmesan",
      "parmigiano reggiano",
      "mozzarella",
      "feta",
      "gouda",
      "gruyere",
      "cream cheese",
      "ricotta",
      "cottage cheese",
    ],
  },

  // --- Baking staples ----------------------------------------------------
  {
    name: "Flour",
    category: "baking",
    densityGPerMl: 0.53,
    aliases: [
      "flour",
      "all purpose flour",
      "plain flour",
      "bread flour",
      "cake flour",
      "self rising flour",
      "self raising flour",
    ],
  },
  {
    name: "Whole wheat flour",
    category: "baking",
    densityGPerMl: 0.55,
    aliases: ["whole wheat flour", "wholemeal flour", "whole grain flour"],
  },
  {
    name: "Almond flour",
    category: "baking",
    densityGPerMl: 0.42,
    aliases: ["almond flour", "almond meal"],
  },
  {
    name: "Sugar",
    category: "baking",
    densityGPerMl: 0.85,
    aliases: ["sugar", "granulated sugar", "caster sugar", "white sugar"],
  },
  {
    name: "Brown sugar",
    category: "baking",
    densityGPerMl: 0.9,
    aliases: ["brown sugar"],
  },
  {
    name: "Powdered sugar",
    category: "baking",
    densityGPerMl: 0.5,
    aliases: ["powdered sugar", "confectioners sugar", "icing sugar"],
  },
  {
    name: "Cocoa powder",
    category: "baking",
    densityGPerMl: 0.45,
    aliases: ["cocoa", "cocoa powder", "cacao powder"],
  },
  {
    name: "Cornstarch",
    category: "baking",
    densityGPerMl: 0.54,
    aliases: ["cornstarch", "corn starch", "cornflour"],
  },
  {
    name: "Baking soda",
    category: "baking",
    densityGPerMl: 0.9,
    aliases: ["baking soda", "bicarbonate of soda", "bicarb"],
  },
  {
    name: "Baking powder",
    category: "baking",
    densityGPerMl: 0.9,
    aliases: ["baking powder"],
  },
  {
    name: "Yeast",
    category: "baking",
    densityGPerMl: 0.7,
    aliases: ["yeast", "active dry yeast", "instant yeast", "fresh yeast"],
  },
  {
    name: "Chocolate chips",
    category: "baking",
    densityGPerMl: 0.75,
    aliases: [
      "chocolate chips",
      "chocolate chip",
      "chocolate",
      "dark chocolate",
      "chocolate chunks",
    ],
  },
  {
    name: "Breadcrumbs",
    category: "baking",
    densityGPerMl: 0.35,
    aliases: ["breadcrumbs", "bread crumbs", "panko"],
  },

  // --- Dry goods / grains -----------------------------------------------
  {
    name: "Rice",
    category: "grain",
    densityGPerMl: 0.85,
    aliases: [
      "rice",
      "white rice",
      "brown rice",
      "basmati rice",
      "jasmine rice",
      "arborio rice",
    ],
  },
  {
    name: "Pasta",
    category: "dry-good",
    aliases: [
      "pasta",
      "spaghetti",
      "penne",
      "macaroni",
      "noodles",
      "fusilli",
      "linguine",
      "rigatoni",
    ],
  },
  {
    name: "Oats",
    category: "grain",
    densityGPerMl: 0.41,
    aliases: ["oats", "rolled oats", "oatmeal", "quick oats"],
  },
  {
    name: "Quinoa",
    category: "grain",
    densityGPerMl: 0.85,
    aliases: ["quinoa"],
  },
  {
    name: "Couscous",
    category: "grain",
    densityGPerMl: 0.75,
    aliases: ["couscous"],
  },
  {
    name: "Cornmeal",
    category: "grain",
    densityGPerMl: 0.6,
    aliases: ["cornmeal", "polenta", "grits"],
  },
  {
    name: "Barley",
    category: "grain",
    densityGPerMl: 0.8,
    aliases: ["barley", "pearl barley"],
  },
  {
    name: "Bulgur",
    category: "grain",
    densityGPerMl: 0.72,
    aliases: ["bulgur", "bulghur", "cracked wheat"],
  },

  // --- Legumes -----------------------------------------------------------
  {
    name: "Beans",
    category: "legume",
    densityGPerMl: 0.77,
    aliases: [
      "beans",
      "black beans",
      "kidney beans",
      "pinto beans",
      "cannellini beans",
      "white beans",
      "navy beans",
    ],
  },
  {
    name: "Chickpeas",
    category: "legume",
    densityGPerMl: 0.8,
    aliases: ["chickpeas", "garbanzo beans", "garbanzos"],
  },
  {
    name: "Lentils",
    category: "legume",
    densityGPerMl: 0.85,
    aliases: ["lentils", "red lentils", "green lentils"],
  },
  {
    name: "Peas",
    category: "legume",
    densityGPerMl: 0.72,
    aliases: ["peas", "split peas", "green peas"],
  },

  // --- Whole produce (count / weight) -----------------------------------
  {
    name: "Onion",
    category: "produce-whole",
    aliases: ["onion", "onions", "red onion", "yellow onion", "white onion"],
  },
  {
    name: "Garlic",
    category: "produce-whole",
    aliases: ["garlic", "garlic clove", "garlic cloves", "clove of garlic"],
  },
  {
    name: "Shallot",
    category: "produce-whole",
    aliases: ["shallot", "shallots"],
  },
  {
    name: "Potato",
    category: "produce-whole",
    aliases: ["potato", "potatoes"],
  },
  {
    name: "Sweet potato",
    category: "produce-whole",
    aliases: ["sweet potato", "sweet potatoes", "yam", "yams"],
  },
  { name: "Carrot", category: "produce-whole", aliases: ["carrot", "carrots"] },
  {
    name: "Tomato",
    category: "produce-whole",
    aliases: ["tomato", "tomatoes", "roma tomato", "cherry tomatoes"],
  },
  {
    name: "Bell pepper",
    category: "produce-whole",
    aliases: ["bell pepper", "bell peppers", "capsicum"],
  },
  {
    name: "Cucumber",
    category: "produce-whole",
    aliases: ["cucumber", "cucumbers"],
  },
  {
    name: "Zucchini",
    category: "produce-whole",
    aliases: ["zucchini", "courgette", "courgettes"],
  },
  {
    name: "Eggplant",
    category: "produce-whole",
    aliases: ["eggplant", "aubergine"],
  },
  {
    name: "Avocado",
    category: "produce-whole",
    aliases: ["avocado", "avocados"],
  },
  {
    name: "Mushroom",
    category: "produce-whole",
    aliases: ["mushroom", "mushrooms"],
  },
  {
    name: "Celery",
    category: "produce-whole",
    aliases: ["celery", "celery stalk", "celery stalks"],
  },
  {
    name: "Corn",
    category: "produce-whole",
    aliases: ["corn", "corn on the cob", "ear of corn", "corn cob"],
  },
  { name: "Broccoli", category: "produce-whole", aliases: ["broccoli"] },
  { name: "Cauliflower", category: "produce-whole", aliases: ["cauliflower"] },
  {
    name: "Squash",
    category: "produce-whole",
    aliases: ["squash", "butternut squash", "acorn squash", "pumpkin"],
  },
  { name: "Leek", category: "produce-whole", aliases: ["leek", "leeks"] },
  {
    name: "Ginger",
    category: "produce-whole",
    aliases: ["ginger", "fresh ginger", "ginger root"],
  },

  // --- Leafy produce -----------------------------------------------------
  {
    name: "Spinach",
    category: "produce-leafy",
    aliases: ["spinach", "baby spinach"],
  },
  {
    name: "Lettuce",
    category: "produce-leafy",
    aliases: ["lettuce", "romaine", "iceberg lettuce"],
  },
  { name: "Kale", category: "produce-leafy", aliases: ["kale"] },
  {
    name: "Cabbage",
    category: "produce-leafy",
    aliases: ["cabbage", "napa cabbage", "red cabbage"],
  },
  {
    name: "Arugula",
    category: "produce-leafy",
    aliases: ["arugula", "rocket"],
  },
  {
    name: "Chard",
    category: "produce-leafy",
    aliases: ["chard", "swiss chard"],
  },
  {
    name: "Salad greens",
    category: "produce-leafy",
    aliases: ["salad greens", "mixed greens", "greens"],
  },

  // --- Fruit -------------------------------------------------------------
  { name: "Apple", category: "produce-fruit", aliases: ["apple", "apples"] },
  { name: "Banana", category: "produce-fruit", aliases: ["banana", "bananas"] },
  { name: "Lemon", category: "produce-fruit", aliases: ["lemon", "lemons"] },
  { name: "Lime", category: "produce-fruit", aliases: ["lime", "limes"] },
  { name: "Orange", category: "produce-fruit", aliases: ["orange", "oranges"] },
  {
    name: "Berries",
    category: "produce-fruit",
    aliases: [
      "berries",
      "strawberries",
      "blueberries",
      "raspberries",
      "blackberries",
    ],
  },
  { name: "Grapes", category: "produce-fruit", aliases: ["grapes"] },
  {
    name: "Mango",
    category: "produce-fruit",
    aliases: ["mango", "mangoes", "mangos"],
  },
  { name: "Pineapple", category: "produce-fruit", aliases: ["pineapple"] },
  { name: "Peach", category: "produce-fruit", aliases: ["peach", "peaches"] },
  {
    name: "Raisins",
    category: "produce-fruit",
    aliases: ["raisins", "sultanas", "dried cranberries", "currants"],
  },

  // --- Herbs -------------------------------------------------------------
  { name: "Basil", category: "herb", aliases: ["basil", "fresh basil"] },
  {
    name: "Parsley",
    category: "herb",
    aliases: ["parsley", "fresh parsley", "flat leaf parsley"],
  },
  {
    name: "Cilantro",
    category: "herb",
    aliases: ["cilantro", "coriander leaves", "fresh coriander"],
  },
  { name: "Mint", category: "herb", aliases: ["mint", "fresh mint"] },
  { name: "Thyme", category: "herb", aliases: ["thyme", "fresh thyme"] },
  {
    name: "Rosemary",
    category: "herb",
    aliases: ["rosemary", "fresh rosemary"],
  },
  { name: "Oregano", category: "herb", aliases: ["oregano", "dried oregano"] },
  { name: "Dill", category: "herb", aliases: ["dill", "fresh dill"] },
  { name: "Sage", category: "herb", aliases: ["sage", "fresh sage"] },
  { name: "Chives", category: "herb", aliases: ["chives"] },
  { name: "Bay leaf", category: "herb", aliases: ["bay leaf", "bay leaves"] },

  // --- Spices ------------------------------------------------------------
  {
    name: "Salt",
    category: "spice",
    densityGPerMl: 1.2,
    aliases: ["salt", "sea salt", "kosher salt", "table salt"],
  },
  {
    name: "Black pepper",
    category: "spice",
    aliases: ["black pepper", "pepper", "ground pepper", "peppercorns"],
  },
  {
    name: "Cinnamon",
    category: "spice",
    aliases: ["cinnamon", "ground cinnamon"],
  },
  { name: "Cumin", category: "spice", aliases: ["cumin", "ground cumin"] },
  {
    name: "Paprika",
    category: "spice",
    aliases: ["paprika", "smoked paprika"],
  },
  {
    name: "Chili powder",
    category: "spice",
    aliases: ["chili powder", "chilli powder", "cayenne", "cayenne pepper"],
  },
  {
    name: "Turmeric",
    category: "spice",
    aliases: ["turmeric", "ground turmeric"],
  },
  { name: "Nutmeg", category: "spice", aliases: ["nutmeg", "ground nutmeg"] },
  {
    name: "Ground ginger",
    category: "spice",
    aliases: ["ground ginger", "ginger powder"],
  },
  {
    name: "Curry powder",
    category: "spice",
    aliases: ["curry powder", "garam masala"],
  },
  {
    name: "Garlic powder",
    category: "spice",
    aliases: ["garlic powder", "onion powder"],
  },
  {
    name: "Vanilla",
    category: "spice",
    aliases: ["vanilla", "vanilla extract", "vanilla essence"],
  },
  { name: "Cloves", category: "spice", aliases: ["cloves", "ground cloves"] },
  {
    name: "Ground coriander",
    category: "spice",
    aliases: ["ground coriander", "coriander seed", "coriander seeds"],
  },
  {
    name: "Red pepper flakes",
    category: "spice",
    aliases: ["red pepper flakes", "crushed red pepper", "chili flakes"],
  },

  // --- Meat --------------------------------------------------------------
  {
    name: "Chicken",
    category: "meat",
    aliases: [
      "chicken",
      "chicken breast",
      "chicken thigh",
      "chicken thighs",
      "chicken breasts",
    ],
  },
  {
    name: "Beef",
    category: "meat",
    aliases: [
      "beef",
      "ground beef",
      "steak",
      "beef mince",
      "minced beef",
      "brisket",
    ],
  },
  {
    name: "Pork",
    category: "meat",
    aliases: [
      "pork",
      "pork chop",
      "pork chops",
      "ground pork",
      "pork belly",
      "pork shoulder",
    ],
  },
  {
    name: "Bacon",
    category: "meat",
    aliases: ["bacon", "bacon strips", "pancetta"],
  },
  {
    name: "Sausage",
    category: "meat",
    aliases: ["sausage", "sausages", "chorizo"],
  },
  {
    name: "Turkey",
    category: "meat",
    aliases: ["turkey", "ground turkey", "turkey breast"],
  },
  {
    name: "Lamb",
    category: "meat",
    aliases: ["lamb", "ground lamb", "lamb chops"],
  },
  { name: "Ham", category: "meat", aliases: ["ham", "prosciutto"] },

  // --- Seafood -----------------------------------------------------------
  {
    name: "Fish",
    category: "seafood",
    aliases: [
      "fish",
      "salmon",
      "tuna",
      "cod",
      "tilapia",
      "haddock",
      "fish fillet",
    ],
  },
  {
    name: "Shrimp",
    category: "seafood",
    aliases: ["shrimp", "prawns", "prawn"],
  },
  { name: "Scallops", category: "seafood", aliases: ["scallops", "scallop"] },
  {
    name: "Crab",
    category: "seafood",
    aliases: ["crab", "crab meat", "crabmeat"],
  },
  { name: "Mussels", category: "seafood", aliases: ["mussels", "clams"] },

  // --- Eggs --------------------------------------------------------------
  {
    name: "Egg",
    category: "egg",
    aliases: ["egg", "eggs", "large egg", "large eggs"],
  },
  {
    name: "Egg white",
    category: "egg",
    densityGPerMl: 1.03,
    aliases: ["egg white", "egg whites"],
  },
  {
    name: "Egg yolk",
    category: "egg",
    densityGPerMl: 1.03,
    aliases: ["egg yolk", "egg yolks", "yolk", "yolks"],
  },

  // --- Fats & oils -------------------------------------------------------
  {
    name: "Butter",
    category: "fat-oil",
    densityGPerMl: 0.96,
    aliases: ["butter", "unsalted butter", "salted butter", "margarine"],
  },
  {
    name: "Oil",
    category: "fat-oil",
    densityGPerMl: 0.92,
    aliases: [
      "oil",
      "olive oil",
      "vegetable oil",
      "canola oil",
      "sunflower oil",
      "sesame oil",
      "coconut oil",
    ],
  },
  {
    name: "Shortening",
    category: "fat-oil",
    densityGPerMl: 0.88,
    aliases: ["shortening", "lard", "ghee"],
  },

  // --- Sweeteners --------------------------------------------------------
  {
    name: "Honey",
    category: "sweetener",
    densityGPerMl: 1.42,
    aliases: ["honey"],
  },
  {
    name: "Maple syrup",
    category: "sweetener",
    densityGPerMl: 1.37,
    aliases: ["maple syrup", "syrup"],
  },
  {
    name: "Molasses",
    category: "sweetener",
    densityGPerMl: 1.4,
    aliases: ["molasses", "treacle"],
  },
  {
    name: "Corn syrup",
    category: "sweetener",
    densityGPerMl: 1.38,
    aliases: ["corn syrup", "golden syrup", "agave", "agave nectar"],
  },

  // --- Nuts & seeds ------------------------------------------------------
  {
    name: "Nuts",
    category: "nut-seed",
    densityGPerMl: 0.5,
    aliases: [
      "nuts",
      "almonds",
      "walnuts",
      "pecans",
      "cashews",
      "hazelnuts",
      "pistachios",
      "peanuts",
      "pine nuts",
    ],
  },
  {
    name: "Peanut butter",
    category: "nut-seed",
    densityGPerMl: 1.09,
    aliases: ["peanut butter", "almond butter", "nut butter", "tahini"],
  },
  {
    name: "Seeds",
    category: "nut-seed",
    densityGPerMl: 0.55,
    aliases: [
      "seeds",
      "sunflower seeds",
      "pumpkin seeds",
      "sesame seeds",
      "chia seeds",
      "flax seeds",
      "flaxseed",
    ],
  },
  {
    name: "Shredded coconut",
    category: "nut-seed",
    densityGPerMl: 0.35,
    aliases: ["shredded coconut", "desiccated coconut", "coconut flakes"],
  },

  // --- Condiments --------------------------------------------------------
  {
    name: "Soy sauce",
    category: "condiment",
    densityGPerMl: 1.15,
    aliases: ["soy sauce", "tamari"],
  },
  {
    name: "Vinegar",
    category: "condiment",
    densityGPerMl: 1.01,
    aliases: [
      "vinegar",
      "balsamic vinegar",
      "apple cider vinegar",
      "rice vinegar",
      "white vinegar",
    ],
  },
  {
    name: "Ketchup",
    category: "condiment",
    densityGPerMl: 1.1,
    aliases: ["ketchup", "catsup", "tomato ketchup"],
  },
  {
    name: "Mustard",
    category: "condiment",
    densityGPerMl: 1.05,
    aliases: ["mustard", "dijon mustard", "wholegrain mustard"],
  },
  {
    name: "Mayonnaise",
    category: "condiment",
    densityGPerMl: 0.91,
    aliases: ["mayonnaise", "mayo"],
  },
  {
    name: "Tomato paste",
    category: "condiment",
    densityGPerMl: 1.1,
    aliases: ["tomato paste", "tomato puree", "tomato sauce", "passata"],
  },
  {
    name: "Hot sauce",
    category: "condiment",
    densityGPerMl: 1.02,
    aliases: ["hot sauce", "sriracha", "tabasco"],
  },
  {
    name: "Worcestershire sauce",
    category: "condiment",
    densityGPerMl: 1.1,
    aliases: ["worcestershire sauce", "worcestershire", "fish sauce"],
  },
];

// --- Matcher -------------------------------------------------------------

/**
 * Normalize a free-text ingredient string for matching: lowercase, strip
 * accents and parentheticals, drop anything after the first comma (usually a
 * prep note), and reduce punctuation/hyphens to single spaces. Mirrors the
 * `substitutions.ts` / `units.ts` normalizers but is kept local so this module
 * stays dependency-free.
 */
export function normalizeFoodText(item: string | null | undefined): string {
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

type IndexedFood = { item: FoodItem; aliasTokens: string[][] };

const FOOD_INDEX: IndexedFood[] = FOOD_ITEMS.map((item) => ({
  item,
  aliasTokens: item.aliases.map((alias) => tokenize(normalizeFoodText(alias))),
}));

/**
 * Match a recipe ingredient's `item` string to a food record, or `null` when
 * nothing sensible matches. Prefers the most specific alias (the one with the
 * most words, tie-broken by character length), so "brown sugar" beats "sugar"
 * and "sweet potato" beats "potato". Whole-word matching keeps "buttermilk"
 * from matching a bare "milk" alias only when that alias isn't itself present.
 */
export function matchFood(item: string | null | undefined): FoodItem | null {
  const tokens = tokenize(normalizeFoodText(item));
  if (tokens.length === 0) return null;

  let best: { item: FoodItem; score: number } | null = null;
  for (const { item: food, aliasTokens } of FOOD_INDEX) {
    for (const phrase of aliasTokens) {
      if (!containsPhrase(tokens, phrase)) continue;
      const score = phrase.length * 100 + phrase.join(" ").length;
      if (!best || score > best.score) best = { item: food, score };
    }
  }
  return best ? best.item : null;
}

/** The food category for a free-text ingredient, or `null` when unknown. */
export function foodCategoryForItem(
  item: string | null | undefined,
): FoodCategory | null {
  return matchFood(item)?.category ?? null;
}

/**
 * Resolve an ingredient's density (grams per millilitre) from its `item` text,
 * or `null` when the matched food has no known density (or nothing matches).
 */
export function densityForFood(item: string | null | undefined): number | null {
  return matchFood(item)?.densityGPerMl ?? null;
}

// --- Canonical identity --------------------------------------------------

/**
 * Small, fast, deterministic string hash (two FNV-1a-style accumulators mixed
 * together for a wider, lower-collision digest), rendered base36. Used to derive
 * stable, compact graph ids that fit the `varchar(24)` id columns regardless of
 * how long the food name is. Pure and dependency-free.
 */
export function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

/**
 * Slugify a food name into a stable, unique, URL-safe key: normalize (lowercase,
 * strip accents/punctuation/parentheticals), then hyphenate. Bounded to the
 * `food_items.slug` column width (80). This is the single source of truth for a
 * food's slug — the seed and the corpus miner both derive ids from it so mined
 * stats attach to the same node the seed created.
 */
export function foodSlug(name: string): string {
  return normalizeFoodText(name).replace(/\s+/g, "-").slice(0, 80);
}

/**
 * The canonical `food_items.id` for a food name — a compact, deterministic hash
 * of its slug (`food_<hash>`) that always fits the `varchar(24)` id column. The
 * seed and the miner both call this, so mined stats key onto the seeded node.
 */
export function foodNodeId(name: string): string {
  return `food_${stableHash(foodSlug(name))}`;
}

/** A resolved canonical food identity: enough to key graph rows onto a node. */
export type CanonicalFood = {
  /** The `food_items.id` this text resolves to. */
  id: string;
  /** The food's stable slug. */
  slug: string;
  /** The canonical display name. */
  name: string;
  /** The food category. */
  category: FoodCategory;
};

/**
 * Resolve a free-text ingredient to its canonical food-node identity, or `null`
 * when nothing matches. The canonicalization seam the corpus miner and any
 * server-side food feature share, so every surface keys onto the *same* node.
 */
export function canonicalFood(
  item: string | null | undefined,
): CanonicalFood | null {
  const food = matchFood(item);
  if (!food) return null;
  return {
    id: foodNodeId(food.name),
    slug: foodSlug(food.name),
    name: food.name,
    category: food.category,
  };
}
