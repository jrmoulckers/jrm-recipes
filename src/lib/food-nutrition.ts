/**
 * Authoritative, static nutrition facts for the curated food knowledge base
 * (`docs/food-graph.md` §8, ADR-4). Unlike the crowd-sourced graph, nutrition is
 * **not** mined from user recipes: it is per canonical food, per 100 g, sourced
 * from the public-domain USDA FoodData Central "Foundation" / "SR Legacy"
 * datasets (`sourceRef` carries the FDC id). Coverage matters more than
 * three-decimal precision. These values let the app estimate a recipe's
 * per-serving nutrition and roll a meal plan up into a weekly total.
 *
 * Like `food-db.ts` and `food-units.ts`, this module is pure and
 * dependency-free (no `units.ts`, no `db`, no `server-only`), so it stays
 * client-safe, offline, and trivially unit-testable, and can never become a
 * merge hotspot with the units-conversion library. The `food_nutrition` Drizzle
 * table mirrors this dataset and is seeded from it. Server features may read the
 * table, but this module is the single source of truth.
 */
import { canonicalFood, densityForFood, foodSlug } from './food-db';
import type { Nutrition } from './nutrition';

/**
 * Nutrition per 100 g of the edible portion of a food. Macros are always
 * present. The finer breakdowns (`fiberG`, `sugarG`, `sodiumMg`) are optional
 * because coverage is uneven in the source data. Treat a missing value as
 * "unknown", not zero.
 */
export type NutritionFacts = {
  /** Energy in kilocalories per 100 g. */
  kcal: number;
  /** Protein in grams per 100 g. */
  proteinG: number;
  /** Total carbohydrate in grams per 100 g. */
  carbsG: number;
  /** Total fat in grams per 100 g. */
  fatG: number;
  /** Dietary fibre in grams per 100 g, when known. */
  fiberG?: number;
  /** Total sugars in grams per 100 g, when known. */
  sugarG?: number;
  /** Sodium in milligrams per 100 g, when known. */
  sodiumMg?: number;
  /** Provenance. The USDA FDC id (or other authoritative reference). */
  sourceRef: string;
};

/** A curated nutrition entry: a food name (must match a `food-db` name) + facts. */
type NutritionSeed = { name: string } & NutritionFacts;

/**
 * The curated nutrition table. Values are per 100 g from USDA FoodData Central
 * (public domain). `sourceRef` is the FDC id of the generic Foundation/SR Legacy
 * item. Names must correspond to a canonical food in `food-db.ts` so the two key
 * onto the same node via {@link foodSlug}. Ordered loosely by category for
 * readability. Lookup is by slug and order-independent.
 */
const NUTRITION_SEEDS: NutritionSeed[] = [
  // --- Liquids -----------------------------------------------------------
  {
    name: 'Water',
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    sodiumMg: 0,
    sourceRef: 'FDC:174986',
  },
  {
    name: 'Juice',
    kcal: 46,
    proteinG: 0.7,
    carbsG: 11,
    fatG: 0.2,
    sugarG: 8.4,
    sodiumMg: 1,
    sourceRef: 'FDC:169098',
  },
  {
    name: 'Coconut milk',
    kcal: 230,
    proteinG: 2.3,
    carbsG: 5.5,
    fatG: 24,
    sugarG: 3.3,
    sodiumMg: 15,
    sourceRef: 'FDC:170173',
  },
  // --- Dairy -------------------------------------------------------------
  {
    name: 'Milk',
    kcal: 61,
    proteinG: 3.2,
    carbsG: 4.8,
    fatG: 3.3,
    sugarG: 5.1,
    sodiumMg: 43,
    sourceRef: 'FDC:746782',
  },
  {
    name: 'Plant milk',
    kcal: 39,
    proteinG: 1.1,
    carbsG: 3.3,
    fatG: 2.5,
    sugarG: 2.7,
    sodiumMg: 48,
    sourceRef: 'FDC:174832',
  },
  {
    name: 'Cream',
    kcal: 340,
    proteinG: 2.8,
    carbsG: 2.8,
    fatG: 36,
    sugarG: 2.9,
    sodiumMg: 27,
    sourceRef: 'FDC:170859',
  },
  {
    name: 'Yogurt',
    kcal: 61,
    proteinG: 3.5,
    carbsG: 4.7,
    fatG: 3.3,
    sugarG: 4.7,
    sodiumMg: 46,
    sourceRef: 'FDC:171284',
  },
  {
    name: 'Cheese',
    kcal: 402,
    proteinG: 25,
    carbsG: 1.3,
    fatG: 33,
    sugarG: 0.5,
    sodiumMg: 621,
    sourceRef: 'FDC:328637',
  },
  {
    name: 'Butter',
    kcal: 717,
    proteinG: 0.9,
    carbsG: 0.1,
    fatG: 81,
    sugarG: 0.1,
    sodiumMg: 11,
    sourceRef: 'FDC:173410',
  },
  // --- Baking / dry staples ---------------------------------------------
  {
    name: 'Flour',
    kcal: 364,
    proteinG: 10,
    carbsG: 76,
    fatG: 1,
    fiberG: 2.7,
    sugarG: 0.3,
    sodiumMg: 2,
    sourceRef: 'FDC:169761',
  },
  {
    name: 'Whole wheat flour',
    kcal: 340,
    proteinG: 13,
    carbsG: 72,
    fatG: 2.5,
    fiberG: 11,
    sugarG: 0.4,
    sodiumMg: 2,
    sourceRef: 'FDC:168944',
  },
  {
    name: 'Almond flour',
    kcal: 571,
    proteinG: 21,
    carbsG: 21,
    fatG: 50,
    fiberG: 11,
    sugarG: 4,
    sodiumMg: 1,
    sourceRef: 'FDC:169805',
  },
  {
    name: 'Sugar',
    kcal: 387,
    proteinG: 0,
    carbsG: 100,
    fatG: 0,
    sugarG: 100,
    sodiumMg: 1,
    sourceRef: 'FDC:169655',
  },
  {
    name: 'Brown sugar',
    kcal: 380,
    proteinG: 0.1,
    carbsG: 98,
    fatG: 0,
    sugarG: 97,
    sodiumMg: 28,
    sourceRef: 'FDC:168833',
  },
  {
    name: 'Powdered sugar',
    kcal: 389,
    proteinG: 0,
    carbsG: 100,
    fatG: 0,
    sugarG: 98,
    sodiumMg: 2,
    sourceRef: 'FDC:169656',
  },
  {
    name: 'Cocoa powder',
    kcal: 228,
    proteinG: 20,
    carbsG: 58,
    fatG: 14,
    fiberG: 33,
    sugarG: 1.8,
    sodiumMg: 21,
    sourceRef: 'FDC:169593',
  },
  {
    name: 'Cornstarch',
    kcal: 381,
    proteinG: 0.3,
    carbsG: 91,
    fatG: 0.1,
    fiberG: 0.9,
    sodiumMg: 9,
    sourceRef: 'FDC:169698',
  },
  {
    name: 'Chocolate chips',
    kcal: 479,
    proteinG: 4.2,
    carbsG: 63,
    fatG: 30,
    fiberG: 5.9,
    sugarG: 54,
    sodiumMg: 11,
    sourceRef: 'FDC:167587',
  },
  {
    name: 'Breadcrumbs',
    kcal: 395,
    proteinG: 14,
    carbsG: 72,
    fatG: 5.3,
    fiberG: 4.5,
    sugarG: 6.2,
    sodiumMg: 732,
    sourceRef: 'FDC:174987',
  },
  // --- Grains / legumes (cooked where a cook measures cooked) ------------
  {
    name: 'Rice',
    kcal: 130,
    proteinG: 2.7,
    carbsG: 28,
    fatG: 0.3,
    fiberG: 0.4,
    sodiumMg: 1,
    sourceRef: 'FDC:169756',
  },
  {
    name: 'Pasta',
    kcal: 158,
    proteinG: 5.8,
    carbsG: 31,
    fatG: 0.9,
    fiberG: 1.8,
    sugarG: 0.6,
    sodiumMg: 1,
    sourceRef: 'FDC:168927',
  },
  {
    name: 'Oats',
    kcal: 389,
    proteinG: 17,
    carbsG: 66,
    fatG: 6.9,
    fiberG: 11,
    sugarG: 0,
    sodiumMg: 2,
    sourceRef: 'FDC:169705',
  },
  {
    name: 'Quinoa',
    kcal: 120,
    proteinG: 4.4,
    carbsG: 21,
    fatG: 1.9,
    fiberG: 2.8,
    sodiumMg: 7,
    sourceRef: 'FDC:168917',
  },
  {
    name: 'Beans',
    kcal: 127,
    proteinG: 8.7,
    carbsG: 23,
    fatG: 0.5,
    fiberG: 6.4,
    sugarG: 0.3,
    sodiumMg: 1,
    sourceRef: 'FDC:175189',
  },
  {
    name: 'Chickpeas',
    kcal: 164,
    proteinG: 8.9,
    carbsG: 27,
    fatG: 2.6,
    fiberG: 7.6,
    sugarG: 4.8,
    sodiumMg: 7,
    sourceRef: 'FDC:173757',
  },
  {
    name: 'Lentils',
    kcal: 116,
    proteinG: 9,
    carbsG: 20,
    fatG: 0.4,
    fiberG: 7.9,
    sugarG: 1.8,
    sodiumMg: 2,
    sourceRef: 'FDC:172421',
  },
  {
    name: 'Peas',
    kcal: 81,
    proteinG: 5.4,
    carbsG: 14,
    fatG: 0.4,
    fiberG: 5.7,
    sugarG: 5.7,
    sodiumMg: 5,
    sourceRef: 'FDC:170419',
  },
  // --- Produce (raw) -----------------------------------------------------
  {
    name: 'Onion',
    kcal: 40,
    proteinG: 1.1,
    carbsG: 9.3,
    fatG: 0.1,
    fiberG: 1.7,
    sugarG: 4.2,
    sodiumMg: 4,
    sourceRef: 'FDC:170000',
  },
  {
    name: 'Garlic',
    kcal: 149,
    proteinG: 6.4,
    carbsG: 33,
    fatG: 0.5,
    fiberG: 2.1,
    sugarG: 1,
    sodiumMg: 17,
    sourceRef: 'FDC:169230',
  },
  {
    name: 'Shallot',
    kcal: 72,
    proteinG: 2.5,
    carbsG: 17,
    fatG: 0.1,
    fiberG: 3.2,
    sugarG: 7.9,
    sodiumMg: 12,
    sourceRef: 'FDC:170499',
  },
  {
    name: 'Potato',
    kcal: 77,
    proteinG: 2,
    carbsG: 17,
    fatG: 0.1,
    fiberG: 2.2,
    sugarG: 0.8,
    sodiumMg: 6,
    sourceRef: 'FDC:170026',
  },
  {
    name: 'Sweet potato',
    kcal: 86,
    proteinG: 1.6,
    carbsG: 20,
    fatG: 0.1,
    fiberG: 3,
    sugarG: 4.2,
    sodiumMg: 55,
    sourceRef: 'FDC:168482',
  },
  {
    name: 'Carrot',
    kcal: 41,
    proteinG: 0.9,
    carbsG: 10,
    fatG: 0.2,
    fiberG: 2.8,
    sugarG: 4.7,
    sodiumMg: 69,
    sourceRef: 'FDC:170393',
  },
  {
    name: 'Tomato',
    kcal: 18,
    proteinG: 0.9,
    carbsG: 3.9,
    fatG: 0.2,
    fiberG: 1.2,
    sugarG: 2.6,
    sodiumMg: 5,
    sourceRef: 'FDC:170457',
  },
  {
    name: 'Bell pepper',
    kcal: 31,
    proteinG: 1,
    carbsG: 6,
    fatG: 0.3,
    fiberG: 2.1,
    sugarG: 4.2,
    sodiumMg: 4,
    sourceRef: 'FDC:170108',
  },
  {
    name: 'Cucumber',
    kcal: 15,
    proteinG: 0.7,
    carbsG: 3.6,
    fatG: 0.1,
    fiberG: 0.5,
    sugarG: 1.7,
    sodiumMg: 2,
    sourceRef: 'FDC:168409',
  },
  {
    name: 'Zucchini',
    kcal: 17,
    proteinG: 1.2,
    carbsG: 3.1,
    fatG: 0.3,
    fiberG: 1,
    sugarG: 2.5,
    sodiumMg: 8,
    sourceRef: 'FDC:169291',
  },
  {
    name: 'Eggplant',
    kcal: 25,
    proteinG: 1,
    carbsG: 6,
    fatG: 0.2,
    fiberG: 3,
    sugarG: 3.5,
    sodiumMg: 2,
    sourceRef: 'FDC:169228',
  },
  {
    name: 'Avocado',
    kcal: 160,
    proteinG: 2,
    carbsG: 9,
    fatG: 15,
    fiberG: 6.7,
    sugarG: 0.7,
    sodiumMg: 7,
    sourceRef: 'FDC:171705',
  },
  {
    name: 'Mushroom',
    kcal: 22,
    proteinG: 3.1,
    carbsG: 3.3,
    fatG: 0.3,
    fiberG: 1,
    sugarG: 2,
    sodiumMg: 5,
    sourceRef: 'FDC:169251',
  },
  {
    name: 'Celery',
    kcal: 16,
    proteinG: 0.7,
    carbsG: 3,
    fatG: 0.2,
    fiberG: 1.6,
    sugarG: 1.3,
    sodiumMg: 80,
    sourceRef: 'FDC:169988',
  },
  {
    name: 'Corn',
    kcal: 86,
    proteinG: 3.2,
    carbsG: 19,
    fatG: 1.2,
    fiberG: 2.7,
    sugarG: 3.2,
    sodiumMg: 15,
    sourceRef: 'FDC:169998',
  },
  {
    name: 'Broccoli',
    kcal: 34,
    proteinG: 2.8,
    carbsG: 6.6,
    fatG: 0.4,
    fiberG: 2.6,
    sugarG: 1.7,
    sodiumMg: 33,
    sourceRef: 'FDC:170379',
  },
  {
    name: 'Cauliflower',
    kcal: 25,
    proteinG: 1.9,
    carbsG: 5,
    fatG: 0.3,
    fiberG: 2,
    sugarG: 1.9,
    sodiumMg: 30,
    sourceRef: 'FDC:169986',
  },
  {
    name: 'Leek',
    kcal: 61,
    proteinG: 1.5,
    carbsG: 14,
    fatG: 0.3,
    fiberG: 1.8,
    sugarG: 3.9,
    sodiumMg: 20,
    sourceRef: 'FDC:169246',
  },
  {
    name: 'Ginger',
    kcal: 80,
    proteinG: 1.8,
    carbsG: 18,
    fatG: 0.8,
    fiberG: 2,
    sugarG: 1.7,
    sodiumMg: 13,
    sourceRef: 'FDC:169231',
  },
  {
    name: 'Spinach',
    kcal: 23,
    proteinG: 2.9,
    carbsG: 3.6,
    fatG: 0.4,
    fiberG: 2.2,
    sugarG: 0.4,
    sodiumMg: 79,
    sourceRef: 'FDC:168462',
  },
  {
    name: 'Lettuce',
    kcal: 15,
    proteinG: 1.4,
    carbsG: 2.9,
    fatG: 0.2,
    fiberG: 1.3,
    sugarG: 0.8,
    sodiumMg: 28,
    sourceRef: 'FDC:169247',
  },
  {
    name: 'Kale',
    kcal: 49,
    proteinG: 4.3,
    carbsG: 9,
    fatG: 0.9,
    fiberG: 3.6,
    sugarG: 2.3,
    sodiumMg: 38,
    sourceRef: 'FDC:168421',
  },
  {
    name: 'Cabbage',
    kcal: 25,
    proteinG: 1.3,
    carbsG: 5.8,
    fatG: 0.1,
    fiberG: 2.5,
    sugarG: 3.2,
    sodiumMg: 18,
    sourceRef: 'FDC:169975',
  },
  // --- Fruit -------------------------------------------------------------
  {
    name: 'Apple',
    kcal: 52,
    proteinG: 0.3,
    carbsG: 14,
    fatG: 0.2,
    fiberG: 2.4,
    sugarG: 10,
    sodiumMg: 1,
    sourceRef: 'FDC:171688',
  },
  {
    name: 'Banana',
    kcal: 89,
    proteinG: 1.1,
    carbsG: 23,
    fatG: 0.3,
    fiberG: 2.6,
    sugarG: 12,
    sodiumMg: 1,
    sourceRef: 'FDC:173944',
  },
  {
    name: 'Lemon',
    kcal: 29,
    proteinG: 1.1,
    carbsG: 9.3,
    fatG: 0.3,
    fiberG: 2.8,
    sugarG: 2.5,
    sodiumMg: 2,
    sourceRef: 'FDC:167746',
  },
  {
    name: 'Lime',
    kcal: 30,
    proteinG: 0.7,
    carbsG: 11,
    fatG: 0.2,
    fiberG: 2.8,
    sugarG: 1.7,
    sodiumMg: 2,
    sourceRef: 'FDC:168155',
  },
  {
    name: 'Orange',
    kcal: 47,
    proteinG: 0.9,
    carbsG: 12,
    fatG: 0.1,
    fiberG: 2.4,
    sugarG: 9.4,
    sodiumMg: 0,
    sourceRef: 'FDC:169097',
  },
  {
    name: 'Berries',
    kcal: 57,
    proteinG: 0.7,
    carbsG: 14,
    fatG: 0.3,
    fiberG: 2.4,
    sugarG: 10,
    sodiumMg: 1,
    sourceRef: 'FDC:171711',
  },
  {
    name: 'Grapes',
    kcal: 69,
    proteinG: 0.7,
    carbsG: 18,
    fatG: 0.2,
    fiberG: 0.9,
    sugarG: 15,
    sodiumMg: 2,
    sourceRef: 'FDC:174683',
  },
  {
    name: 'Mango',
    kcal: 60,
    proteinG: 0.8,
    carbsG: 15,
    fatG: 0.4,
    fiberG: 1.6,
    sugarG: 14,
    sodiumMg: 1,
    sourceRef: 'FDC:169910',
  },
  {
    name: 'Pineapple',
    kcal: 50,
    proteinG: 0.5,
    carbsG: 13,
    fatG: 0.1,
    fiberG: 1.4,
    sugarG: 9.9,
    sodiumMg: 1,
    sourceRef: 'FDC:169124',
  },
  {
    name: 'Peach',
    kcal: 39,
    proteinG: 0.9,
    carbsG: 10,
    fatG: 0.3,
    fiberG: 1.5,
    sugarG: 8.4,
    sodiumMg: 0,
    sourceRef: 'FDC:169928',
  },
  {
    name: 'Raisins',
    kcal: 299,
    proteinG: 3.1,
    carbsG: 79,
    fatG: 0.5,
    fiberG: 3.7,
    sugarG: 59,
    sodiumMg: 11,
    sourceRef: 'FDC:168165',
  },
  // --- Herbs / spices ----------------------------------------------------
  {
    name: 'Basil',
    kcal: 23,
    proteinG: 3.2,
    carbsG: 2.7,
    fatG: 0.6,
    fiberG: 1.6,
    sugarG: 0.3,
    sodiumMg: 4,
    sourceRef: 'FDC:172232',
  },
  {
    name: 'Parsley',
    kcal: 36,
    proteinG: 3,
    carbsG: 6.3,
    fatG: 0.8,
    fiberG: 3.3,
    sugarG: 0.9,
    sodiumMg: 56,
    sourceRef: 'FDC:170416',
  },
  {
    name: 'Cilantro',
    kcal: 23,
    proteinG: 2.1,
    carbsG: 3.7,
    fatG: 0.5,
    fiberG: 2.8,
    sugarG: 0.9,
    sodiumMg: 46,
    sourceRef: 'FDC:169997',
  },
  {
    name: 'Salt',
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    sodiumMg: 38758,
    sourceRef: 'FDC:173468',
  },
  {
    name: 'Black pepper',
    kcal: 251,
    proteinG: 10,
    carbsG: 64,
    fatG: 3.3,
    fiberG: 25,
    sugarG: 0.6,
    sodiumMg: 20,
    sourceRef: 'FDC:170931',
  },
  {
    name: 'Cinnamon',
    kcal: 247,
    proteinG: 4,
    carbsG: 81,
    fatG: 1.2,
    fiberG: 53,
    sugarG: 2.2,
    sodiumMg: 10,
    sourceRef: 'FDC:171320',
  },
  {
    name: 'Cumin',
    kcal: 375,
    proteinG: 18,
    carbsG: 44,
    fatG: 22,
    fiberG: 11,
    sugarG: 2.3,
    sodiumMg: 168,
    sourceRef: 'FDC:170923',
  },
  {
    name: 'Paprika',
    kcal: 282,
    proteinG: 14,
    carbsG: 54,
    fatG: 13,
    fiberG: 35,
    sugarG: 10,
    sodiumMg: 68,
    sourceRef: 'FDC:170934',
  },
  {
    name: 'Turmeric',
    kcal: 312,
    proteinG: 9.7,
    carbsG: 67,
    fatG: 3.2,
    fiberG: 22,
    sugarG: 3.2,
    sodiumMg: 27,
    sourceRef: 'FDC:172231',
  },
  // --- Meat / seafood / egg ---------------------------------------------
  {
    name: 'Chicken',
    kcal: 165,
    proteinG: 31,
    carbsG: 0,
    fatG: 3.6,
    sodiumMg: 74,
    sourceRef: 'FDC:171077',
  },
  {
    name: 'Beef',
    kcal: 250,
    proteinG: 26,
    carbsG: 0,
    fatG: 15,
    sodiumMg: 72,
    sourceRef: 'FDC:174032',
  },
  {
    name: 'Pork',
    kcal: 242,
    proteinG: 27,
    carbsG: 0,
    fatG: 14,
    sodiumMg: 62,
    sourceRef: 'FDC:167903',
  },
  {
    name: 'Bacon',
    kcal: 541,
    proteinG: 37,
    carbsG: 1.4,
    fatG: 42,
    sodiumMg: 1717,
    sourceRef: 'FDC:168277',
  },
  {
    name: 'Sausage',
    kcal: 301,
    proteinG: 12,
    carbsG: 3.3,
    fatG: 27,
    sodiumMg: 740,
    sourceRef: 'FDC:174589',
  },
  {
    name: 'Turkey',
    kcal: 189,
    proteinG: 29,
    carbsG: 0,
    fatG: 7.4,
    sodiumMg: 103,
    sourceRef: 'FDC:171506',
  },
  {
    name: 'Lamb',
    kcal: 294,
    proteinG: 25,
    carbsG: 0,
    fatG: 21,
    sodiumMg: 72,
    sourceRef: 'FDC:172602',
  },
  {
    name: 'Ham',
    kcal: 145,
    proteinG: 21,
    carbsG: 1.5,
    fatG: 5.5,
    sodiumMg: 1203,
    sourceRef: 'FDC:167812',
  },
  {
    name: 'Fish',
    kcal: 206,
    proteinG: 22,
    carbsG: 0,
    fatG: 12,
    sodiumMg: 61,
    sourceRef: 'FDC:175168',
  },
  {
    name: 'Shrimp',
    kcal: 99,
    proteinG: 24,
    carbsG: 0.2,
    fatG: 0.3,
    sodiumMg: 111,
    sourceRef: 'FDC:175180',
  },
  {
    name: 'Crab',
    kcal: 97,
    proteinG: 19,
    carbsG: 0,
    fatG: 1.5,
    sodiumMg: 711,
    sourceRef: 'FDC:171977',
  },
  {
    name: 'Egg',
    kcal: 143,
    proteinG: 13,
    carbsG: 0.7,
    fatG: 9.5,
    sugarG: 0.4,
    sodiumMg: 142,
    sourceRef: 'FDC:748967',
  },
  {
    name: 'Egg white',
    kcal: 52,
    proteinG: 11,
    carbsG: 0.7,
    fatG: 0.2,
    sugarG: 0.7,
    sodiumMg: 166,
    sourceRef: 'FDC:747997',
  },
  {
    name: 'Egg yolk',
    kcal: 322,
    proteinG: 16,
    carbsG: 3.6,
    fatG: 27,
    sugarG: 0.6,
    sodiumMg: 48,
    sourceRef: 'FDC:748095',
  },
  // --- Fats / oils / sweeteners -----------------------------------------
  {
    name: 'Oil',
    kcal: 884,
    proteinG: 0,
    carbsG: 0,
    fatG: 100,
    sodiumMg: 0,
    sourceRef: 'FDC:171413',
  },
  {
    name: 'Shortening',
    kcal: 884,
    proteinG: 0,
    carbsG: 0,
    fatG: 100,
    sodiumMg: 0,
    sourceRef: 'FDC:171025',
  },
  {
    name: 'Honey',
    kcal: 304,
    proteinG: 0.3,
    carbsG: 82,
    fatG: 0,
    sugarG: 82,
    sodiumMg: 4,
    sourceRef: 'FDC:169640',
  },
  {
    name: 'Maple syrup',
    kcal: 260,
    proteinG: 0,
    carbsG: 67,
    fatG: 0.1,
    sugarG: 60,
    sodiumMg: 12,
    sourceRef: 'FDC:169661',
  },
  {
    name: 'Molasses',
    kcal: 290,
    proteinG: 0,
    carbsG: 75,
    fatG: 0.1,
    sugarG: 55,
    sodiumMg: 37,
    sourceRef: 'FDC:169652',
  },
  {
    name: 'Corn syrup',
    kcal: 283,
    proteinG: 0,
    carbsG: 77,
    fatG: 0.2,
    sugarG: 31,
    sodiumMg: 155,
    sourceRef: 'FDC:169660',
  },
  // --- Nuts / seeds ------------------------------------------------------
  {
    name: 'Nuts',
    kcal: 607,
    proteinG: 20,
    carbsG: 21,
    fatG: 54,
    fiberG: 12,
    sugarG: 4.4,
    sodiumMg: 1,
    sourceRef: 'FDC:170567',
  },
  {
    name: 'Peanut butter',
    kcal: 588,
    proteinG: 25,
    carbsG: 20,
    fatG: 50,
    fiberG: 6,
    sugarG: 9.2,
    sodiumMg: 459,
    sourceRef: 'FDC:172470',
  },
  {
    name: 'Seeds',
    kcal: 559,
    proteinG: 21,
    carbsG: 20,
    fatG: 49,
    fiberG: 8.6,
    sugarG: 2.6,
    sodiumMg: 9,
    sourceRef: 'FDC:170555',
  },
  {
    name: 'Shredded coconut',
    kcal: 660,
    proteinG: 6.9,
    carbsG: 24,
    fatG: 65,
    fiberG: 16,
    sugarG: 7.4,
    sodiumMg: 37,
    sourceRef: 'FDC:170170',
  },
  // --- Condiments --------------------------------------------------------
  {
    name: 'Soy sauce',
    kcal: 53,
    proteinG: 8.1,
    carbsG: 4.9,
    fatG: 0.6,
    fiberG: 0.8,
    sugarG: 0.4,
    sodiumMg: 5493,
    sourceRef: 'FDC:174278',
  },
  {
    name: 'Vinegar',
    kcal: 18,
    proteinG: 0,
    carbsG: 0.04,
    fatG: 0,
    sugarG: 0.04,
    sodiumMg: 2,
    sourceRef: 'FDC:173469',
  },
  {
    name: 'Ketchup',
    kcal: 101,
    proteinG: 1.7,
    carbsG: 27,
    fatG: 0.1,
    fiberG: 0.3,
    sugarG: 22,
    sodiumMg: 907,
    sourceRef: 'FDC:168556',
  },
  {
    name: 'Mustard',
    kcal: 66,
    proteinG: 4.4,
    carbsG: 5.8,
    fatG: 4,
    fiberG: 4,
    sugarG: 2.9,
    sodiumMg: 1104,
    sourceRef: 'FDC:168577',
  },
  {
    name: 'Mayonnaise',
    kcal: 680,
    proteinG: 1,
    carbsG: 0.6,
    fatG: 75,
    sugarG: 0.6,
    sodiumMg: 635,
    sourceRef: 'FDC:167736',
  },
  {
    name: 'Tomato paste',
    kcal: 82,
    proteinG: 4.3,
    carbsG: 19,
    fatG: 0.5,
    fiberG: 4.1,
    sugarG: 12,
    sodiumMg: 59,
    sourceRef: 'FDC:170459',
  },
  {
    name: 'Hot sauce',
    kcal: 11,
    proteinG: 0.5,
    carbsG: 1.8,
    fatG: 0.4,
    fiberG: 0.3,
    sugarG: 1.1,
    sodiumMg: 2643,
    sourceRef: 'FDC:171186',
  },
];

/**
 * Nutrition facts keyed by canonical food slug. Built once at module load from
 * {@link NUTRITION_SEEDS}. The slug is derived with {@link foodSlug} so this map
 * and `food-db.ts` / `food_items` all agree on the key.
 */
export const NUTRITION_BY_SLUG: ReadonlyMap<string, NutritionFacts> = new Map(
  NUTRITION_SEEDS.map((s) => {
    const { name: _name, ...facts } = s;
    return [foodSlug(s.name), facts];
  }),
);

/**
 * Look up authoritative per-100 g nutrition for a free-text ingredient, or
 * `null` when the food doesn't resolve or has no curated facts. Resolution
 * reuses `food-db`'s canonicalizer, so any phrasing that maps to a known food
 * (e.g. "1 large yellow onion, diced") finds the parent food's facts.
 */
export function nutritionForFood(item: string | null | undefined): NutritionFacts | null {
  const food = canonicalFood(item);
  if (!food) return null;
  return NUTRITION_BY_SLUG.get(food.slug) ?? null;
}

// --- Unit → grams conversion (local, deliberately not imported from units.ts) --

/** Absolute grams per one of each supported mass unit. */
const MASS_GRAMS: Readonly<Record<string, number>> = {
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
};

/** Millilitres per one of each supported volume unit. */
const VOLUME_ML: Readonly<Record<string, number>> = {
  ml: 1,
  l: 1000,
  tsp: 4.92892159375,
  tbsp: 14.78676478125,
  'fl oz': 29.5735295625,
  cup: 236.5882365,
  pint: 473.176473,
  quart: 946.352946,
  gallon: 3785.411784,
};

/** Tolerant aliases → canonical unit token (mirrors common `units.ts` spellings). */
const UNIT_ALIASES: Readonly<Record<string, string>> = {
  gram: 'g',
  grams: 'g',
  gs: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  ounce: 'oz',
  ounces: 'oz',
  pound: 'lb',
  pounds: 'lb',
  lbs: 'lb',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  litre: 'l',
  liter: 'l',
  liters: 'l',
  litres: 'l',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  'fluid ounce': 'fl oz',
  'fluid ounces': 'fl oz',
  floz: 'fl oz',
  cups: 'cup',
  pints: 'pint',
  quarts: 'quart',
  gallons: 'gallon',
};

function canonicalUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  return UNIT_ALIASES[u] ?? u;
}

/**
 * Convert a `quantity` of `unit` into grams. Mass units convert directly. Volume
 * units need a `densityGPerMl` (grams per mL) and return `null` without one.
 * count/unknown units (each, pinch, clove, …) return `null` because their weight
 * isn't knowable from the token alone. A non-finite/negative quantity is `null`.
 */
export function toGrams(
  quantity: number,
  unit: string | null | undefined,
  densityGPerMl?: number | null,
): number | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  const u = canonicalUnit(unit ?? '');
  const mass = MASS_GRAMS[u];
  if (mass !== undefined) return quantity * mass;
  const ml = VOLUME_ML[u];
  if (ml !== undefined) {
    if (densityGPerMl == null || !Number.isFinite(densityGPerMl)) return null;
    return quantity * ml * densityGPerMl;
  }
  return null;
}

/**
 * Estimate the grams of a single ingredient line from its free-text `item`,
 * `quantity`, and `unit`, resolving density from `food-db`. Returns `null` when
 * the amount can't be weighed (unknown/count unit with no density). This is the
 * bridge between a recipe's human units and per-100 g nutrition.
 */
export function estimateIngredientGrams(
  item: string | null | undefined,
  quantity: number | null | undefined,
  unit: string | null | undefined,
): number | null {
  if (quantity == null) return null;
  return toGrams(quantity, unit, densityForFood(item));
}

/** One ingredient line for a nutrition roll-up. */
export type NutritionIngredient = {
  item: string | null | undefined;
  quantity?: number | null;
  unit?: string | null;
};

/**
 * A recipe/meal-plan nutrition roll-up. Absolute totals across every ingredient
 * that could be resolved *and* weighed, plus a `coverage` fraction (0–1) so
 * callers can flag "estimated from 6 of 9 ingredients". `sourced`/`total` give
 * the raw counts behind that fraction.
 */
export type NutritionRollup = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  /** Ingredients that contributed to the totals. */
  sourced: number;
  /** Ingredients considered (non-empty `item`). */
  total: number;
  /** `sourced / total`, or 0 when there were no ingredients. */
  coverage: number;
};

/**
 * Roll a list of ingredient lines up into total nutrition. An ingredient
 * contributes only when it both resolves to curated facts *and* can be converted
 * to grams. Everything else is skipped but still counted toward `total`, so
 * `coverage` honestly reflects how complete the estimate is. Pure and
 * order-independent.
 */
export function estimateRecipeNutrition(
  ingredients: readonly NutritionIngredient[],
): NutritionRollup {
  const acc: NutritionRollup = {
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    sugarG: 0,
    sodiumMg: 0,
    sourced: 0,
    total: 0,
    coverage: 0,
  };
  for (const ing of ingredients) {
    if (!ing.item?.trim()) continue;
    acc.total += 1;
    const facts = nutritionForFood(ing.item);
    if (!facts) continue;
    const grams = estimateIngredientGrams(ing.item, ing.quantity, ing.unit);
    if (grams == null) continue;
    const factor = grams / 100;
    acc.kcal += facts.kcal * factor;
    acc.proteinG += facts.proteinG * factor;
    acc.carbsG += facts.carbsG * factor;
    acc.fatG += facts.fatG * factor;
    acc.fiberG += (facts.fiberG ?? 0) * factor;
    acc.sugarG += (facts.sugarG ?? 0) * factor;
    acc.sodiumMg += (facts.sodiumMg ?? 0) * factor;
    acc.sourced += 1;
  }
  acc.coverage = acc.total === 0 ? 0 : acc.sourced / acc.total;
  return acc;
}

/**
 * An estimated per-serving nutrition record derived from a recipe's ingredient
 * list, in the app's `Nutrition` shape (per serving) plus the provenance of the
 * estimate. `perServing` is empty (`{}`) when nothing could be sourced, so it
 * flows straight into `hasNutrition` / `NutritionPanel` and simply renders
 * nothing. `saturatedFatGrams` is always absent. The USDA generic items this is
 * built from don't break fat out that far.
 */
export type EstimatedNutrition = {
  /** Estimated per-serving nutrition (empty when nothing was sourced). */
  perServing: Nutrition;
  /** Fraction (0–1) of ingredient lines that contributed. */
  coverage: number;
  /** Ingredient lines that contributed. */
  sourced: number;
  /** Ingredient lines considered. */
  total: number;
};

/**
 * Estimate a recipe's **per-serving** nutrition from its ingredient list by
 * rolling the whole-recipe totals up (via {@link estimateRecipeNutrition}) and
 * dividing by the serving count. This is the bridge the recipe view uses to
 * auto-fill a Nutrition Facts panel when the cook hasn't entered any numbers.
 * the same per-serving basis the panel already scales with. A non-positive or
 * non-finite `servings` is treated as 1. Pure and framework-free.
 */
export function estimatePerServingNutrition(
  ingredients: readonly NutritionIngredient[],
  servings: number,
): EstimatedNutrition {
  const roll = estimateRecipeNutrition(ingredients);
  const s = Number.isFinite(servings) && servings > 0 ? servings : 1;
  const perServing: Nutrition =
    roll.sourced === 0
      ? {}
      : {
          calories: roll.kcal / s,
          proteinGrams: roll.proteinG / s,
          carbsGrams: roll.carbsG / s,
          fatGrams: roll.fatG / s,
          fiberGrams: roll.fiberG / s,
          sugarGrams: roll.sugarG / s,
          sodiumMg: roll.sodiumMg / s,
        };
  return {
    perServing,
    coverage: roll.coverage,
    sourced: roll.sourced,
    total: roll.total,
  };
}
