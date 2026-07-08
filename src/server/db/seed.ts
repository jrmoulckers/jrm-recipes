/**
 * Heirloom demo-data seed.
 *
 * Populates a coherent little showcase dataset so the newest UI has something to
 * render on a fresh database: recipe timelines + adaptations (a fork with its
 * lineage and events), ratings, threaded comments + suggestions (open and
 * resolved), and reels (derived purely from a recipe's own fields).
 *
 * Design goals
 * ------------
 * - IDEMPOTENT. Every row has a stable natural key, so re-running UPDATES in
 *   place instead of duplicating. Collections that hang off a recipe
 *   (ingredients, steps, tags, versions, events) are rebuilt from scratch each
 *   run, so row counts stay constant. Ratings/comments upsert on their keys.
 * - OWNER-PARAMETERISED. Recipes are authored by the user identified by
 *   `OWNER_USER_ID` (a Clerk user id). We resolve it the same way the app does —
 *   by `users.clerkId` — so when the site owner signs in with that Clerk account
 *   they own the seeded recipes and can edit them. Unset -> the local dev user.
 * - PUBLIC. All seeded recipes are public + published so they render with no
 *   sign-in (the prod site can show them to anonymous visitors).
 *
 * Run it:
 *   pnpm db:seed
 *   # or, seeding a specific owner + database:
 *   OWNER_USER_ID=user_123 DATABASE_URL="postgres://…" pnpm db:seed
 *
 * Connection: uses the same non-pooled-first resolution as scripts/migrate.mjs
 * (DATABASE_URL_UNPOOLED ?? POSTGRES_URL_NON_POOLING ?? DATABASE_URL) since a
 * seed does a burst of writes and a direct connection sidesteps pooler quirks.
 */
import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "~/server/db/schema";
import {
  collectionRecipes,
  collections,
  comments,
  cookLogEntries,
  favorites,
  groupMembers,
  groups,
  mealPlanEntries,
  ratings,
  recipeEvents,
  recipeIngredients,
  recipeSteps,
  recipeTags,
  recipeVersions,
  recipes,
  shoppingListItems,
  shoppingLists,
  tags,
  users,
  type User,
} from "~/server/db/schema";
import { DEV_USER } from "~/server/auth/dev-user";
import type { RecipeInput } from "~/server/recipes/validation";
import {
  buildCollectionRecipeRows,
  buildCollectionRows,
  buildCookLogRows,
  buildFavoriteRows,
  buildMealPlanRows,
  buildShoppingListItemRows,
  buildShoppingListRow,
  SEED_COLLECTION_IDS,
  SEED_SHOPPING_LIST_ID,
  type LibraryIds,
} from "~/server/db/seed-library";

// ---------------------------------------------------------------------------
// Connection (own client so we can honour the non-pooled URL + snake_case).
// ---------------------------------------------------------------------------

const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

if (!url) {
  console.error(
    "No database URL set. Provide DATABASE_URL (or DATABASE_URL_UNPOOLED / " +
      "POSTGRES_URL_NON_POOLING). See .env.example.",
  );
  process.exit(1);
}

const client = postgres(url, {
  max: 1,
  prepare: false,
  onnotice: () => undefined,
});
// `casing: "snake_case"` mirrors src/server/db/index.ts so the schema's camelCase
// keys map to the same snake_case columns the migrations created.
const db = drizzle(client, { schema, casing: "snake_case" });
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

/** A URL-safe slug, matching src/lib/utils.ts::slugify so tags dedupe cleanly. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A stable-ish timestamp `days` in the past (anchored to the start of today). */
function daysAgo(days: number, extraMinutes = 0): Date {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return new Date(midnight.getTime() - days * DAY_MS + extraMinutes * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Seed data.
// ---------------------------------------------------------------------------

const GROUP = {
  id: "seed_grp_family",
  slug: "heirloom-family",
  name: "The Heirloom Family",
  description: "Our family cookbook — the recipes worth passing down.",
};

/** Extra family voices for ratings, comments, and suggestions. clerkId stays null. */
const DEMO_USERS = [
  {
    id: "seed_usr_gran",
    name: "Gran (Lucia)",
    handle: "gran-lucia",
    email: "lucia@heirloom.local",
  },
  {
    id: "seed_usr_rosa",
    name: "Aunt Rosa",
    handle: "aunt-rosa",
    email: "rosa@heirloom.local",
  },
  {
    id: "seed_usr_mateo",
    name: "Cousin Mateo",
    handle: "cousin-mateo",
    email: "mateo@heirloom.local",
  },
] as const;

type SeedIngredient = {
  quantity?: number;
  quantityMax?: number;
  unit?: string;
  item: string;
  note?: string;
  section?: string;
  optional?: boolean;
};
type SeedStep = {
  instruction: string;
  section?: string;
  timerSeconds?: number;
  techniques?: string[];
};
type SeedRecipe = {
  id: string;
  slug: string;
  title: string;
  description: string;
  servings: number;
  servingsNoun?: string;
  prepMinutes: number;
  cookMinutes: number;
  difficulty: "easy" | "medium" | "hard";
  cuisine: string;
  notes?: string;
  sourceName?: string;
  createdDaysAgo: number;
  tags: string[];
  ingredients: SeedIngredient[];
  steps: SeedStep[];
  /** Stable id of the recipe this one was adapted from (makes it a fork). */
  forkedFromId?: string;
  forkNote?: string;
};

const GRAVY: SeedRecipe = {
  id: "seed_rcp_gravy",
  slug: "nonnas-sunday-gravy",
  title: "Nonna's Sunday Gravy",
  description:
    "The slow-simmered meat sauce that anchored every Sunday at Nonna's table. Make a big pot — it only gets better, and it freezes beautifully.",
  servings: 8,
  prepMinutes: 20,
  cookMinutes: 210,
  difficulty: "medium",
  cuisine: "Italian",
  notes:
    "Nonna never measured the basil — 'a big handful, then one more.' The gravy is done when a wooden spoon leaves a clean trail across the pot.",
  sourceName: "Nonna Lucia's handwritten card",
  createdDaysAgo: 90,
  tags: ["dinner", "sauce", "heirloom", "sunday"],
  ingredients: [
    { quantity: 3, unit: "tbsp", item: "olive oil" },
    { quantity: 1, item: "yellow onion", note: "finely diced" },
    { quantity: 6, item: "garlic cloves", note: "sliced" },
    { quantity: 3, unit: "tbsp", item: "tomato paste" },
    {
      quantity: 56,
      unit: "oz",
      item: "canned San Marzano tomatoes",
      note: "crushed by hand",
    },
    { quantity: 1, unit: "tsp", item: "sugar" },
    { item: "basil", note: "a big handful", optional: true },
    { quantity: 1, unit: "lb", item: "pork spare ribs", section: "The meat" },
    {
      quantity: 0.5,
      unit: "lb",
      item: "Italian sausage",
      section: "The meat",
    },
  ],
  steps: [
    {
      instruction:
        "Brown the pork ribs and sausage in the oil in batches, turning until deeply colored on all sides. Set the meat aside.",
      timerSeconds: 600,
      techniques: ["searing"],
    },
    {
      instruction:
        "Lower the heat and sweat the onion in the rendered fat with a pinch of salt until soft and sweet.",
      timerSeconds: 480,
      techniques: ["sweating"],
    },
    {
      instruction:
        "Stir in the garlic and tomato paste and cook until brick-red and fragrant.",
      timerSeconds: 180,
    },
    {
      instruction:
        "Crush in the tomatoes, add the sugar, and nestle the meat back in. Bring to a bare simmer.",
    },
    {
      instruction:
        "Simmer low and partially covered, stirring now and then, until the gravy is deep, glossy, and thick.",
      timerSeconds: 10800,
      techniques: ["simmering"],
    },
    {
      instruction:
        "Fish out the meat, tear in the basil, taste for salt, and serve over rigatoni with plenty of grated pecorino.",
    },
  ],
};

const MARINARA: SeedRecipe = {
  id: "seed_rcp_marinara",
  slug: "weeknight-garden-marinara",
  title: "Weeknight Garden Marinara",
  description:
    "A lighter, meatless take on Nonna's gravy for busy nights — same soul, ready in well under an hour.",
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 25,
  difficulty: "easy",
  cuisine: "Italian",
  notes:
    "Keeps the bright tomato-and-basil heart of the Sunday gravy but drops the meat and the long simmer.",
  createdDaysAgo: 30,
  tags: ["dinner", "sauce", "weeknight", "vegetarian"],
  forkedFromId: GRAVY.id,
  forkNote:
    "Adapted from Nonna's Sunday Gravy — meatless and quick for a Tuesday, but still simmered with basil and good tomatoes.",
  ingredients: [
    { quantity: 2, unit: "tbsp", item: "olive oil" },
    { quantity: 4, item: "garlic cloves", note: "thinly sliced" },
    { item: "red pepper flakes", note: "a pinch", optional: true },
    {
      quantity: 28,
      unit: "oz",
      item: "canned San Marzano tomatoes",
      note: "crushed by hand",
    },
    { quantity: 1, unit: "tsp", item: "sugar" },
    { item: "basil", note: "a big handful" },
    { item: "flaky salt", note: "to taste" },
  ],
  steps: [
    {
      instruction:
        "Warm the oil and gently sizzle the garlic (and pepper flakes, if using) until just golden and perfumed.",
      timerSeconds: 120,
      techniques: ["infusing"],
    },
    {
      instruction:
        "Add the crushed tomatoes and sugar and simmer briskly, stirring, until thickened and jammy.",
      timerSeconds: 1200,
      techniques: ["simmering"],
    },
    {
      instruction:
        "Tear in the basil, season with flaky salt, and toss with spaghetti cooked just shy of al dente.",
    },
  ],
};

const FOCACCIA: SeedRecipe = {
  id: "seed_rcp_focaccia",
  slug: "rosemary-focaccia",
  title: "Rosemary Focaccia",
  description:
    "Pillowy, golden, dimpled focaccia with a crackly olive-oil crust and a shower of rosemary and flaky salt.",
  servings: 12,
  servingsNoun: "pieces",
  prepMinutes: 20,
  cookMinutes: 25,
  difficulty: "medium",
  cuisine: "Italian",
  notes:
    "The overnight cold ferment is what gives it that open, bubbly crumb — don't skip it.",
  createdDaysAgo: 60,
  tags: ["bread", "baking", "vegetarian", "weekend"],
  ingredients: [
    { quantity: 4, unit: "cup", item: "bread flour" },
    { quantity: 2, unit: "tsp", item: "instant yeast" },
    { quantity: 2, unit: "tsp", item: "fine salt" },
    { quantity: 2, unit: "cup", item: "warm water" },
    {
      quantity: 5,
      unit: "tbsp",
      item: "extra-virgin olive oil",
      note: "divided",
    },
    { item: "fresh rosemary", section: "To finish" },
    { item: "flaky sea salt", section: "To finish" },
  ],
  steps: [
    {
      instruction:
        "Whisk the flour, yeast, and fine salt. Stir in the water and 2 tbsp of the oil to a shaggy, sticky dough.",
    },
    {
      instruction:
        "Cover and cold-ferment in the fridge overnight so the flavor deepens and the crumb opens up.",
      timerSeconds: 43200,
      techniques: ["fermenting"],
    },
    {
      instruction:
        "Pour 2 tbsp oil into a sheet pan, stretch the dough to the edges, and dimple all over with oiled fingertips.",
      techniques: ["dimpling"],
    },
    {
      instruction:
        "Proof until pillowy, then scatter with rosemary and flaky salt and drizzle with the last of the oil.",
      timerSeconds: 5400,
      techniques: ["proofing"],
    },
    {
      instruction:
        "Bake at 220°C (430°F) until deep golden and crisp at the edges. Cool briefly, then cut into squares.",
      timerSeconds: 1500,
      techniques: ["baking"],
    },
  ],
};

const SEED_RECIPES: SeedRecipe[] = [GRAVY, MARINARA, FOCACCIA];
const RECIPE_IDS = SEED_RECIPES.map((r) => r.id);

// ---------------------------------------------------------------------------
// Owner + users + group.
// ---------------------------------------------------------------------------

/**
 * Resolve the recipe owner. `OWNER_USER_ID` is treated as a Clerk user id and
 * matched against `users.clerkId` (the app's own mapping); we also accept a
 * literal internal `users.id`. If neither exists we create a user carrying that
 * clerkId, so a later real sign-in reuses the same row and inherits ownership.
 */
async function resolveOwner(tx: Tx): Promise<User> {
  const ownerEnv = process.env.OWNER_USER_ID?.trim();

  if (!ownerEnv) {
    const [row] = await tx
      .insert(users)
      .values({
        id: DEV_USER.id,
        email: DEV_USER.email,
        name: DEV_USER.name,
        handle: DEV_USER.handle,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: { email: DEV_USER.email, name: DEV_USER.name },
      })
      .returning();
    console.log(`Owner: local dev user (${DEV_USER.id}). Set OWNER_USER_ID to own these as your Clerk account.`);
    return row!;
  }

  const byClerk = await tx.query.users.findFirst({
    where: eq(users.clerkId, ownerEnv),
  });
  if (byClerk) {
    console.log(`Owner: existing user for clerkId ${ownerEnv} (${byClerk.id}).`);
    return byClerk;
  }

  const byId = await tx.query.users.findFirst({ where: eq(users.id, ownerEnv) });
  if (byId) {
    console.log(`Owner: existing user id ${ownerEnv}.`);
    return byId;
  }

  const [created] = await tx
    .insert(users)
    .values({
      id: createId(),
      clerkId: ownerEnv,
      name: "Heirloom Cook",
    })
    .returning();
  console.log(
    `Owner: created placeholder user for clerkId ${ownerEnv} (${created!.id}). ` +
      "Signing in with that Clerk account will adopt it.",
  );
  return created!;
}

/** Upsert the family group and return its id. */
async function ensureGroup(tx: Tx, ownerId: string): Promise<string> {
  await tx
    .insert(groups)
    .values({
      id: GROUP.id,
      slug: GROUP.slug,
      name: GROUP.name,
      description: GROUP.description,
      createdById: ownerId,
    })
    .onConflictDoUpdate({
      target: groups.id,
      set: {
        slug: GROUP.slug,
        name: GROUP.name,
        description: GROUP.description,
        createdById: ownerId,
      },
    });
  return GROUP.id;
}

/** Upsert the demo family users (idempotent on their stable ids). */
async function ensureDemoUsers(tx: Tx): Promise<void> {
  for (const u of DEMO_USERS) {
    await tx
      .insert(users)
      .values({ id: u.id, name: u.name, handle: u.handle, email: u.email })
      .onConflictDoUpdate({
        target: users.id,
        set: { name: u.name, handle: u.handle, email: u.email },
      });
  }
}

/** Owner + family in the group so it reads like a real shared cookbook. */
async function ensureMemberships(tx: Tx, ownerId: string): Promise<void> {
  const members: { userId: string; role: "owner" | "member" }[] = [
    { userId: ownerId, role: "owner" },
    ...DEMO_USERS.map((u) => ({ userId: u.id, role: "member" as const })),
  ];
  for (const m of members) {
    await tx
      .insert(groupMembers)
      .values({ groupId: GROUP.id, userId: m.userId, role: m.role })
      .onConflictDoNothing({
        target: [groupMembers.groupId, groupMembers.userId],
      });
  }
}

// ---------------------------------------------------------------------------
// Recipes + their child collections.
// ---------------------------------------------------------------------------

/** A RecipeInput-shaped snapshot for the version history (previewable/revertible). */
function versionSnapshot(r: SeedRecipe): RecipeInput {
  return {
    title: r.title,
    description: r.description,
    servings: r.servings,
    servingsNoun: r.servingsNoun ?? "servings",
    prepMinutes: r.prepMinutes,
    cookMinutes: r.cookMinutes,
    totalMinutes: r.prepMinutes + r.cookMinutes,
    difficulty: r.difficulty,
    cuisine: r.cuisine,
    notes: r.notes,
    visibility: "public",
    status: "published",
    ingredients: r.ingredients.map((ing) => ({
      section: ing.section,
      quantity: ing.quantity,
      quantityMax: ing.quantityMax,
      unit: ing.unit,
      item: ing.item,
      note: ing.note,
      optional: ing.optional ?? false,
    })),
    steps: r.steps.map((step) => ({
      section: step.section,
      instruction: step.instruction,
      timerSeconds: step.timerSeconds,
      techniques: step.techniques ?? [],
    })),
    tags: r.tags,
  };
}

/** Upsert a recipe row (scalars) — keeps the same id/createdAt across runs. */
async function upsertRecipe(
  tx: Tx,
  r: SeedRecipe,
  ownerId: string,
  groupId: string,
): Promise<void> {
  const created = daysAgo(r.createdDaysAgo);
  const row = {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    authorId: ownerId,
    groupId,
    visibility: "public" as const,
    status: "published" as const,
    servings: r.servings,
    servingsNoun: r.servingsNoun ?? "servings",
    prepMinutes: r.prepMinutes,
    cookMinutes: r.cookMinutes,
    totalMinutes: r.prepMinutes + r.cookMinutes,
    difficulty: r.difficulty,
    cuisine: r.cuisine,
    sourceName: r.sourceName ?? null,
    notes: r.notes ?? null,
    forkedFromId: r.forkedFromId ?? null,
    forkNote: r.forkNote ?? null,
    publishedAt: created,
    createdAt: created,
    updatedAt: created,
  };
  const { id: _id, createdAt: _createdAt, ...mutable } = row;
  await tx
    .insert(recipes)
    .values(row)
    .onConflictDoUpdate({
      target: recipes.id,
      set: { ...mutable, updatedAt: new Date() },
    });
}

/** Rebuild a recipe's ingredients + steps from scratch (stable row counts). */
async function rebuildRecipeContent(tx: Tx, r: SeedRecipe): Promise<void> {
  await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, r.id));
  await tx.delete(recipeSteps).where(eq(recipeSteps.recipeId, r.id));

  if (r.ingredients.length > 0) {
    await tx.insert(recipeIngredients).values(
      r.ingredients.map((ing, i) => ({
        recipeId: r.id,
        position: i,
        section: ing.section ?? null,
        quantity: ing.quantity ?? null,
        quantityMax: ing.quantityMax ?? null,
        unit: ing.unit ?? null,
        item: ing.item,
        note: ing.note ?? null,
        optional: ing.optional ?? false,
      })),
    );
  }
  if (r.steps.length > 0) {
    await tx.insert(recipeSteps).values(
      r.steps.map((step, i) => ({
        recipeId: r.id,
        position: i,
        section: step.section ?? null,
        instruction: step.instruction,
        timerSeconds: step.timerSeconds ?? null,
        techniques:
          step.techniques && step.techniques.length > 0
            ? step.techniques
            : null,
      })),
    );
  }
}

/** Upsert tags and (re)link them to a recipe. */
async function rebuildRecipeTags(tx: Tx, r: SeedRecipe): Promise<void> {
  await tx.delete(recipeTags).where(eq(recipeTags.recipeId, r.id));
  const unique = [...new Set(r.tags.map((t) => t.trim()).filter(Boolean))];
  if (unique.length === 0) return;

  const rows = unique.map((name) => ({
    name,
    slug: slugify(name).slice(0, 60) || name.toLowerCase(),
  }));
  await tx
    .insert(tags)
    .values(rows.map((t) => ({ slug: t.slug, name: t.name })))
    .onConflictDoNothing({ target: tags.slug });

  const tagRows = await tx.query.tags.findMany({
    where: inArray(
      tags.slug,
      rows.map((t) => t.slug),
    ),
    columns: { id: true },
  });
  if (tagRows.length > 0) {
    await tx
      .insert(recipeTags)
      .values(tagRows.map((t) => ({ recipeId: r.id, tagId: t.id })))
      .onConflictDoNothing();
  }
}

/** One saved version per recipe (feeds the "Saved versions" list + revert). */
async function rebuildRecipeVersion(
  tx: Tx,
  r: SeedRecipe,
  ownerId: string,
): Promise<void> {
  await tx.delete(recipeVersions).where(eq(recipeVersions.recipeId, r.id));
  await tx.insert(recipeVersions).values({
    recipeId: r.id,
    authorId: ownerId,
    versionNumber: 1,
    label: r.forkedFromId ? "Adapted" : "Created",
    summary: r.forkedFromId
      ? "Forked from the original and tuned for weeknights."
      : "First saved version.",
    snapshot: versionSnapshot(r),
    createdAt: daysAgo(r.createdDaysAgo),
  });
}

/**
 * Rebuild every recipe's timeline events. Mirrors what mutations.ts records:
 * a `created` (or `adapted`, for a fork) origin, a `published` milestone, and —
 * on a source recipe — an `adapted` event pointing forward to each descendant
 * so the lineage shows on both sides.
 */
async function rebuildEvents(tx: Tx, ownerId: string): Promise<void> {
  await tx.delete(recipeEvents).where(inArray(recipeEvents.recipeId, RECIPE_IDS));

  type EventRow = {
    recipeId: string;
    actorId: string;
    type: "created" | "adapted" | "published" | "updated";
    note: string | null;
    relatedRecipeId: string | null;
    createdAt: Date;
  };
  const rows: EventRow[] = [];

  for (const r of SEED_RECIPES) {
    const created = daysAgo(r.createdDaysAgo);
    if (r.forkedFromId) {
      rows.push({
        recipeId: r.id,
        actorId: ownerId,
        type: "adapted",
        note: r.forkNote ?? null,
        relatedRecipeId: r.forkedFromId,
        createdAt: created,
      });
    } else {
      rows.push({
        recipeId: r.id,
        actorId: ownerId,
        type: "created",
        note: null,
        relatedRecipeId: null,
        createdAt: created,
      });
    }
    rows.push({
      recipeId: r.id,
      actorId: ownerId,
      type: "published",
      note: null,
      relatedRecipeId: null,
      createdAt: daysAgo(r.createdDaysAgo, 1),
    });
  }

  // Source-side descendant links: on each recipe that has been forked, record an
  // `adapted` event pointing at the fork (rendered as an "adaptation" branch).
  for (const child of SEED_RECIPES) {
    if (!child.forkedFromId) continue;
    rows.push({
      recipeId: child.forkedFromId,
      actorId: ownerId,
      type: "adapted",
      note: child.forkNote ?? null,
      relatedRecipeId: child.id,
      createdAt: daysAgo(child.createdDaysAgo, 2),
    });
  }

  await tx.insert(recipeEvents).values(rows);
}

async function seedRecipes(
  tx: Tx,
  ownerId: string,
  groupId: string,
): Promise<void> {
  // Insert sources before forks so self-referential FKs resolve.
  const ordered = [...SEED_RECIPES].sort(
    (a, b) => (a.forkedFromId ? 1 : 0) - (b.forkedFromId ? 1 : 0),
  );
  for (const r of ordered) {
    await upsertRecipe(tx, r, ownerId, groupId);
  }
  for (const r of SEED_RECIPES) {
    await rebuildRecipeContent(tx, r);
    await rebuildRecipeTags(tx, r);
    await rebuildRecipeVersion(tx, r, ownerId);
  }
  await rebuildEvents(tx, ownerId);
}

// ---------------------------------------------------------------------------
// Engagement: ratings, comments, suggestions.
// ---------------------------------------------------------------------------

async function seedEngagement(tx: Tx, ownerId: string): Promise<void> {
  const ratingRows: { recipeId: string; userId: string; value: number }[] = [
    { recipeId: GRAVY.id, userId: "seed_usr_rosa", value: 5 },
    { recipeId: GRAVY.id, userId: "seed_usr_mateo", value: 4 },
    { recipeId: GRAVY.id, userId: "seed_usr_gran", value: 5 },
    { recipeId: MARINARA.id, userId: "seed_usr_mateo", value: 5 },
    { recipeId: MARINARA.id, userId: "seed_usr_rosa", value: 4 },
    { recipeId: FOCACCIA.id, userId: "seed_usr_gran", value: 5 },
    { recipeId: FOCACCIA.id, userId: "seed_usr_mateo", value: 5 },
  ];
  for (const rt of ratingRows) {
    await tx
      .insert(ratings)
      .values(rt)
      .onConflictDoUpdate({
        target: [ratings.recipeId, ratings.userId],
        set: { value: rt.value, updatedAt: new Date() },
      });
  }

  // Keep the denormalized rating aggregates (issue #154) in sync with the rows
  // we just seeded, mirroring the mutation path + migration backfill: a recipe's
  // own author never counts toward its average, so we exclude owner ratings.
  const aggregates = new Map<string, { count: number; sum: number }>();
  for (const rt of ratingRows) {
    if (rt.userId === ownerId) continue;
    const agg = aggregates.get(rt.recipeId) ?? { count: 0, sum: 0 };
    agg.count += 1;
    agg.sum += rt.value;
    aggregates.set(rt.recipeId, agg);
  }
  for (const recipeId of RECIPE_IDS) {
    const agg = aggregates.get(recipeId) ?? { count: 0, sum: 0 };
    await tx
      .update(recipes)
      .set({ ratingCount: agg.count, ratingSum: agg.sum })
      .where(eq(recipes.id, recipeId));
  }

  type CommentRow = {
    id: string;
    recipeId: string;
    userId: string;
    kind: "comment" | "suggestion";
    body: string;
    parentId?: string;
    daysAgo: number;
    resolvedDaysAgo?: number;
  };
  // Parents before replies so threads assemble correctly.
  const commentRows: CommentRow[] = [
    {
      id: "seed_cmt_gravy_praise",
      recipeId: GRAVY.id,
      userId: "seed_usr_rosa",
      kind: "comment",
      daysAgo: 80,
      body: "This is exactly how Nonna made it — the smell took me straight back to her kitchen. The ribs are non-negotiable!",
    },
    {
      id: "seed_cmt_gravy_reply",
      recipeId: GRAVY.id,
      userId: ownerId,
      parentId: "seed_cmt_gravy_praise",
      kind: "comment",
      daysAgo: 79,
      body: "So glad it landed, Rosa. I finally wrote down the timing on her card so we don't lose it.",
    },
    {
      id: "seed_cmt_gravy_sugg",
      recipeId: GRAVY.id,
      userId: "seed_usr_mateo",
      kind: "suggestion",
      daysAgo: 70,
      body: "Suggestion: drop a parmesan rind in while it simmers and pull it before serving — adds a lovely savory depth.",
    },
    {
      id: "seed_cmt_mar_praise",
      recipeId: MARINARA.id,
      userId: "seed_usr_gran",
      kind: "comment",
      daysAgo: 20,
      body: "Clever little weeknight version, and a nice way to keep the Sunday flavor going midweek.",
    },
    {
      id: "seed_cmt_mar_sugg",
      recipeId: MARINARA.id,
      userId: "seed_usr_rosa",
      kind: "suggestion",
      daysAgo: 18,
      resolvedDaysAgo: 12,
      body: "Suggestion: a splash of pasta water when you toss it helps the sauce cling. Worth adding to the last step.",
    },
    {
      id: "seed_cmt_foc_tip",
      recipeId: FOCACCIA.id,
      userId: "seed_usr_mateo",
      kind: "comment",
      daysAgo: 50,
      body: "The overnight cold ferment is absolutely worth it — biggest, bubbliest crumb I've gotten at home.",
    },
  ];
  for (const c of commentRows) {
    const createdAt = daysAgo(c.daysAgo);
    await tx
      .insert(comments)
      .values({
        id: c.id,
        recipeId: c.recipeId,
        userId: c.userId,
        parentId: c.parentId ?? null,
        kind: c.kind,
        body: c.body,
        resolvedAt:
          c.resolvedDaysAgo != null ? daysAgo(c.resolvedDaysAgo) : null,
        createdAt,
        updatedAt: createdAt,
      })
      .onConflictDoUpdate({
        target: comments.id,
        set: {
          body: c.body,
          kind: c.kind,
          parentId: c.parentId ?? null,
          resolvedAt:
            c.resolvedDaysAgo != null ? daysAgo(c.resolvedDaysAgo) : null,
          updatedAt: new Date(),
        },
      });
  }
}

// ---------------------------------------------------------------------------
// Library: cook log, collections + favorites, shopping list, meal planner.
// ---------------------------------------------------------------------------

/**
 * Seed the personal-library surfaces (issue #185) so cook log, collections,
 * favorites, shopping list, and the weekly planner all render non-empty on a
 * fresh database. Idempotent: top-level rows upsert on their stable id/natural
 * key, and pure child rows (shopping-list items, collection memberships) are
 * rebuilt in place under their seed-owned parents so counts stay constant.
 */
async function seedLibrary(tx: Tx, ownerId: string, groupId: string) {
  const ids: LibraryIds = {
    ownerId,
    groupId,
    users: {
      gran: "seed_usr_gran",
      rosa: "seed_usr_rosa",
      mateo: "seed_usr_mateo",
    },
    recipes: {
      gravy: GRAVY.id,
      marinara: MARINARA.id,
      focaccia: FOCACCIA.id,
    },
  };

  // Cook log — upsert each dated "I cooked this" entry on its stable id.
  for (const row of buildCookLogRows(ids, daysAgo)) {
    await tx
      .insert(cookLogEntries)
      .values(row)
      .onConflictDoUpdate({
        target: cookLogEntries.id,
        set: {
          cookedAt: row.cookedAt,
          note: row.note ?? null,
          photoUrl: row.photoUrl ?? null,
          servingsMade: row.servingsMade ?? null,
          updatedAt: new Date(),
        },
      });
  }

  // Collections — upsert each cookbook, then rebuild its memberships in place.
  for (const row of buildCollectionRows(ids)) {
    await tx
      .insert(collections)
      .values(row)
      .onConflictDoUpdate({
        target: collections.id,
        set: {
          name: row.name,
          description: row.description ?? null,
          coverImageUrl: row.coverImageUrl ?? null,
          updatedAt: new Date(),
        },
      });
  }
  await tx
    .delete(collectionRecipes)
    .where(inArray(collectionRecipes.collectionId, [...SEED_COLLECTION_IDS]));
  const collectionRecipeRows = buildCollectionRecipeRows(ids);
  if (collectionRecipeRows.length > 0) {
    await tx.insert(collectionRecipes).values(collectionRecipeRows);
  }

  // Favorites — one row per (user, recipe); the unique key makes this a no-op
  // on re-run.
  for (const row of buildFavoriteRows(ids)) {
    await tx
      .insert(favorites)
      .values(row)
      .onConflictDoNothing({
        target: [favorites.userId, favorites.recipeId],
      });
  }

  // Shopping list — upsert the list, then rebuild its lines in place.
  const listRow = buildShoppingListRow(ids);
  await tx
    .insert(shoppingLists)
    .values(listRow)
    .onConflictDoUpdate({
      target: shoppingLists.id,
      set: { name: listRow.name ?? "Shopping list", updatedAt: new Date() },
    });
  await tx
    .delete(shoppingListItems)
    .where(eq(shoppingListItems.listId, SEED_SHOPPING_LIST_ID));
  const itemRows = buildShoppingListItemRows(ids);
  if (itemRows.length > 0) {
    await tx.insert(shoppingListItems).values(itemRows);
  }

  // Meal planner — upsert each day/slot assignment on its stable id.
  for (const row of buildMealPlanRows(ids, daysAgo)) {
    await tx
      .insert(mealPlanEntries)
      .values(row)
      .onConflictDoUpdate({
        target: mealPlanEntries.id,
        set: {
          date: row.date,
          slot: row.slot,
          recipeId: row.recipeId ?? null,
          groupId: row.groupId ?? null,
          note: row.note ?? null,
          position: row.position ?? 0,
          updatedAt: new Date(),
        },
      });
  }
}

// ---------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------

async function countAll() {
  const [
    recipeCount,
    eventCount,
    ratingCount,
    commentCount,
    versionCount,
    suggestionCount,
    forkCount,
    cookLogCount,
    collectionCount,
    collectionRecipeCount,
    favoriteCount,
    shoppingItemCount,
    mealPlanCount,
  ] = await Promise.all([
    db.$count(recipes, inArray(recipes.id, RECIPE_IDS)),
    db.$count(recipeEvents, inArray(recipeEvents.recipeId, RECIPE_IDS)),
    db.$count(ratings, inArray(ratings.recipeId, RECIPE_IDS)),
    db.$count(comments, inArray(comments.recipeId, RECIPE_IDS)),
    db.$count(recipeVersions, inArray(recipeVersions.recipeId, RECIPE_IDS)),
    db.$count(comments, eq(comments.kind, "suggestion")),
    db.$count(
      recipes,
      and(
        inArray(recipes.id, RECIPE_IDS),
        sql`${recipes.forkedFromId} is not null`,
      ),
    ),
    db.$count(cookLogEntries, inArray(cookLogEntries.recipeId, RECIPE_IDS)),
    db.$count(
      collections,
      inArray(collections.id, [...SEED_COLLECTION_IDS]),
    ),
    db.$count(
      collectionRecipes,
      inArray(collectionRecipes.collectionId, [...SEED_COLLECTION_IDS]),
    ),
    db.$count(favorites, inArray(favorites.recipeId, RECIPE_IDS)),
    db.$count(
      shoppingListItems,
      eq(shoppingListItems.listId, SEED_SHOPPING_LIST_ID),
    ),
    db.$count(mealPlanEntries, inArray(mealPlanEntries.recipeId, RECIPE_IDS)),
  ]);
  return {
    recipeCount,
    eventCount,
    ratingCount,
    commentCount,
    suggestionCount,
    versionCount,
    forkCount,
    cookLogCount,
    collectionCount,
    collectionRecipeCount,
    favoriteCount,
    shoppingItemCount,
    mealPlanCount,
  };
}

async function main() {
  console.log("Seeding Heirloom demo data…");
  await db.transaction(async (tx) => {
    const owner = await resolveOwner(tx);
    const groupId = await ensureGroup(tx, owner.id);
    await ensureDemoUsers(tx);
    await ensureMemberships(tx, owner.id);
    await seedRecipes(tx, owner.id, groupId);
    await seedEngagement(tx, owner.id);
    await seedLibrary(tx, owner.id, groupId);
  });

  const c = await countAll();
  console.log("Seed complete:");
  console.log(
    `  ${c.recipeCount} recipes (${c.forkCount} adaptation), ` +
      `${c.versionCount} versions, ${c.eventCount} timeline events`,
  );
  console.log(
    `  ${c.ratingCount} ratings, ${c.commentCount} comments ` +
      `(${c.suggestionCount} suggestions)`,
  );
  console.log(
    `  ${c.cookLogCount} cook-log entries, ${c.collectionCount} collections ` +
      `(${c.collectionRecipeCount} recipes), ${c.favoriteCount} favorites`,
  );
  console.log(
    `  ${c.shoppingItemCount} shopping-list items, ` +
      `${c.mealPlanCount} recipe-linked meal-plan entries`,
  );

  await client.end();
  process.exit(0);
}

main().catch(async (error) => {
  console.error("Seed failed:", error);
  await client.end({ timeout: 5 }).catch(() => undefined);
  process.exit(1);
});
