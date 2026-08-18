import 'server-only';

import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';

import { db } from '~/server/db';
import { DomainError } from '~/server/errors';
import {
  groupMembers,
  recipeCreators,
  recipeEvents,
  recipeIngredients,
  recipeSlugAliases,
  recipeSteps,
  recipeTags,
  recipeVersions,
  recipes,
  tags,
  users,
  type RecipeEventType,
  type User,
} from '~/server/db/schema';
import { canonicalizeTag } from '~/lib/tag-taxonomy';
import { deriveDietaryTags } from '~/lib/dietary-derive';
import { AuditAction, recordAudit } from '~/server/audit';
import { assertKidAllowed } from '~/server/groups/kid-safe';
import { resolveFoodIds } from '~/server/db/resolve-food';
import { isReservedRecipeSlug } from '~/lib/recipe-reserved-slugs';
import { recipeSlug, type RecipeInput } from './validation';
import { generateShareToken } from './share-token';
import { parseSnapshot } from './queries';
import { buildAdaptationInput } from './timeline';
import { invalidateNutritionCache } from './nutrition-cache';
import { refreshRecipeNutritionCache } from './nutrition';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Postgres `unique_violation` SQLSTATE. */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * DB-level unique constraints that make a recipe slug unique within its author's
 * namespace (see schema/recipes.ts). Both matter, because an alias counts as
 * occupied.
 */
const RECIPES_SLUG_CONSTRAINT = 'recipes_author_slug_uq';
const RECIPE_SLUG_ALIAS_CONSTRAINT = 'recipe_slug_aliases_owner_slug_uq';
const RECIPE_CREATOR_SLUG_CONSTRAINT = 'recipe_creators_user_slug_uq';

/**
 * Advisory-lock class for per-namespace slug allocation (issue #668).
 *
 * Postgres advisory locks share one global space, so the two-argument form is
 * used with this constant as the class id to keep these locks from colliding
 * with any other advisory lock the app might take later. The object id is
 * `hashtext(ownerId)`.
 *
 * A `hashtext` collision between two different namespaces is **benign, and must
 * stay that way**: it makes two unrelated users' allocations serialize against
 * each other, which costs a little throughput and nothing else. The failure
 * direction matters — collisions can only ever over-serialize, never
 * under-lock, so they cannot produce a duplicate slug. That rests on `hashtext`
 * being IMMUTABLE (`hashtext(text) -> integer`, so it also fills the int4 slot
 * exactly): the same owner always maps to the same key, so a lock can be shared
 * but never missed.
 *
 * That reasoning covers collisions only. There is one way to under-lock here,
 * and it is total rather than partial: **a NULL `ownerId` takes no lock at all.**
 * `hashtext` and every `pg_advisory_xact_lock` overload are STRICT, so the call
 * collapses to a NULL result, holds zero locks, and raises nothing — leaving the
 * three probes below completely unserialized. Not reachable today, because
 * `recipes.authorId` is `notNull` (see schema/recipes.ts) and every caller passes
 * a `string`; recorded because TypeScript is erased before this query runs, and
 * the identically named `recipe_versions.authorId` *is* nullable, so a future
 * author can have a nullable `authorId` in view while reading this comment. If
 * this ever takes an owner id that TypeScript cannot prove non-null, assert it
 * here rather than trusting the signature.
 *
 * ## Do not widen this key (issue #712)
 *
 * The tempting "fix" for collisions is a wider key, via the one-argument
 * `pg_advisory_xact_lock(bigint)` form. **That is not a wider version of this
 * lock, it is a different lock.** The one- and two-argument forms occupy
 * separate key spaces, even for identical bits: in `pg_locks` the one-argument
 * form lands at `objsubid = 1` and the two-argument form at `objsubid = 2`, with
 * the same `classid`/`objid`.
 *
 * Verified across two sessions, in both directions, each with a control (issue
 * #734). With one session holding the two-argument lock on `(668, 1)`, another
 * session sees:
 *
 *     pg_try_advisory_xact_lock(668, 1)                  -> f   (control)
 *     pg_try_advisory_xact_lock((668::bigint << 32) | 1) -> t   (not excluded)
 *
 * and with the one-argument lock held, the two results swap. Test it this way if
 * you revisit it: acquiring both forms in a *single* session proves nothing,
 * because advisory locks are re-entrant and the same key taken twice also
 * returns `t, t`. Only a second session can observe exclusion, and only the
 * control shows that a failing result was reachable.
 *
 * Switching forms therefore fails *silently*: across a rolling deploy, an
 * instance on each form would both believe they hold the namespace, `slugTaken`
 * would race between the three tables again, and — since no constraint spans
 * them — nothing would raise and {@link withSlugConflictRetry} would never fire.
 * That is the exact duplicate-slug bug this lock exists to prevent.
 *
 * Narrowing, by contrast, is safe to attempt: Postgres never truncates into
 * int4 silently. Overload resolution, an explicit `::int`, and
 * `hashtextextended(...)::int` all raise instead.
 *
 * ## Do not drop `xact` from the function name (issue #740)
 *
 * Widening and NULL are both about *which key* is taken. There is a third axis,
 * *how long it is held*, and it fails in the opposite direction: not "no lock
 * taken", but **a lock taken and never given back, which degrades to no lock at
 * all on the connection that matters.**
 *
 * `pg_advisory_xact_lock` -> `pg_advisory_lock` is a five-character edit. Both
 * overloads exist, both take `(int, int)`, and the session-scoped form is the
 * one most examples show. It type-checks and every behavioural test passes.
 *
 * It locks correctly. It never releases: session-scoped locks outlive `COMMIT`
 * and are freed only by explicit unlock or disconnect. `server/db/index.ts`
 * reuses connections (`max: 1` in production, cached across HMR in dev, for
 * Neon/PgBouncer transaction pooling), so the leak lands on a long-lived
 * connection — and because advisory locks are re-entrant, *that same connection
 * re-acquires the key successfully every time*. The lock keeps reporting
 * success while providing no mutual exclusion at all, and `slugTaken` probes
 * the three tables unserialized. Every other connection, meanwhile, blocks on a
 * lock whose transaction committed long ago.
 *
 * Measured on `postgres:16` (issue #740), one connection, sequential
 * transactions:
 *
 *     begin; select pg_advisory_lock(668,1); commit;
 *     select count(*) from pg_locks where locktype='advisory';  -> 1  (survived)
 *     begin; select pg_try_advisory_lock(668,1); commit;        -> t  (silent)
 *
 * and from a second connection while that holder sits idle post-`COMMIT`:
 * `pg_try_advisory_lock(668,1)` -> `f`, against a control on an unrelated key
 * -> `t`. With the `xact` form, `pg_locks` is empty after `COMMIT` instead.
 *
 * `hashtext` itself is not part of the documented PostgreSQL API and carries no
 * cross-version compatibility guarantee. That is harmless here only because a
 * lock key is never persisted or compared across servers — it is computed, used
 * within one transaction, and discarded. Do not store one.
 */
const SLUG_NAMESPACE_LOCK_CLASS = 668;

/** DB-level unique constraint on `recipe_versions (recipe_id, version_number)`. */
const RECIPE_VERSIONS_VERSION_CONSTRAINT = 'recipe_versions_recipe_version_uq';

/** Max attempts for a create/fork that races another writer for the same slug. */
const MAX_SLUG_ATTEMPTS = 5;

/** Max attempts to allocate a version number that races a concurrent edit. */
const MAX_VERSION_ATTEMPTS = 5;

/**
 * True when `err` is a Postgres unique-violation on `constraint`. The `postgres`
 * driver exposes `.code` and `.constraint`. We fall back to the constraint name
 * embedded in the message, and unwrap a single `cause` level in case an
 * intermediate layer rewraps the driver error.
 */
function matchesUniqueViolation(err: unknown, constraint: string): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as {
    code?: unknown;
    constraint?: unknown;
    constraint_name?: unknown;
    message?: unknown;
    cause?: unknown;
  };
  if (e.code === PG_UNIQUE_VIOLATION) {
    const name = e.constraint ?? e.constraint_name;
    if (name === constraint) return true;
    if (name == null && typeof e.message === 'string') return e.message.includes(constraint);
    return false;
  }
  if (e.cause != null && e.cause !== err) return matchesUniqueViolation(e.cause, constraint);
  return false;
}

/**
 * True when `err` is a Postgres unique-violation on any of the three structures
 * that make a recipe slug unique in its namespace. {@link uniqueSlug} pre-checks
 * for a free slug, but two concurrent transactions can both pass that check and
 * only collide at COMMIT-time on the DB constraint. That lost race surfaces here
 * so callers can retry.
 */
export function isSlugConflict(err: unknown): boolean {
  return (
    matchesUniqueViolation(err, RECIPES_SLUG_CONSTRAINT) ||
    matchesUniqueViolation(err, RECIPE_SLUG_ALIAS_CONSTRAINT) ||
    matchesUniqueViolation(err, RECIPE_CREATOR_SLUG_CONSTRAINT)
  );
}

/**
 * True when `err` is a Postgres unique-violation on the
 * `recipe_versions (recipe_id, version_number)` constraint, i.e. two edits
 * raced for the same version number (issue #151). {@link journal} retries.
 */
export function isVersionConflict(err: unknown): boolean {
  return matchesUniqueViolation(err, RECIPE_VERSIONS_VERSION_CONSTRAINT);
}

/**
 * Run a write that may collide on the per-author recipe slug constraints,
 * retrying the whole operation on conflict. Because each attempt is a fresh
 * transaction, the retry re-runs {@link uniqueSlug} against newly-committed
 * rows, so the DB constraint, not the app-side loop, is the source of truth.
 */
export async function withSlugConflictRetry<T>(op: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await op();
    } catch (err) {
      if (attempt < MAX_SLUG_ATTEMPTS && isSlugConflict(err)) continue;
      throw err;
    }
  }
}

/** Append a milestone to a recipe's timeline. Best-effort, never blocks. */
async function recordEvent(
  tx: Tx,
  event: {
    recipeId: string;
    actorId: string | null;
    type: RecipeEventType;
    note?: string | null;
    relatedRecipeId?: string | null;
  },
): Promise<void> {
  await tx.insert(recipeEvents).values({
    recipeId: event.recipeId,
    actorId: event.actorId,
    type: event.type,
    note: event.note ?? null,
    relatedRecipeId: event.relatedRecipeId ?? null,
  });
}

/**
 * Whether `candidate` is already spoken for in `ownerId`'s namespace: held by
 * one of their live recipes, retained as one of their aliases, allocated to a
 * recipe they co-create, or reserved for a static route.
 *
 * Aliases count as taken (issue #666). That is the rule that keeps redirects
 * honest: if a released slug could be re-claimed by a different recipe, every
 * old link bearing it would start resolving to unrelated content.
 *
 * A candidate that {@link isReservedRecipeSlug reserved-slugs.ts} flags is
 * treated as unavailable, even when no row holds it: those bases (`new`,
 * `tags`, `cook-with`) collide with static sibling routes under `/recipes/*`,
 * so a recipe assigned one would be unreachable at its legacy flat URL. We
 * perturb past them exactly like a taken slug, yielding e.g. `new-2ab`.
 *
 * ## Why this takes a lock (issue #668)
 *
 * A namespace is now shared by three kinds of occupant — live recipes, retained
 * aliases, and accepted co-creator entries — each protected by its *own* unique
 * constraint (`recipes_author_slug_uq`, `recipe_slug_aliases_owner_slug_uq`,
 * `recipe_creators_user_slug_uq`). Postgres has no cross-table unique, so no
 * constraint spans them: a transaction accepting a creator invitation and a
 * transaction creating a recipe can both probe a candidate as free and both
 * commit it, in different tables. Neither violates its own constraint, so
 * nothing raises and {@link withSlugConflictRetry} never fires — the namespace
 * silently ends up with a duplicate the URL resolver cannot disambiguate.
 *
 * A transaction-scoped advisory lock on the namespace closes that window by
 * serializing allocations within a single user's namespace, which is the only
 * scope where the race exists. It is taken *here*, rather than at each call
 * site, deliberately: allocating a slug means asking this function whether a
 * candidate is free, so there is no way to allocate without passing through the
 * lock. A caller cannot forget it.
 *
 * The lock supplements the constraints, it does not replace them. They remain
 * the source of truth for anything that writes a slug without probing, and the
 * retry loop still recovers from those.
 *
 * Lock ordering: every allocating transaction locks at most **one** namespace,
 * so no deadlock cycle is reachable. If that ever stops being true, acquisition
 * must be ordered by `ownerId`.
 */
async function slugTaken(
  tx: Tx,
  ownerId: string,
  candidate: string,
  ignoreRecipeId?: string,
): Promise<boolean> {
  if (isReservedRecipeSlug(candidate)) return true;

  // Held until this transaction commits or rolls back, so the probe below and
  // the insert the caller performs afterwards are atomic against any other
  // writer allocating in the same namespace.
  await tx.execute(
    sql`select pg_advisory_xact_lock(${SLUG_NAMESPACE_LOCK_CLASS}, hashtext(${ownerId}))`,
  );

  const live = await tx.query.recipes.findFirst({
    where: and(
      eq(recipes.authorId, ownerId),
      eq(recipes.slug, candidate),
      ignoreRecipeId ? ne(recipes.id, ignoreRecipeId) : undefined,
    ),
    columns: { id: true },
  });
  if (live) return true;

  const alias = await tx.query.recipeSlugAliases.findFirst({
    where: and(
      eq(recipeSlugAliases.ownerId, ownerId),
      eq(recipeSlugAliases.slug, candidate),
      ignoreRecipeId ? ne(recipeSlugAliases.recipeId, ignoreRecipeId) : undefined,
    ),
    columns: { id: true },
  });
  if (alias) return true;

  // Recipes this user co-creates occupy their namespace too (issue #668). Only
  // `accepted` rows count: a pending invitation holds no slug at all, so it can
  // never block one.
  const coCreated = await tx.query.recipeCreators.findFirst({
    where: and(
      eq(recipeCreators.userId, ownerId),
      eq(recipeCreators.slug, candidate),
      eq(recipeCreators.status, 'accepted'),
      ignoreRecipeId ? ne(recipeCreators.recipeId, ignoreRecipeId) : undefined,
    ),
    columns: { id: true },
  });
  return Boolean(coCreated);
}

/**
 * Best-effort in-transaction search for a slug derived from `base` that is free
 * inside `ownerId`'s namespace. This narrows the collision window, but is *not*
 * authoritative: the DB unique constraints are, and
 * {@link withSlugConflictRetry} recovers from any race the check-then-insert
 * here can still lose.
 *
 * `ignoreRecipeId` lets a recipe keep, or re-claim, a slug it already holds (or
 * once held), so re-saving an unchanged title is a no-op rather than a
 * collision.
 *
 * ## Invariant: this is the only way to allocate a recipe-namespace slug
 *
 * The per-namespace advisory lock that makes cross-table occupancy safe lives in
 * {@link slugTaken}, so it is only taken by callers that come through here. Any
 * new code path that writes `recipes.slug`, `recipe_slug_aliases.slug`, or
 * `recipe_creators.slug` must derive that value from this function, inside the
 * same transaction as the write. A hard-coded or externally supplied slug
 * bypasses the lock and reopens the race.
 *
 * As of #668 the complete set of allocation sites is: `applyRecipeInput`
 * (re-slug on rename, whose `retireSlug` alias write inherits the same
 * transaction and therefore the same lock), `createRecipe`, the fork path, and
 * `acceptRecipeCreatorInvitation`. `src/server/db/seed.ts` writes slugs directly
 * but is a development-only script that runs against an empty database.
 */
export async function uniqueSlug(
  tx: Tx,
  ownerId: string,
  base: string,
  ignoreRecipeId?: string,
): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 50; i++) {
    if (!(await slugTaken(tx, ownerId, candidate, ignoreRecipeId))) return candidate;
    candidate = `${base}-${(i + 2).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Retain `slug` as a permanent alias of `recipeId` in `ownerId`'s namespace, so
 * links shared before a rename keep resolving (issue #666).
 *
 * `onConflictDoNothing` covers the recipe re-taking a slug it previously
 * released: the alias row already points at it, so there is nothing to add. An
 * alias that happens to equal its own recipe's current live slug is harmless —
 * resolution checks live slugs first, so it never produces a redirect loop.
 */
async function retireSlug(tx: Tx, ownerId: string, recipeId: string, slug: string): Promise<void> {
  await tx
    .insert(recipeSlugAliases)
    .values({ ownerId, recipeId, slug })
    .onConflictDoNothing({
      target: [recipeSlugAliases.ownerId, recipeSlugAliases.slug],
    });
}

/**
 * Resolve the group a recipe may be persisted with, enforcing membership.
 *
 * A recipe must only ever carry a `groupId` its author actually belongs to.
 * This is the write-side guard for the group trust boundary: without it a
 * signed-in user could set `visibility: "group"` + an arbitrary `groupId` and
 * plant a recipe in a family cookbook they were never invited to. A broken
 * access control / IDOR. Membership is checked against `group_members` inside
 * the caller's transaction so a rejection rolls back the whole write.
 *
 * - Member of the target group → keep the `groupId`.
 * - Non-member, `group` visibility → reject (`FORBIDDEN`): the recipe *requires*
 *   a group, so we refuse rather than silently strand it.
 * - Non-member, any other visibility → drop the stray `groupId` (persist
 *   `null`). It's a leftover from the picker that grants no access, so we don't
 *   fail an otherwise-valid save over it.
 */
export async function resolveGroupId(
  tx: Tx,
  input: RecipeInput,
  author: User,
): Promise<string | null> {
  const groupId = input.groupId ?? null;
  if (!groupId) return null;

  const membership = await tx.query.groupMembers.findFirst({
    where: and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, author.id)),
    columns: { id: true, role: true },
  });
  if (membership) {
    // Kid-safe (issue #345): a kid-role member can keep a recipe inside the
    // family group but must never publish it to the open web.
    if (input.visibility === 'public') {
      assertKidAllowed(membership.role, 'make_recipe_public');
    }
    return groupId;
  }

  if (input.visibility === 'group') throw new DomainError('FORBIDDEN');
  return null;
}

function scalarFields(input: RecipeInput, groupId: string | null) {
  // Derived "-free" dietary tags, recomputed from ingredients on every write
  // (issue #273). Stored NULL when nothing is derivable (no ingredients / no
  // "-free" tag holds), mirroring the other optional array columns.
  const derivedDietaryTags = deriveDietaryTags(input.ingredients.map((ing) => ing.item));
  return {
    title: input.title,
    description: input.description ?? null,
    coverImageUrl: input.coverImageUrl ?? null,
    coverImageAlt: input.coverImageAlt ?? null,
    servings: input.servings ?? null,
    servingsNoun: input.servingsNoun ?? 'servings',
    prepMinutes: input.prepMinutes ?? null,
    cookMinutes: input.cookMinutes ?? null,
    totalMinutes:
      input.totalMinutes ??
      (input.prepMinutes != null && input.cookMinutes != null
        ? input.prepMinutes + input.cookMinutes
        : null),
    // Inactive/rest time + make-ahead callout (#409). Equipment list (#410).
    restMinutes: input.restMinutes ?? null,
    makeAheadNote: input.makeAheadNote ?? null,
    equipment: input.equipment.length > 0 ? input.equipment : null,
    difficulty: input.difficulty ?? null,
    // Keep the legacy scalar populated for older readers while the category-aware
    // join rows are the source of truth for multi-cuisine recipes.
    cuisine:
      input.cuisines[0] != null
        ? canonicalizeTag(input.cuisines[0], 'cuisine').name
        : input.cuisine != null
          ? canonicalizeTag(input.cuisine, 'cuisine').name
          : null,
    // Persist declared dietary flags as a Postgres text[] (NULL when none) so
    // "safe for" filtering has a trustworthy, structured source (issue #404).
    dietaryFlags: input.dietaryFlags.length > 0 ? input.dietaryFlags : null,
    // Derived "-free" tags (issue #273). Union'd with dietaryFlags at search.
    dietaryTags: derivedDietaryTags.length > 0 ? derivedDietaryTags : null,
    sourceName: input.sourceName ?? null,
    sourceUrl: input.sourceUrl ?? null,
    notes: input.notes ?? null,
    // Heritage story (#377) + structured provenance (#381).
    story: input.story ?? null,
    handedDownFrom: input.handedDownFrom ?? null,
    originYear: input.originYear ?? null,
    originPlace: input.originPlace ?? null,
    calories: input.calories ?? null,
    proteinGrams: input.proteinGrams ?? null,
    carbsGrams: input.carbsGrams ?? null,
    fatGrams: input.fatGrams ?? null,
    saturatedFatGrams: input.saturatedFatGrams ?? null,
    sodiumMg: input.sodiumMg ?? null,
    sugarGrams: input.sugarGrams ?? null,
    fiberGrams: input.fiberGrams ?? null,
    visibility: input.visibility,
    status: input.status,
    groupId,
  };
}

async function insertChildren(tx: Tx, recipeId: string, input: RecipeInput) {
  if (input.ingredients.length > 0) {
    // Best-effort write-time link to the canonical food graph (foodId is
    // nullable). We pass `tx` so the lookup runs on this transaction's own
    // connection. In production the pool is `max: 1`, so resolving through the
    // global `db` here would deadlock the request against our own open
    // transaction and time the save out (504). `resolveFoodIds` still degrades
    // to nulls when the graph is unavailable, so it never blocks the save.
    const foodIds = await resolveFoodIds(
      input.ingredients.map((ing) => ing.item),
      tx,
    );
    await tx.insert(recipeIngredients).values(
      input.ingredients.map((ing, i) => ({
        recipeId,
        position: i,
        section: ing.section ?? null,
        quantity: ing.quantity ?? null,
        quantityMax: ing.quantityMax ?? null,
        unit: ing.unit ?? null,
        item: ing.item,
        foodId: foodIds[i] ?? null,
        note: ing.note ?? null,
        prep: ing.prep ?? null,
        stepPosition: ing.stepPosition ?? null,
        optional: ing.optional,
      })),
    );
  }
  if (input.steps.length > 0) {
    await tx.insert(recipeSteps).values(
      input.steps.map((step, i) => ({
        recipeId,
        position: i,
        section: step.section ?? null,
        title: step.title ?? null,
        instruction: step.instruction,
        imageUrl: step.imageUrl ?? null,
        imageAlt: step.imageAlt ?? null,
        videoUrl: step.videoUrl ?? null,
        timerSeconds: step.timerSeconds ?? null,
        targetTempC: step.targetTempC ?? null,
        doneness: step.doneness ?? null,
        techniques: step.techniques.length > 0 ? step.techniques : null,
      })),
    );
  }
}

async function syncTags(tx: Tx, recipeId: string, input: RecipeInput) {
  await tx.delete(recipeTags).where(eq(recipeTags.recipeId, recipeId));

  // Process general tags first so an explicitly classified custom value wins if
  // the same spelling appears in more than one input group. Known vocabulary
  // always resolves to its curated category regardless of the hint.
  const sources = [
    ...input.tags.map((name) => ({ name, category: 'general' as const })),
    ...input.mealTypes.map((name) => ({ name, category: 'meal' as const })),
    ...(input.cuisines.length > 0 ? input.cuisines : input.cuisine ? [input.cuisine] : []).map(
      (name) => ({ name, category: 'cuisine' as const }),
    ),
  ];
  const bySlug = new Map<string, ReturnType<typeof canonicalizeTag>>();
  for (const source of sources) {
    const canonical = canonicalizeTag(source.name, source.category);
    bySlug.set(canonical.slug, canonical);
  }
  const classifications = [...bySlug.values()];
  if (classifications.length === 0) return;

  await tx
    .insert(tags)
    .values(classifications)
    .onConflictDoUpdate({
      target: tags.slug,
      set: {
        name: sql`excluded.name`,
      },
    });

  const rows = await tx.query.tags.findMany({
    where: inArray(
      tags.slug,
      classifications.map((classification) => classification.slug),
    ),
    columns: { id: true },
  });
  if (rows.length > 0) {
    await tx
      .insert(recipeTags)
      .values(rows.map((r) => ({ recipeId, tagId: r.id })))
      .onConflictDoNothing();
  }
}

/**
 * Append an immutable snapshot to a recipe's version history.
 *
 * `version_number` is allocated as `max+1`, but under READ COMMITTED two
 * concurrent edits can read the same max and try to write the same number. The
 * `recipe_versions_recipe_version_uq` constraint (issue #151) rejects the loser.
 * we retry inside a SAVEPOINT (`tx.transaction`) so the surrounding recipe
 * transaction survives the rolled-back attempt and the recomputed max reflects
 * the now-committed sibling. Yielding sequential, gap-tolerant version numbers
 * without locking the whole table.
 */
export async function journal(
  tx: Tx,
  recipeId: string,
  authorId: string,
  input: RecipeInput,
  label?: string,
) {
  for (let attempt = 1; ; attempt++) {
    try {
      await tx.transaction(async (sp) => {
        const [{ next } = { next: 1 }] = await sp
          .select({
            next: sql<number>`coalesce(max(${recipeVersions.versionNumber}), 0) + 1`,
          })
          .from(recipeVersions)
          .where(eq(recipeVersions.recipeId, recipeId));
        await sp.insert(recipeVersions).values({
          recipeId,
          authorId,
          versionNumber: next,
          label: label ?? null,
          snapshot: input,
        });
      });
      return;
    } catch (err) {
      if (attempt < MAX_VERSION_ATTEMPTS && isVersionConflict(err)) continue;
      throw err;
    }
  }
}

async function viewerGroupIds(tx: Tx, userId: string): Promise<string[]> {
  const rows = await tx.query.groupMembers.findMany({
    where: eq(groupMembers.userId, userId),
    columns: { groupId: true },
  });
  return rows.map((r) => r.groupId);
}

function canForkSource(
  source: { authorId: string; visibility: string; groupId: string | null },
  author: User,
  groupIds: string[],
) {
  if (source.visibility === 'public' || source.visibility === 'unlisted') return true;
  if (source.authorId === author.id) return true;
  return (
    source.visibility === 'group' && source.groupId != null && groupIds.includes(source.groupId)
  );
}

/**
 * Apply an edit to an existing recipe.
 *
 * `actor` is who is writing; `ownerId` is whose namespace the recipe lives in.
 * They are the same person for the owner's own edits and differ when an
 * accepted co-creator edits (issue #668), which is why they are separate
 * parameters rather than one `author`. Conflating them would allocate the
 * recipe's slug — and retire its outgoing one — inside the *editor's*
 * namespace, quietly moving a URL that belongs to the owner.
 *
 * `groupId` is resolved by the caller for the same reason: group placement is
 * the owner's decision, and vetting it against a co-creator's memberships would
 * either reject their edit or silently strand the recipe out of its group.
 */
async function applyRecipeInput(
  tx: Tx,
  id: string,
  input: RecipeInput,
  actor: User,
  label: string,
  current: { slug: string; title: string; publishedAt: Date | null },
  ownerId: string,
  groupId: string | null,
) {
  const nowPublished = input.status === 'published';
  const publishedAt = nowPublished && !current.publishedAt ? new Date() : current.publishedAt;
  const slug = await reslug(tx, id, input.title, ownerId, current);

  await tx
    .update(recipes)
    .set({ ...scalarFields(input, groupId), slug, publishedAt })
    .where(eq(recipes.id, id));

  await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
  await tx.delete(recipeSteps).where(eq(recipeSteps.recipeId, id));
  await insertChildren(tx, id, input);
  // The derived nutrition cache is invalidated **in this transaction** (#1044),
  // right where the ingredient lines — and therefore the foods the recipe
  // resolves to — are rewritten. Committing the delete atomically with the edit
  // is what makes a stale cached number impossible rather than merely unlikely:
  // there is no instant at which the new lines and the old figures are both
  // visible. Repopulation happens after the commit, best-effort.
  await invalidateNutritionCache(tx, id);
  await syncTags(tx, id, input);
  // Journalled against the *actor*, so `recipe_versions.authorId` records which
  // creator made each save rather than always naming the owner (#668).
  await journal(tx, id, actor.id, input, label);
  // Mint a share token the first time a recipe becomes unlisted (issue #204).
  // Guarded by `share_token IS NULL` so an existing token (and its enabled /
  // rotated state, #207) is preserved across edits and never regenerated here.
  if (input.visibility === 'unlisted') {
    await tx
      .update(recipes)
      .set({ shareToken: generateShareToken() })
      .where(and(eq(recipes.id, id), isNull(recipes.shareToken)));
  }
  return { id, slug };
}

/**
 * The slug a recipe should carry after an edit (issue #666).
 *
 * Slugs used to be immutable, so renaming "Nonna's Ragu" to "Sunday Ragu" left
 * the URL saying `nonnas-ragu` forever. Now a rename regenerates the slug and
 * the outgoing one is retained as a permanent alias, so the URL tells the truth
 * *and* every link ever shared keeps working.
 *
 * Keyed off the title, not the derived slug: a recipe whose slug was perturbed
 * (`apple-pie-2ab`, because the cook already had an `apple-pie`) must not churn
 * to a fresh random suffix on every unrelated save.
 */
async function reslug(
  tx: Tx,
  id: string,
  title: string,
  ownerId: string,
  current: { slug: string; title: string },
): Promise<string> {
  if (title === current.title) return current.slug;

  const slug = await uniqueSlug(tx, ownerId, recipeSlug(title), id);
  if (slug === current.slug) return slug;

  await retireSlug(tx, ownerId, id, current.slug);
  return slug;
}

export async function createRecipe(input: RecipeInput, author: User) {
  const recipe = await withSlugConflictRetry(() =>
    db.transaction(async (tx) => {
      const groupId = await resolveGroupId(tx, input, author);
      const slug = await uniqueSlug(tx, author.id, recipeSlug(input.title));
      const [row] = await tx
        .insert(recipes)
        .values({
          ...scalarFields(input, groupId),
          slug,
          authorId: author.id,
          // A recipe created directly as unlisted needs its share token up front
          // so `/r/<token>` works immediately (issue #204).
          shareToken: input.visibility === 'unlisted' ? generateShareToken() : null,
          publishedAt: input.status === 'published' ? new Date() : null,
        })
        .returning({ id: recipes.id, slug: recipes.slug });
      const recipe = row!;
      await insertChildren(tx, recipe.id, input);
      await syncTags(tx, recipe.id, input);
      await journal(tx, recipe.id, author.id, input, 'Created');
      await recordEvent(tx, {
        recipeId: recipe.id,
        actorId: author.id,
        type: 'created',
      });
      if (input.status === 'published') {
        await recordEvent(tx, {
          recipeId: recipe.id,
          actorId: author.id,
          type: 'published',
        });
      }
      return recipe;
    }),
  );
  await refreshRecipeNutritionCache(recipe.id);
  return recipe;
}

/**
 * The fields on a recipe only its **owner** may change (issue #668).
 *
 * A co-creator may rewrite the recipe — its steps, ingredients and narrative —
 * but not who can see it. Visibility, group placement and publication state are
 * distribution decisions that belong to the owner: letting a co-creator flip a
 * private family recipe to `public`, or move it out of the group that gates it,
 * would turn an editing grant into an access-control one.
 *
 * Enforced by *pinning* rather than rejecting, so a co-creator's editor — which
 * legitimately round-trips the whole recipe, including these fields — saves
 * successfully instead of failing on values it never intended to change.
 */
function pinOwnerOnlyFields(
  input: RecipeInput,
  current: {
    visibility: RecipeInput['visibility'];
    status: RecipeInput['status'];
  },
): RecipeInput {
  return {
    ...input,
    visibility: current.visibility,
    status: current.status,
  };
}

/**
 * Assert `actor` may edit `recipeId`'s body, and report whose namespace it
 * lives in (issue #668).
 *
 * Write access is the owner **or** an accepted co-creator. `pending` rows grant
 * nothing, matching every other access path — an invitation that has not been
 * taken up must not confer editing any more than it confers viewing.
 *
 * A caller with no access gets `NOT_FOUND`, not `FORBIDDEN`, so the failure
 * cannot be used to probe which recipe ids exist.
 */
async function assertRecipeEditAccess(
  tx: Tx,
  recipeId: string,
  actorId: string,
  ownerId: string,
): Promise<void> {
  if (ownerId === actorId) return;
  const creator = await tx.query.recipeCreators.findFirst({
    where: and(
      eq(recipeCreators.recipeId, recipeId),
      eq(recipeCreators.userId, actorId),
      eq(recipeCreators.status, 'accepted'),
    ),
    columns: { id: true },
  });
  if (!creator) throw new DomainError('NOT_FOUND');
}

/**
 * Save an edit to a recipe. Owner or accepted co-creator (issue #668).
 *
 * Returns the owner's user slug alongside the recipe, because the caller has to
 * revalidate the canonical `/recipes/<cook>/<slug>` path and the editor is not
 * necessarily the cook that path names.
 */
export async function updateRecipe(id: string, input: RecipeInput, actor: User) {
  const result = await withSlugConflictRetry(() =>
    db.transaction(async (tx) => {
      // Deliberately *not* filtered by `authorId`: the owner check moved into
      // `assertRecipeEditAccess`, which also admits accepted co-creators.
      const current = await tx.query.recipes.findFirst({
        where: eq(recipes.id, id),
        columns: {
          id: true,
          slug: true,
          title: true,
          publishedAt: true,
          status: true,
          visibility: true,
          groupId: true,
          authorId: true,
        },
        with: { author: { columns: { slug: true } } },
      });
      if (!current) throw new DomainError('NOT_FOUND');
      await assertRecipeEditAccess(tx, id, actor.id, current.authorId);

      const isOwner = current.authorId === actor.id;
      const effective = isOwner ? input : pinOwnerOnlyFields(input, current);
      // Only the owner can move a recipe between groups, so only their input is
      // vetted for membership. A co-creator's save keeps the stored placement,
      // which the owner's own membership already justified.
      const groupId = isOwner ? await resolveGroupId(tx, effective, actor) : current.groupId;

      const result = await applyRecipeInput(
        tx,
        id,
        effective,
        actor,
        'Edited',
        current,
        current.authorId,
        groupId,
      );
      const newlyPublished = effective.status === 'published' && current.status !== 'published';
      await recordEvent(tx, {
        recipeId: id,
        actorId: actor.id,
        type: newlyPublished ? 'published' : 'updated',
      });
      if (effective.visibility !== current.visibility) {
        await recordAudit(tx, {
          actorId: actor.id,
          action: AuditAction.RecipeVisibilityChanged,
          targetType: 'recipe',
          targetId: id,
          metadata: { from: current.visibility, to: effective.visibility },
        });
      }
      return { ...result, cook: current.author?.slug ?? null };
    }),
  );
  // After the commit, never inside it: the recompute reads the rows the
  // transaction just wrote, and a cache write is not worth extending a lock for.
  // Best-effort — a failure leaves the recipe uncached, which reads handle.
  await refreshRecipeNutritionCache(id);
  return result;
}

export async function forkRecipe(sourceIdOrSlug: string, author: User, forkNote?: string) {
  const result = await withSlugConflictRetry(() =>
    db.transaction(async (tx) => {
      const source = await tx.query.recipes.findFirst({
        where: or(eq(recipes.id, sourceIdOrSlug), eq(recipes.slug, sourceIdOrSlug)),
        // Recipe slugs are only unique per author now (issue #666), so a bare
        // slug can match more than one row. Resolve deterministically: an exact
        // id always wins, then the oldest holder of that slug — which is the
        // recipe the pre-namespacing global slug pointed at.
        orderBy: [
          sql`case when ${recipes.id} = ${sourceIdOrSlug} then 0 else 1 end`,
          recipes.createdAt,
        ],
        with: {
          ingredients: { orderBy: [recipeIngredients.position] },
          steps: { orderBy: [recipeSteps.position] },
          tags: { with: { tag: true } },
        },
      });

      if (!source) throw new DomainError('NOT_FOUND');

      const groupIds = source.visibility === 'group' ? await viewerGroupIds(tx, author.id) : [];
      if (!canForkSource(source, author, groupIds)) throw new DomainError('NOT_FOUND');

      const input = buildAdaptationInput(source);

      const slug = await uniqueSlug(tx, author.id, recipeSlug(input.title));
      const note = forkNote?.trim();
      const trimmedNote = note ? note.slice(0, 300) : null;
      const [row] = await tx
        .insert(recipes)
        .values({
          // Adaptations always start private with no group (see
          // buildAdaptationInput), so there's no membership to vet here.
          ...scalarFields(input, input.groupId ?? null),
          slug,
          authorId: author.id,
          forkedFromId: source.id,
          forkNote: trimmedNote,
          publishedAt: input.status === 'published' ? new Date() : null,
        })
        .returning({ id: recipes.id, slug: recipes.slug });

      const recipe = row!;
      await insertChildren(tx, recipe.id, input);
      await syncTags(tx, recipe.id, input);
      await journal(tx, recipe.id, author.id, input, `Adapted from "${source.title}"`);

      // Record both halves of the fork so it shows on each recipe's timeline:
      // the adaptation's origin, and a new descendant on the source.
      await recordEvent(tx, {
        recipeId: recipe.id,
        actorId: author.id,
        type: 'adapted',
        note: trimmedNote ?? `Adapted from "${source.title}"`,
        relatedRecipeId: source.id,
      });
      await recordEvent(tx, {
        recipeId: source.id,
        actorId: author.id,
        type: 'adapted',
        note: trimmedNote,
        relatedRecipeId: recipe.id,
      });
      // Expose the source's canonical segments so the action can revalidate the
      // source's detail page, whose lineage now includes this adaptation. The
      // author slug is needed because that path is namespaced (#666).
      const sourceAuthor = await tx.query.users.findFirst({
        where: eq(users.id, source.authorId),
        columns: { slug: true },
      });
      return {
        ...recipe,
        source: {
          id: source.id,
          slug: source.slug,
          cook: sourceAuthor?.slug ?? null,
        },
      };
    }),
  );
  await refreshRecipeNutritionCache(result.id);
  return result;
}

export async function revertRecipe(id: string, versionNumber: number, author: User) {
  const result = await withSlugConflictRetry(() =>
    db.transaction(async (tx) => {
      // Owner-only, unlike {@link updateRecipe}: reverting rewrites history for
      // everyone on the recipe, so it stays with the person who owns it (#668).
      const current = await tx.query.recipes.findFirst({
        where: and(eq(recipes.id, id), eq(recipes.authorId, author.id)),
        columns: {
          id: true,
          slug: true,
          title: true,
          publishedAt: true,
          status: true,
          groupId: true,
        },
      });
      if (!current) throw new DomainError('NOT_FOUND');

      const version = await tx.query.recipeVersions.findFirst({
        where: and(
          eq(recipeVersions.recipeId, id),
          eq(recipeVersions.versionNumber, versionNumber),
        ),
        columns: { snapshot: true },
      });
      if (!version) throw new DomainError('NOT_FOUND');

      const input = parseSnapshot(version.snapshot);
      if (!input) throw new DomainError('BAD_SNAPSHOT');

      const result = await applyRecipeInput(
        tx,
        id,
        input,
        author,
        `Reverted to v${versionNumber}`,
        current,
        author.id,
        await resolveGroupId(tx, input, author),
      );
      await recordEvent(tx, {
        recipeId: id,
        actorId: author.id,
        type: 'updated',
        note: `Reverted to v${versionNumber}`,
      });
      return result;
    }),
  );
  await refreshRecipeNutritionCache(id);
  return result;
}

/**
 * Soft-delete a recipe (issue #165). Tombstones the row via `deleted_at` instead
 * of physically deleting it, so its versions, events, ratings, and comments.
 * the family history the product exists to preserve. Survive and can be
 * restored. Owner-guarded. The `deleted_at IS NULL` guard makes a repeat delete
 * a no-op that reports NOT_FOUND rather than re-stamping the tombstone.
 *
 * Retention: tombstoned rows are kept indefinitely for now. A hard `purgeRecipe`
 * (permanent removal after a retention window, e.g. 30 days) is intentionally
 * deferred. When added it should be the only path that issues a real DELETE.
 */
export async function deleteRecipe(id: string, author: User) {
  // Kid-safe (issue #367): a kid-role member of the recipe's group can browse,
  // cook, and favorite, but must never delete a recipe. Enforced here on the
  // server, not just hidden in the UI. Resolved before the tombstone write so a
  // kid's delete is rejected with FORBIDDEN rather than silently allowed.
  const target = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, id), eq(recipes.authorId, author.id)),
    columns: { groupId: true },
  });
  if (target?.groupId) {
    const membership = await db.query.groupMembers.findFirst({
      where: and(eq(groupMembers.groupId, target.groupId), eq(groupMembers.userId, author.id)),
      columns: { role: true },
    });
    if (membership) assertKidAllowed(membership.role, 'delete_recipe');
  }

  const [row] = await db
    .update(recipes)
    .set({ deletedAt: new Date(), deletedBy: author.id })
    .where(and(eq(recipes.id, id), eq(recipes.authorId, author.id), isNull(recipes.deletedAt)))
    .returning({ id: recipes.id });
  if (!row) throw new DomainError('NOT_FOUND');
  await recordAudit(db, {
    actorId: author.id,
    action: AuditAction.RecipeDeleted,
    targetType: 'recipe',
    targetId: id,
  });
  return row;
}

/**
 * Restore a previously soft-deleted recipe (issue #165). Owner-guarded and only
 * acts on a currently-tombstoned row, bringing back the recipe together with all
 * of its preserved child history.
 */
export async function restoreRecipe(id: string, author: User) {
  const [row] = await db
    .update(recipes)
    .set({ deletedAt: null, deletedBy: null })
    .where(and(eq(recipes.id, id), eq(recipes.authorId, author.id), isNotNull(recipes.deletedAt)))
    .returning({ id: recipes.id, slug: recipes.slug });
  if (!row) throw new DomainError('NOT_FOUND');
  return row;
}

/** The share-link state returned after an owner changes it (issue #207). */
export type ShareLinkState = {
  shareToken: string | null;
  shareLinkEnabled: boolean;
  shareTokenRotatedAt: Date | null;
};

/**
 * Owner-only share-link controls for an unlisted recipe (issue #207).
 *
 * - `enabled: false` **revokes** the link: every URL that was ever handed out
 *   immediately 404s (see {@link getRecipeByShareToken}), while the recipe stays
 *   editable and owner-visible.
 * - `rotate: true` **rotates** the token: the old token dies and a fresh one is
 *   minted, so a leaked/compromised link can be replaced without unsharing.
 * - Enabling a never-shared recipe mints its first token so there's a URL to
 *   hand out.
 *
 * Authorization is enforced by scoping the row to `authorId`, so a non-owner
 * (or a stranger guessing an id) gets NOT_FOUND and can never change link state.
 * Returns the resulting state so the caller can surface the new URL.
 */
export async function setShareLinkState(
  id: string,
  author: User,
  change: { enabled?: boolean; rotate?: boolean },
): Promise<ShareLinkState> {
  return db.transaction(async (tx) => {
    const current = await tx.query.recipes.findFirst({
      where: and(eq(recipes.id, id), eq(recipes.authorId, author.id), isNull(recipes.deletedAt)),
      columns: {
        shareToken: true,
        shareLinkEnabled: true,
        shareTokenRotatedAt: true,
      },
    });
    if (!current) throw new DomainError('NOT_FOUND');

    const next: Partial<ShareLinkState> = {};
    if (change.rotate) {
      next.shareToken = generateShareToken();
      next.shareTokenRotatedAt = new Date();
    } else if (!current.shareToken && change.enabled !== false) {
      // First enable of a recipe that never had a token. Mint one to share.
      next.shareToken = generateShareToken();
    }
    if (change.enabled !== undefined) next.shareLinkEnabled = change.enabled;

    if (Object.keys(next).length === 0) return current;

    const [updated] = await tx.update(recipes).set(next).where(eq(recipes.id, id)).returning({
      shareToken: recipes.shareToken,
      shareLinkEnabled: recipes.shareLinkEnabled,
      shareTokenRotatedAt: recipes.shareTokenRotatedAt,
    });
    if (!updated) throw new DomainError('NOT_FOUND');

    await recordAudit(tx, {
      actorId: author.id,
      action: AuditAction.RecipeShareLinkChanged,
      targetType: 'recipe',
      targetId: id,
      metadata: {
        rotated: Boolean(change.rotate),
        enabled: updated.shareLinkEnabled,
      },
    });
    return updated;
  });
}
