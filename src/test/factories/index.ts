/**
 * Typed test-data factories (issue #224).
 *
 * Every server/component test used to hand-roll its own mock domain objects
 * (`{ id: "owner_1" } as User`, ad-hoc recipe/ingredient/step literals), which
 * drifts from the real Drizzle/Zod types and breaks noisily when the schema
 * changes. These factories produce valid domain objects with sensible defaults
 * and shallow per-call overrides, and their return types reference the *real*
 * exported types — so a schema change fails the build here instead of silently
 * rotting every test.
 *
 * Determinism: ids/slugs are stable by default (`user_1`, `recipe_1`, …) so
 * assertions are reproducible. When a test needs distinct rows, opt into the
 * shared counter via {@link seq} / {@link uniqueId} (or just pass an override).
 * Call {@link resetFactories} in a `beforeEach` to make sequenced ids stable
 * across tests.
 */
import type {
  Recipe,
  RecipeIngredient,
  RecipeStep,
  Tag,
  User,
} from "~/server/db/schema";
import type {
  IngredientInput,
  RecipeInput,
  StepInput,
} from "~/server/recipes/validation";

let counter = 0;

/** Next value from the shared factory counter (opt-in uniqueness). */
export function seq(): number {
  return ++counter;
}

/** A unique, prefixed id built from the shared counter, e.g. `user_3`. */
export function uniqueId(prefix: string): string {
  return `${prefix}_${seq()}`;
}

/** Reset the shared counter so sequenced ids are stable across tests. */
export function resetFactories(): void {
  counter = 0;
}

const EPOCH = new Date("2024-01-01T00:00:00.000Z");

/** A valid {@link User} row. Defaults to the stable id `user_1`. */
export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user_1",
    clerkId: null,
    email: "cook@example.com",
    name: "Test Cook",
    handle: "test-cook",
    avatarUrl: null,
    weeklyDigestOptIn: false,
    deletedAt: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    ...overrides,
  } satisfies User;
}

/** A valid recipe ingredient *input* (parses through `ingredientInput`). */
export function makeIngredientInput(
  overrides: Partial<IngredientInput> = {},
): IngredientInput {
  return {
    item: "Flour",
    quantity: 2,
    unit: "cups",
    optional: false,
    ...overrides,
  } satisfies IngredientInput;
}

/** A valid recipe step *input* (parses through `stepInput`). */
export function makeStepInput(overrides: Partial<StepInput> = {}): StepInput {
  return {
    instruction: "Mix the dry ingredients.",
    techniques: [],
    ...overrides,
  } satisfies StepInput;
}

/**
 * A valid {@link RecipeInput}. Defaults to a private draft with no children so
 * it parses cleanly through `recipeInput`; pass overrides (e.g. `ingredients`,
 * `visibility`) for richer cases.
 */
export function makeRecipeInput(
  overrides: Partial<RecipeInput> = {},
): RecipeInput {
  return {
    title: "Apple Pie",
    visibility: "private",
    status: "draft",
    ingredients: [],
    steps: [],
    tags: [],
    equipment: [],
    dietaryFlags: [],
    ...overrides,
  } satisfies RecipeInput;
}

/** A valid persisted {@link Recipe} row. Defaults to the stable id `recipe_1`. */
export function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "recipe_1",
    slug: "apple-pie",
    title: "Apple Pie",
    description: null,
    coverImageUrl: null,
    authorId: "user_1",
    groupId: null,
    visibility: "public",
    status: "published",
    servings: 4,
    servingsNoun: "servings",
    prepMinutes: null,
    cookMinutes: null,
    totalMinutes: null,
    restMinutes: null,
    makeAheadNote: null,
    equipment: null,
    difficulty: null,
    cuisine: null,
    dietaryFlags: null,
    dietaryTags: null,
    sourceName: null,
    sourceUrl: null,
    notes: null,
    story: null,
    handedDownFrom: null,
    originYear: null,
    originPlace: null,
    shareToken: null,
    shareLinkEnabled: true,
    shareTokenRotatedAt: null,
    calories: null,
    proteinGrams: null,
    carbsGrams: null,
    fatGrams: null,
    saturatedFatGrams: null,
    sodiumMg: null,
    sugarGrams: null,
    fiberGrams: null,
    forkedFromId: null,
    forkNote: null,
    publishedAt: EPOCH,
    ratingCount: 0,
    ratingSum: 0,
    deletedAt: null,
    deletedBy: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    ...overrides,
  } satisfies Recipe;
}

/** A valid persisted {@link RecipeIngredient} row. */
export function makeRecipeIngredient(
  overrides: Partial<RecipeIngredient> = {},
): RecipeIngredient {
  return {
    id: "ing_1",
    recipeId: "recipe_1",
    position: 0,
    section: null,
    quantity: 2,
    quantityMax: null,
    unit: "cups",
    item: "Flour",
    note: null,
    prep: null,
    stepPosition: null,
    optional: false,
    ...overrides,
  } satisfies RecipeIngredient;
}

/** A valid persisted {@link RecipeStep} row. */
export function makeRecipeStep(
  overrides: Partial<RecipeStep> = {},
): RecipeStep {
  return {
    id: "step_1",
    recipeId: "recipe_1",
    position: 0,
    section: null,
    instruction: "Mix the dry ingredients.",
    imageUrl: null,
    videoUrl: null,
    timerSeconds: null,
    targetTempC: null,
    doneness: null,
    techniques: null,
    ...overrides,
  } satisfies RecipeStep;
}

/** A valid {@link Tag} row. */
export function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: "tag_1",
    slug: "dessert",
    name: "Dessert",
    ...overrides,
  } satisfies Tag;
}

/**
 * The read-path shape the `queries` module returns for a recipe: the recipe row
 * plus its ordered ingredients/steps and joined tags. References the real
 * `Recipe`/`RecipeIngredient`/`RecipeStep`/`Tag` types so read-path tests stay
 * schema-honest without re-declaring the join shape everywhere.
 */
export type FullRecipeFixture = Recipe & {
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  tags: Array<{ tag: Tag }>;
};

/** A recipe with children for read-path tests (recipe + ingredients + steps + tags). */
export function makeFullRecipe(
  overrides: Partial<FullRecipeFixture> = {},
): FullRecipeFixture {
  const { ingredients, steps, tags, ...recipe } = overrides;
  return {
    ...makeRecipe(recipe),
    ingredients: ingredients ?? [
      makeRecipeIngredient({ id: "ing_1", position: 0, item: "Flour" }),
      makeRecipeIngredient({
        id: "ing_2",
        position: 1,
        item: "Sugar",
        unit: "cup",
        quantity: 1,
      }),
    ],
    steps: steps ?? [
      makeRecipeStep({ id: "step_1", position: 0, instruction: "Mix." }),
      makeRecipeStep({ id: "step_2", position: 1, instruction: "Bake." }),
    ],
    tags: tags ?? [{ tag: makeTag() }],
  } satisfies FullRecipeFixture;
}
