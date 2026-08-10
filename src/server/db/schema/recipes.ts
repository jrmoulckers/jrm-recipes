import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { fk, pk, softDelete, timestamps } from "./_shared";
import { users } from "./users";
import { groups } from "./groups";
import { comments, ratings, recipeTags } from "./engagement";
import { foodItems } from "./ingredients";
import { reviews } from "./reviews";
import type { RecipeInput } from "~/server/recipes/validation";

export const recipeVisibility = pgEnum("recipe_visibility", [
  "private",
  "group",
  "unlisted",
  "public",
]);

export const recipeStatus = pgEnum("recipe_status", ["draft", "published"]);

export const recipeDifficulty = pgEnum("recipe_difficulty", [
  "easy",
  "medium",
  "hard",
]);

/**
 * Kinds of milestone recorded on a recipe's timeline. `adapted` marks both
 * sides of a fork (the new recipe's origin and the source's new descendant).
 * `suggestion_applied` marks a family suggestion the owner folded in place,
 * attributed to the contributor who proposed it.
 */
export const recipeEventType = pgEnum("recipe_event_type", [
  "created",
  "adapted",
  "updated",
  "published",
  "suggestion_applied",
]);

/** The core recipe record. */
export const recipes = pgTable(
  "recipes",
  {
    id: pk(),
    slug: varchar({ length: 96 }).notNull(),
    title: varchar({ length: 200 }).notNull(),
    description: text(),
    coverImageUrl: varchar({ length: 2048 }),

    // `restrict`, not `cascade` (issue #678). Account erasure has to destroy the
    // Cloudinary bytes and reassign or delete co-created recipes *before* any
    // row disappears; a cascade would silently pull the recipes out from under
    // that logic. Restricting makes an unhandled dependency a loud failure
    // instead of irreversible data loss, and `deleteUserAccount` is responsible
    // for deleting these rows in the right order.
    authorId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    groupId: fk().references(() => groups.id, { onDelete: "set null" }),

    visibility: recipeVisibility().notNull().default("private"),
    status: recipeStatus().notNull().default("draft"),

    servings: integer().default(4),
    servingsNoun: varchar({ length: 40 }).default("servings"),
    prepMinutes: integer(),
    cookMinutes: integer(),
    totalMinutes: integer(),
    // Inactive / hands-off time. Overnight ferments, brines, chilling, resting
    // (#409). Kept separate from prep/cook so "30 min work, 12 h waiting" reads
    // honestly and totals can split active vs total. `makeAheadNote` is a short
    // free-text callout ("Make the dough a day ahead").
    restMinutes: integer(),
    makeAheadNote: varchar({ length: 500 }),
    // Required tools/equipment (#410), stored as a simple ordered text[] (NULL
    // when none). A Dutch oven, bench scraper, probe thermometer, etc. Optional
    // so existing recipes are unaffected.
    equipment: text().array(),
    difficulty: recipeDifficulty(),
    cuisine: varchar({ length: 80 }),

    // Structured, author-declared dietary flags (issue #404), stored as the
    // canonical `DietaryTag` strings (vegan, vegetarian, dairy-free,
    // gluten-free, egg-free). Separate from free-text `tags` so "safe for"
    // filtering and badges have a trustworthy source. NULL/empty means the
    // author made no declaration (not "unsafe").
    dietaryFlags: text().array(),

    // DERIVED dietary tags computed from the recipe's ingredients on every
    // create/update (issue #273). Holds ONLY the three reliably-detectable
    // "-free" tags, dairy-free, gluten-free, egg-free, via allergen detection
    // (see src/lib/dietary-derive.ts). vegan/vegetarian are intentionally NOT
    // derived here (the allergen KB can't see meat), so they come only from the
    // author-declared `dietaryFlags` above. Search matches the UNION of the two
    // columns. NULL/empty means "nothing derivable" (e.g. no ingredient data).
    dietaryTags: text().array(),

    sourceName: varchar({ length: 200 }),
    sourceUrl: varchar({ length: 2048 }),
    notes: text(),

    // "Story & memories" (issue #377): free-text heritage. Who a recipe came
    // from, when it's made, what it means. Kept distinct from the practical
    // `notes` (cooking tips) so the *why* is preserved next to the *how* and can
    // be given its own warm section on the recipe page. NULL/empty means untold.
    story: text(),

    // Heirloom provenance (issue #381): short, structured family attribution,
    // distinct from the web `sourceName`/`sourceUrl`. "Handed down from
    // Great-Grandma Rosa · since the 1930s · Calabria". Displayed as a small
    // badge/line. All optional. Era is free-text ("1935" or "1930s").
    handedDownFrom: varchar({ length: 200 }),
    originYear: varchar({ length: 40 }),
    originPlace: varchar({ length: 200 }),

    // Unguessable share-link controls for `unlisted` recipes (issues #204/#207).
    // Anonymous viewers can reach an unlisted recipe ONLY via this high-entropy
    // token (served at /r/<shareToken>), never the guessable title-slug.
    // `shareLinkEnabled` lets an owner revoke a leaked link without unsharing the
    // recipe entirely. `shareTokenRotatedAt` records the last rotation. A NULL
    // token means no share link has been minted yet.
    shareToken: varchar({ length: 32 }),
    shareLinkEnabled: boolean().notNull().default(true),
    shareTokenRotatedAt: timestamp({ withTimezone: true }),

    // Optional per-serving nutrition (issue #414). All nullable. A recipe may
    // carry none, some, or all of these. Energy in kcal and sodium in mg are
    // whole numbers (integer). Macronutrients are grams and may be fractional
    // (real). Non-negativity is enforced by CHECK constraints below, mirroring
    // the Zod `nutritionInput` bounds in src/server/recipes/validation.ts.
    calories: integer(),
    proteinGrams: real(),
    carbsGrams: real(),
    fatGrams: real(),
    saturatedFatGrams: real(),
    sodiumMg: integer(),
    sugarGrams: real(),
    fiberGrams: real(),

    // Adaptations / timelines. Nullable self-reference to the recipe this was
    // forked from. On parent deletion the fork survives as an original.
    forkedFromId: fk().references((): AnyPgColumn => recipes.id, {
      onDelete: "set null",
    }),
    forkNote: varchar({ length: 300 }),

    publishedAt: timestamp({ withTimezone: true }),
    // Denormalized, owner-excluded rating aggregates (issue #154). Maintained
    // transactionally by the rating mutations (setRating/removeRating) and read
    // directly by list/feed cards + the top-rated ordering, so a feed never has
    // to pull every `ratings` row just to show a count + average. `ratingAvg` is
    // derived (`ratingSum / ratingCount`) rather than stored to avoid rounding
    // drift. Owners can't rate their own recipe, so these never count self-votes.
    ratingCount: integer().notNull().default(0),
    ratingSum: integer().notNull().default(0),
    // Soft-delete (issue #165): deleting a recipe tombstones it instead of
    // cascading away its versions/events/ratings/comments, so family history
    // survives and an owner can restore it. Children stay, hidden via the parent.
    ...softDelete(() => users.id),
    ...timestamps(),
  },
  (t) => [
    // Every recipe read path filters `deleted_at IS NULL` (issue #165), so the
    // hot lookup indexes are partial: they stay small and never scan tombstones.
    index("recipes_author_idx")
      .on(t.authorId)
      .where(sql`${t.deletedAt} is null`),
    index("recipes_group_idx")
      .on(t.groupId)
      .where(sql`${t.deletedAt} is null`),
    index("recipes_visibility_idx")
      .on(t.visibility)
      .where(sql`${t.deletedAt} is null`),
    // Slugs are public lookup keys, but they are namespaced by their author
    // (issue #666): the canonical URL is /recipes/<user slug>/<recipe slug>, so
    // two cooks can each hold `blueberry-muffins`. Uniqueness is therefore
    // per-author, not global. The constraint's btree also backs the namespaced
    // lookup, so no separate non-unique index is needed. Legacy flat
    // /recipes/<slug> links keep resolving through `recipe_slug_aliases`, whose
    // migration-seeded rows preserve every pre-namespacing global slug.
    unique("recipes_author_slug_uq").on(t.authorId, t.slug),
    // Share tokens are the confidentiality secret for unlisted recipes
    // (issues #204/#207), so they must be globally unique. The constraint's
    // btree also backs the /r/<token> lookup. Multiple NULLs are allowed
    // (Postgres), so recipes without a minted link don't collide.
    unique("recipes_share_token_uq").on(t.shareToken),
    index("recipes_forked_from_idx").on(t.forkedFromId),
    // Non-negative time/serving invariants mirroring Zod (`recipeInput` in
    // src/server/recipes/validation.ts: servings min 1, minutes min 0). These
    // columns are nullable, so a NULL value passes the check by SQL semantics.
    check("recipes_servings_check", sql`${t.servings} >= 1`),
    check("recipes_prep_minutes_check", sql`${t.prepMinutes} >= 0`),
    check("recipes_cook_minutes_check", sql`${t.cookMinutes} >= 0`),
    check("recipes_total_minutes_check", sql`${t.totalMinutes} >= 0`),
    // Inactive/rest time is non-negative too (#409). NULL passes by SQL semantics.
    check("recipes_rest_minutes_check", sql`${t.restMinutes} >= 0`),
    // Denormalized rating aggregates can never be negative (issue #154). The
    // migration backfills them and the mutations only ever += / -= real votes.
    check("recipes_rating_count_check", sql`${t.ratingCount} >= 0`),
    check("recipes_rating_sum_check", sql`${t.ratingSum} >= 0`),
    // Per-serving nutrition is non-negative (issue #414). NULLs pass by SQL
    // semantics, matching the "optional" Zod bounds.
    check("recipes_calories_check", sql`${t.calories} >= 0`),
    check("recipes_protein_grams_check", sql`${t.proteinGrams} >= 0`),
    check("recipes_carbs_grams_check", sql`${t.carbsGrams} >= 0`),
    check("recipes_fat_grams_check", sql`${t.fatGrams} >= 0`),
    check(
      "recipes_saturated_fat_grams_check",
      sql`${t.saturatedFatGrams} >= 0`,
    ),
    check("recipes_sodium_mg_check", sql`${t.sodiumMg} >= 0`),
    check("recipes_sugar_grams_check", sql`${t.sugarGrams} >= 0`),
    check("recipes_fiber_grams_check", sql`${t.fiberGrams} >= 0`),
  ],
);

/**
 * Full-text search (issue #158) is intentionally NOT modelled as Drizzle columns
 * or indexes here. The FTS migration hand-adds:
 *   - a generated, STORED `tsvector` column `recipes.search_vector`
 *     (`setweight` A/B/C over title/description/cuisine, `english` config) with a
 *     GIN index, queried via `search_vector @@ websearch_to_tsquery(...)` in
 *     `searchRecipes` (see `recipeSearchMatchSql`), and
 *   - `pg_trgm` GIN indexes on `recipe_ingredients.item` and `tags.name` so the
 *     substring `ILIKE '%q%'` fallbacks are index-backed instead of seq scans.
 * Keeping these untracked (like the `pg_trgm` extension itself) avoids
 * drizzle-kit generated-column/opclass drift while still enforcing them in the
 * database. Nothing in the app SELECTs `search_vector`, so the ORM never needs
 * to know it exists.
 */

/** One ingredient line. `quantity`/`quantityMax` are numeric so we can scale. */
export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: pk(),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer().notNull().default(0),
    section: varchar({ length: 120 }),
    quantity: doublePrecision(),
    quantityMax: doublePrecision(),
    unit: varchar({ length: 40 }),
    item: varchar({ length: 300 }).notNull(),
    note: varchar({ length: 300 }),
    // Write-time link to the canonical food graph node this line resolves to
    // (nullable, best-effort). Populated by the server-side resolver in
    // `resolve-food.ts` on every recipe write. NULL when the free-text `item`
    // doesn't resolve to a known food. `set null` so deleting a food node
    // detaches the link without touching the ingredient line.
    foodId: fk().references(() => foodItems.id, { onDelete: "set null" }),
    // Structured prep state. "Softened", "finely diced", "room temperature"
    // (#401). Separate from free-text `note` so it can be emphasized, pulled
    // into a mise en place list, and shown distinctly in Cook Mode.
    prep: varchar({ length: 200 }),
    // Optional link to the step that uses this ingredient (#425), by the step's
    // ordinal position. Positional (not a step id) because steps are rewritten
    // wholesale on every edit. NULL keeps the ingredient in the overall list only.
    stepPosition: integer(),
    optional: boolean().notNull().default(false),
  },
  (t) => [
    index("recipe_ingredients_recipe_idx").on(t.recipeId, t.position),
    // Covering index for the `food_items` FK (issue #153 convention): the
    // reverse lookup "ingredient lines for a food" and the `set null` cascade
    // both scan by `foodId`.
    index("recipe_ingredients_food_idx").on(t.foodId),
    // Non-negative quantities. A range's upper bound can't fall below its lower
    // bound. Mirrors `ingredientInput` (min 0) in src/server/recipes/validation.ts.
    check("recipe_ingredients_quantity_check", sql`${t.quantity} >= 0`),
    check("recipe_ingredients_quantity_max_check", sql`${t.quantityMax} >= 0`),
    check(
      "recipe_ingredients_quantity_range_check",
      sql`${t.quantityMax} is null or ${t.quantity} is null or ${t.quantityMax} >= ${t.quantity}`,
    ),
    // A step link, when present, points at a non-negative step ordinal (#425).
    check(
      "recipe_ingredients_step_position_check",
      sql`${t.stepPosition} is null or ${t.stepPosition} >= 0`,
    ),
  ],
);

/** One instruction step, optionally timed and with its own media. */
export const recipeSteps = pgTable(
  "recipe_steps",
  {
    id: pk(),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer().notNull().default(0),
    section: varchar({ length: 120 }),
    // Optional short title/name for a single step ("Make the dough"), distinct
    // from `section` (the phase/group heading shared by several steps).
    title: varchar({ length: 200 }),
    instruction: text().notNull(),
    imageUrl: varchar({ length: 2048 }),
    videoUrl: varchar({ length: 2048 }),
    timerSeconds: integer(),
    // Target internal / doneness temperature in Celsius (#417). The truth a
    // timer only approximates ("crumb at 96°C", "chicken at 74°C"). Stored in °C
    // and converted for display to honor the cook's °F/°C choice. `doneness` is
    // a short visual cue ("deep golden, springs back") for when temp isn't apt.
    targetTempC: integer(),
    doneness: varchar({ length: 200 }),
    // Techniques referenced in this step (Phase 3 "learn to cook" tutor).
    techniques: text().array(),
  },
  (t) => [
    index("recipe_steps_recipe_idx").on(t.recipeId, t.position),
    // A step timer can't run negative. Mirrors `stepInput.timerSeconds` (min 0).
    check("recipe_steps_timer_seconds_check", sql`${t.timerSeconds} >= 0`),
  ],
);

/**
 * Immutable snapshots capturing how a recipe evolved over time (Phase 2
 * timelines). Schema is present now so edits can be journaled from day one.
 */
export const recipeVersions = pgTable(
  "recipe_versions",
  {
    id: pk(),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    versionNumber: integer().notNull().default(1),
    label: varchar({ length: 200 }),
    summary: varchar({ length: 500 }),
    // The full RecipeInput at save time, stored as `jsonb` so Postgres validates
    // the JSON structurally and future timeline/diff features can query inside a
    // snapshot. `parseSnapshot` still Zod-validates the *shape* on read.
    snapshot: jsonb().$type<RecipeInput>().notNull(),
    authorId: fk().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // (recipe_id, version_number) is unique at the DB level (issue #151). Version
    // numbers are allocated as max+1, but READ COMMITTED lets two concurrent edits
    // read the same max and write the same number. The constraint makes the DB the
    // arbiter. Its btree also backs the version-ordered history reads that the old
    // non-unique `recipe_versions_recipe_idx` used to serve.
    unique("recipe_versions_recipe_version_uq").on(t.recipeId, t.versionNumber),
    // Covering index for the authorId foreign key (issue #153): the
    // `ON DELETE set null` on user delete otherwise scans every version row.
    index("recipe_versions_author_idx").on(t.authorId),
  ],
);

/**
 * Append-only log of milestones in a recipe's life (created, adapted, edited,
 * published). Powers the "family history" timeline. `relatedRecipeId` links the
 * two halves of a fork: on the new recipe it points back to the source. On the
 * source it points forward to the adaptation.
 */
export const recipeEvents = pgTable(
  "recipe_events",
  {
    id: pk(),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    actorId: fk().references(() => users.id, { onDelete: "set null" }),
    type: recipeEventType().notNull(),
    note: text(),
    relatedRecipeId: fk().references((): AnyPgColumn => recipes.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("recipe_events_recipe_idx").on(t.recipeId, t.createdAt),
    // Covering indexes for the actorId + relatedRecipeId foreign keys (issue
    // #153): the actor `ON DELETE set null` cascade and the fork back-link
    // lookup (events pointing at a related recipe) otherwise scan the log.
    index("recipe_events_actor_idx").on(t.actorId),
    index("recipe_events_related_idx").on(t.relatedRecipeId),
  ],
);

/**
 * Permanent history of every recipe slug ever published in a namespace
 * (issue #666).
 *
 * Two jobs, both about links outliving edits:
 *
 *   1. **Rename retention.** Renaming a recipe now regenerates its slug, so the
 *      outgoing slug is retained here and 308-redirects to the new canonical
 *      URL. Nothing a family member ever shared dead-ends.
 *   2. **Legacy flat URLs.** `legacy` rows are seeded by the namespacing
 *      migration from the pre-namespacing globally-unique `recipes.slug`, so
 *      `/recipes/blueberry-muffins` keeps resolving after the canonical URL
 *      becomes `/recipes/<cook>/blueberry-muffins`. Because the source column
 *      was globally unique, a partial unique index over `legacy` rows keeps that
 *      flat lookup unambiguous forever.
 *
 * An alias counts as *occupied* when allocating a new slug (see `uniqueSlug`),
 * which is the rule that keeps redirects honest: a released slug can never be
 * re-claimed by a different recipe, so an old link can never silently start
 * resolving to someone else's content. Redirects are still issued only after the
 * viewer passes `canView`, so an alias never reveals a recipe they can't see.
 */
export const recipeSlugAliases = pgTable(
  "recipe_slug_aliases",
  {
    id: pk(),
    // The namespace the alias lives in. Denormalized from the recipe's author so
    // uniqueness is enforceable per-namespace by the DB.
    ownerId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: varchar({ length: 96 }).notNull(),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    legacy: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("recipe_slug_aliases_owner_slug_uq").on(t.ownerId, t.slug),
    uniqueIndex("recipe_slug_aliases_legacy_slug_uq")
      .on(t.slug)
      .where(sql`${t.legacy}`),
    index("recipe_slug_aliases_recipe_idx").on(t.recipeId),
  ],
);

export const recipeSlugAliasesRelations = relations(
  recipeSlugAliases,
  ({ one }) => ({
    recipe: one(recipes, {
      fields: [recipeSlugAliases.recipeId],
      references: [recipes.id],
    }),
    owner: one(users, {
      fields: [recipeSlugAliases.ownerId],
      references: [users.id],
    }),
  }),
);

/**
 * Role a non-owner creator holds on a recipe (issue #668).
 *
 * `owner` is deliberately **absent**. The owner is `recipes.authorId` and never
 * has a row here: that FK is `notNull`, so exactly one owner is guaranteed for
 * the life of the recipe, and a second representation of the same fact could
 * only ever drift out of step with it. This table is strictly additive on top of
 * a guaranteed owner.
 */
export const recipeCreatorRole = pgEnum("recipe_creator_role", ["creator"]);

/**
 * Whether a creator invitation has been taken up (issue #668).
 *
 * `pending` grants **nothing**: no access, no slug, no URL. Only `accepted`
 * rows are ever consulted by `canView`, by write-access checks, or by URL
 * resolution. Being invited is not the same as being a creator, because adding
 * someone publishes a recipe under *their* public namespace — it changes their
 * identity, not just their permissions, so it needs their consent too.
 */
export const recipeCreatorStatus = pgEnum("recipe_creator_status", [
  "pending",
  "accepted",
]);

/**
 * Co-creators of a recipe, and the slug the recipe answers on inside each of
 * their namespaces (issue #668).
 *
 * A recipe with creators resolves under every accepted creator's namespace as
 * well as its owner's: `/recipes/jrmoulckers/blueberry-muffins` *and*
 * `/recipes/john/blueberry-muffins` are the same document. The owner's path is
 * canonical; creator paths render with `rel=canonical` pointing at it.
 *
 * `slug` is allocated **per namespace, on accept**, not copied from the owner's.
 * John may already hold `blueberry-muffins`, so his entry for someone else's
 * recipe perturbs within his own namespace (`blueberry-muffins-2k9x`) and never
 * disturbs the owner's slug. It is also deliberately *not* re-slugged when the
 * owner renames the recipe: a creator's URL is stable once allocated, which
 * keeps rename O(1) instead of writing an alias per creator.
 *
 * ## Removal frees the slug and leaves no alias
 *
 * This is a deliberate exception to the alias-permanence rule that governs
 * {@link recipeSlugAliases}, and the difference is a trust boundary. A rename
 * alias stays *within one owner*: the same person still holds the recipe, so the
 * redirect is honest and permanent retention costs nothing. A removed creator's
 * alias would instead point across a relationship that was just revoked, and
 * would either leak the recipe's continued existence and current canonical URL
 * to anyone holding the old link, or permanently burn a slug in the ex-creator's
 * own namespace as a side effect of losing access. Removal therefore hard-stops:
 * the row is deleted, no alias is written, the slug is immediately free again,
 * and the path 404s exactly as if it had never resolved. Anything less means
 * removal does not actually revoke.
 *
 * No ambiguity is introduced by freeing it. The alias-occupancy rule exists so a
 * released slug can't start resolving to *someone else's* content; here the only
 * party who can re-claim the freed slug is the ex-creator themselves, inside
 * their own namespace.
 */
export const recipeCreators = pgTable(
  "recipe_creators",
  {
    id: pk(),
    recipeId: fk()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: recipeCreatorRole().notNull().default("creator"),
    status: recipeCreatorStatus().notNull().default("pending"),
    // NULL until accepted. Allocated inside the accepting transaction against
    // the *invitee's* namespace. See `uniqueSlug` in server/recipes/mutations.ts.
    slug: varchar({ length: 96 }),
    // Who extended the invitation. Always the owner at invite time; retained for
    // audit even if they later transfer or delete the account.
    invitedById: fk().references(() => users.id, { onDelete: "set null" }),
    invitedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    // One invitation/membership per person per recipe. Re-inviting someone who
    // is already pending or accepted must collide rather than stack up rows.
    unique("recipe_creators_recipe_user_uq").on(t.recipeId, t.userId),
    // A creator's slug is unique inside their own namespace. Postgres treats
    // NULLs as distinct, so the many `pending` rows (slug NULL) never collide —
    // exactly the intent, since a pending invite occupies nothing.
    //
    // This constraint alone is NOT sufficient for namespace uniqueness: a
    // namespace is shared with the user's own live recipes and retained aliases,
    // which carry their own separate constraints, and Postgres has no
    // cross-table unique. `slugTaken` closes that gap by taking a per-namespace
    // advisory lock before probing all three.
    unique("recipe_creators_user_slug_uq").on(t.userId, t.slug),
    // Resolution reads `(userId, slug)` — covered by the unique above. These two
    // back the reverse lookups: "recipes I co-create" and "who co-creates this".
    // Partial on `accepted` because every access path filters on it, so pending
    // invitations never bloat the hot indexes.
    index("recipe_creators_user_idx")
      .on(t.userId)
      .where(sql`${t.status} = 'accepted'`),
    index("recipe_creators_recipe_idx")
      .on(t.recipeId)
      .where(sql`${t.status} = 'accepted'`),
    // Covering index for the `invitedById` FK (issue #153).
    index("recipe_creators_invited_by_idx").on(t.invitedById),
    // The status/slug invariant, enforced by the DB rather than trusted from the
    // mutation layer: an accepted row always holds a namespace slug and an
    // acceptance timestamp, and a pending row holds neither. This is what makes
    // "pending grants nothing" checkable rather than merely intended.
    check(
      "recipe_creators_status_check",
      sql`(${t.status} = 'accepted' and ${t.slug} is not null and ${t.acceptedAt} is not null) or (${t.status} = 'pending' and ${t.slug} is null and ${t.acceptedAt} is null)`,
    ),
  ],
);

export const recipeCreatorsRelations = relations(recipeCreators, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeCreators.recipeId],
    references: [recipes.id],
  }),
  user: one(users, {
    fields: [recipeCreators.userId],
    references: [users.id],
    relationName: "recipeCreator",
  }),
  invitedBy: one(users, {
    fields: [recipeCreators.invitedById],
    references: [users.id],
    relationName: "recipeCreatorInviter",
  }),
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  author: one(users, {
    fields: [recipes.authorId],
    references: [users.id],
  }),
  group: one(groups, {
    fields: [recipes.groupId],
    references: [groups.id],
  }),
  forkedFrom: one(recipes, {
    fields: [recipes.forkedFromId],
    references: [recipes.id],
    relationName: "adaptations",
  }),
  adaptations: many(recipes, { relationName: "adaptations" }),
  ingredients: many(recipeIngredients),
  steps: many(recipeSteps),
  versions: many(recipeVersions),
  events: many(recipeEvents, { relationName: "recipeEvents" }),
  eventsAbout: many(recipeEvents, { relationName: "relatedRecipeEvents" }),
  tags: many(recipeTags),
  ratings: many(ratings),
  comments: many(comments),
  reviews: many(reviews),
  slugAliases: many(recipeSlugAliases),
  creators: many(recipeCreators),
}));

export const recipeIngredientsRelations = relations(
  recipeIngredients,
  ({ one }) => ({
    recipe: one(recipes, {
      fields: [recipeIngredients.recipeId],
      references: [recipes.id],
    }),
  }),
);

export const recipeStepsRelations = relations(recipeSteps, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeSteps.recipeId],
    references: [recipes.id],
  }),
}));

export const recipeVersionsRelations = relations(recipeVersions, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeVersions.recipeId],
    references: [recipes.id],
  }),
  author: one(users, {
    fields: [recipeVersions.authorId],
    references: [users.id],
  }),
}));

export const recipeEventsRelations = relations(recipeEvents, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeEvents.recipeId],
    references: [recipes.id],
    relationName: "recipeEvents",
  }),
  related: one(recipes, {
    fields: [recipeEvents.relatedRecipeId],
    references: [recipes.id],
    relationName: "relatedRecipeEvents",
  }),
  actor: one(users, {
    fields: [recipeEvents.actorId],
    references: [users.id],
  }),
}));

export type Recipe = typeof recipes.$inferSelect;
export type NewRecipe = typeof recipes.$inferInsert;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type NewRecipeIngredient = typeof recipeIngredients.$inferInsert;
export type RecipeStep = typeof recipeSteps.$inferSelect;
export type NewRecipeStep = typeof recipeSteps.$inferInsert;
export type RecipeEvent = typeof recipeEvents.$inferSelect;
export type NewRecipeEvent = typeof recipeEvents.$inferInsert;
export type RecipeSlugAlias = typeof recipeSlugAliases.$inferSelect;
export type NewRecipeSlugAlias = typeof recipeSlugAliases.$inferInsert;
export type RecipeCreator = typeof recipeCreators.$inferSelect;
export type NewRecipeCreator = typeof recipeCreators.$inferInsert;
export type RecipeCreatorRole = (typeof recipeCreatorRole.enumValues)[number];
export type RecipeCreatorStatus =
  (typeof recipeCreatorStatus.enumValues)[number];
export type RecipeEventType = (typeof recipeEventType.enumValues)[number];
export type RecipeVisibility = (typeof recipeVisibility.enumValues)[number];
export type RecipeStatus = (typeof recipeStatus.enumValues)[number];
export type RecipeDifficulty = (typeof recipeDifficulty.enumValues)[number];
