import { eq } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import {
  groupMembers,
  groups,
  recipeIngredients,
  recipeSteps,
  recipeTags,
  recipes,
  tags,
  users,
} from "~/server/db/schema";
import { slugify } from "~/lib/utils";
import { DEV_USER } from "~/server/auth/dev-user";

type SeedIngredient = {
  quantity?: number;
  unit?: string;
  item: string;
  note?: string;
  section?: string;
  optional?: boolean;
};
type SeedStep = { instruction: string; timerSeconds?: number; techniques?: string[] };
type SeedRecipe = {
  slug: string;
  title: string;
  description: string;
  visibility: "private" | "group" | "unlisted" | "public";
  servings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  difficulty?: "easy" | "medium" | "hard";
  cuisine?: string;
  tags: string[];
  ingredients: SeedIngredient[];
  steps: SeedStep[];
  groupId?: string | null;
};

const RECIPES: SeedRecipe[] = [
  {
    slug: "classic-buttermilk-pancakes",
    title: "Classic Buttermilk Pancakes",
    description:
      "Fluffy, golden, weekend-morning pancakes the whole family asks for. Double the batch — they vanish.",
    visibility: "public",
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 15,
    difficulty: "easy",
    cuisine: "American",
    tags: ["breakfast", "kid-friendly", "weekend"],
    ingredients: [
      { quantity: 2, unit: "cup", item: "all-purpose flour" },
      { quantity: 2, unit: "tbsp", item: "sugar" },
      { quantity: 2, unit: "tsp", item: "baking powder" },
      { quantity: 0.5, unit: "tsp", item: "baking soda" },
      { quantity: 0.5, unit: "tsp", item: "salt" },
      { quantity: 2, unit: "cup", item: "buttermilk" },
      { quantity: 2, item: "large eggs" },
      { quantity: 3, unit: "tbsp", item: "butter", note: "melted" },
    ],
    steps: [
      { instruction: "Whisk the flour, sugar, baking powder, baking soda, and salt in a large bowl." },
      { instruction: "In another bowl, whisk the buttermilk, eggs, and melted butter until smooth." },
      { instruction: "Pour the wet into the dry and fold just until combined — lumps are good. Rest the batter.", timerSeconds: 300, techniques: ["folding"] },
      { instruction: "Cook 1/4-cup pools on a buttered griddle over medium heat until bubbles pop, then flip.", timerSeconds: 120 },
      { instruction: "Serve hot with butter and maple syrup." },
    ],
  },
  {
    slug: "grandmas-sunday-marinara",
    title: "Grandma's Sunday Marinara",
    description:
      "The slow-simmered sauce that started every Sunday. Make a big pot and freeze half.",
    visibility: "group",
    servings: 6,
    prepMinutes: 10,
    cookMinutes: 90,
    difficulty: "medium",
    cuisine: "Italian",
    tags: ["dinner", "sauce", "heirloom"],
    ingredients: [
      { quantity: 3, unit: "tbsp", item: "olive oil" },
      { quantity: 1, item: "yellow onion", note: "finely diced" },
      { quantity: 4, item: "garlic cloves", note: "sliced" },
      { quantity: 2, unit: "tbsp", item: "tomato paste" },
      { quantity: 56, unit: "oz", item: "canned San Marzano tomatoes", note: "crushed by hand" },
      { quantity: 1, unit: "tsp", item: "sugar" },
      { item: "basil", note: "a big handful", optional: true },
    ],
    steps: [
      { instruction: "Warm the olive oil and sweat the onion with a pinch of salt until soft.", timerSeconds: 480, techniques: ["sweating"] },
      { instruction: "Add garlic and tomato paste; cook until brick-red and fragrant.", timerSeconds: 180 },
      { instruction: "Add the tomatoes and sugar. Bring to a bare simmer." },
      { instruction: "Simmer low, stirring now and then, until deep and glossy.", timerSeconds: 4800, techniques: ["simmering"] },
      { instruction: "Tear in the basil, season, and serve over your favorite pasta." },
    ],
  },
  {
    slug: "weeknight-chicken-tacos",
    title: "Weeknight Chicken Tacos",
    description: "20 minutes, one pan, huge flavor. The reliable Tuesday hero.",
    visibility: "private",
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 12,
    difficulty: "easy",
    cuisine: "Mexican",
    tags: ["dinner", "weeknight", "quick"],
    ingredients: [
      { quantity: 1.5, unit: "lb", item: "boneless chicken thighs", note: "diced" },
      { quantity: 1, unit: "tbsp", item: "chili powder" },
      { quantity: 1, unit: "tsp", item: "ground cumin" },
      { quantity: 1, unit: "tsp", item: "smoked paprika" },
      { quantity: 2, unit: "tbsp", item: "oil" },
      { quantity: 8, item: "corn tortillas", note: "warmed" },
      { item: "cilantro, onion, lime", section: "To serve" },
    ],
    steps: [
      { instruction: "Toss the chicken with the spices and a big pinch of salt." },
      { instruction: "Sear in a hot skillet, undisturbed, until browned, then toss and finish.", timerSeconds: 600, techniques: ["searing"] },
      { instruction: "Pile into warm tortillas with cilantro, onion, and a squeeze of lime." },
    ],
  },
];

async function ensureUser() {
  await db
    .insert(users)
    .values({
      id: DEV_USER.id,
      email: DEV_USER.email,
      name: DEV_USER.name,
      handle: DEV_USER.handle,
    })
    .onConflictDoNothing();
}

async function ensureGroup(): Promise<string> {
  const slug = "moulckers-family";
  const existing = await db.query.groups.findFirst({ where: eq(groups.slug, slug) });
  if (existing) return existing.id;
  const [row] = await db
    .insert(groups)
    .values({
      slug,
      name: "The Moulckers Family",
      description: "Our family cookbook — recipes worth passing down.",
      createdById: DEV_USER.id,
    })
    .returning({ id: groups.id });
  const groupId = row!.id;
  await db
    .insert(groupMembers)
    .values({ groupId, userId: DEV_USER.id, role: "owner" })
    .onConflictDoNothing();
  return groupId;
}

async function seedRecipe(r: SeedRecipe, groupId: string) {
  const existing = await db.query.recipes.findFirst({ where: eq(recipes.slug, r.slug) });
  if (existing) return;

  const [row] = await db
    .insert(recipes)
    .values({
      slug: r.slug,
      title: r.title,
      description: r.description,
      authorId: DEV_USER.id,
      groupId: r.visibility === "group" ? groupId : null,
      visibility: r.visibility,
      status: "published",
      servings: r.servings,
      prepMinutes: r.prepMinutes ?? null,
      cookMinutes: r.cookMinutes ?? null,
      totalMinutes:
        r.prepMinutes != null && r.cookMinutes != null
          ? r.prepMinutes + r.cookMinutes
          : null,
      difficulty: r.difficulty ?? null,
      cuisine: r.cuisine ?? null,
      publishedAt: new Date(),
    })
    .returning({ id: recipes.id });
  const recipeId = row!.id;

  await db.insert(recipeIngredients).values(
    r.ingredients.map((ing, i) => ({
      recipeId,
      position: i,
      section: ing.section ?? null,
      quantity: ing.quantity ?? null,
      unit: ing.unit ?? null,
      item: ing.item,
      note: ing.note ?? null,
      optional: ing.optional ?? false,
    })),
  );

  await db.insert(recipeSteps).values(
    r.steps.map((step, i) => ({
      recipeId,
      position: i,
      instruction: step.instruction,
      timerSeconds: step.timerSeconds ?? null,
      techniques: step.techniques ?? null,
    })),
  );

  for (const name of r.tags) {
    const tagSlug = slugify(name).slice(0, 60) || name.toLowerCase();
    await db.insert(tags).values({ slug: tagSlug, name }).onConflictDoNothing({ target: tags.slug });
    const tag = await db.query.tags.findFirst({ where: eq(tags.slug, tagSlug) });
    if (tag) {
      await db
        .insert(recipeTags)
        .values({ recipeId, tagId: tag.id })
        .onConflictDoNothing();
    }
  }
}

async function main() {
  if (!isDbConfigured()) {
    console.error("DATABASE_URL is not set — cannot seed. See .env.example.");
    process.exit(1);
  }
  console.log("Seeding Heirloom sample data…");
  await ensureUser();
  const groupId = await ensureGroup();
  for (const r of RECIPES) await seedRecipe(r, groupId);
  console.log(`Done. Seeded ${RECIPES.length} recipes.`);
  process.exit(0);
}

void main();
