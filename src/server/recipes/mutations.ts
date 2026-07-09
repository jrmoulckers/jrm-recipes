import "server-only";

import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import { db } from "~/server/db";
import { DomainError } from "~/server/errors";
import {
  groupMembers,
  recipeEvents,
  recipeIngredients,
  recipeSteps,
  recipeTags,
  recipeVersions,
  recipes,
  tags,
  type RecipeEventType,
  type User,
} from "~/server/db/schema";
import { canonicalizeTag } from "~/lib/tag-taxonomy";
import { AuditAction, recordAudit } from "~/server/audit";
import { assertKidAllowed } from "~/server/groups/kid-safe";
import { recipeSlug, type RecipeInput } from "./validation";
import { generateShareToken } from "./share-token";
import { parseSnapshot } from "./queries";
import { buildAdaptationInput } from "./timeline";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Postgres `unique_violation` SQLSTATE. */
const PG_UNIQUE_VIOLATION = "23505";

/** DB-level unique constraint guarding `recipes.slug` (see schema/recipes.ts). */
const RECIPES_SLUG_CONSTRAINT = "recipes_slug_uq";

/** DB-level unique constraint on `recipe_versions (recipe_id, version_number)`. */
const RECIPE_VERSIONS_VERSION_CONSTRAINT = "recipe_versions_recipe_version_uq";

/** Max attempts for a create/fork that races another writer for the same slug. */
const MAX_SLUG_ATTEMPTS = 5;

/** Max attempts to allocate a version number that races a concurrent edit. */
const MAX_VERSION_ATTEMPTS = 5;

/**
 * True when `err` is a Postgres unique-violation on `constraint`. The `postgres`
 * driver exposes `.code` and `.constraint`; we fall back to the constraint name
 * embedded in the message, and unwrap a single `cause` level in case an
 * intermediate layer rewraps the driver error.
 */
function matchesUniqueViolation(err: unknown, constraint: string): boolean {
  if (typeof err !== "object" || err === null) return false;
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
    if (name == null && typeof e.message === "string")
      return e.message.includes(constraint);
    return false;
  }
  if (e.cause != null && e.cause !== err)
    return matchesUniqueViolation(e.cause, constraint);
  return false;
}

/**
 * True when `err` is a Postgres unique-violation on the `recipes.slug`
 * constraint. {@link uniqueSlug} pre-checks for a free slug, but two concurrent
 * transactions can both pass that check and only collide at COMMIT-time on the
 * DB constraint — that lost race surfaces here so callers can retry.
 */
export function isSlugConflict(err: unknown): boolean {
  return matchesUniqueViolation(err, RECIPES_SLUG_CONSTRAINT);
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
 * Run a write that may collide on the unique `recipes.slug` constraint,
 * retrying the whole operation on conflict. Because each attempt is a fresh
 * transaction, the retry re-runs {@link uniqueSlug} against newly-committed
 * rows, so the DB constraint — not the app-side loop — is the source of truth.
 */
async function withSlugConflictRetry<T>(op: () => Promise<T>): Promise<T> {
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
 * Best-effort in-transaction search for a free slug derived from `base`. This
 * narrows the collision window, but is *not* authoritative: the DB unique
 * constraint is, and {@link withSlugConflictRetry} recovers from any race the
 * check-then-insert here can still lose.
 */
export async function uniqueSlug(
  tx: Tx,
  base: string,
  ignoreId?: string,
): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 50; i++) {
    const existing = await tx.query.recipes.findFirst({
      where: ignoreId
        ? and(eq(recipes.slug, candidate), sql`${recipes.id} <> ${ignoreId}`)
        : eq(recipes.slug, candidate),
      columns: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${(i + 2).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Resolve the group a recipe may be persisted with, enforcing membership.
 *
 * A recipe must only ever carry a `groupId` its author actually belongs to.
 * This is the write-side guard for the group trust boundary: without it a
 * signed-in user could set `visibility: "group"` + an arbitrary `groupId` and
 * plant a recipe in a family cookbook they were never invited to — a broken
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
    where: and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, author.id),
    ),
    columns: { id: true, role: true },
  });
  if (membership) {
    // Kid-safe (issue #345): a kid-role member can keep a recipe inside the
    // family group but must never publish it to the open web.
    if (input.visibility === "public") {
      assertKidAllowed(membership.role, "make_recipe_public");
    }
    return groupId;
  }

  if (input.visibility === "group") throw new DomainError("FORBIDDEN");
  return null;
}

function scalarFields(input: RecipeInput, groupId: string | null) {
  return {
    title: input.title,
    description: input.description ?? null,
    coverImageUrl: input.coverImageUrl ?? null,
    servings: input.servings ?? null,
    servingsNoun: input.servingsNoun ?? "servings",
    prepMinutes: input.prepMinutes ?? null,
    cookMinutes: input.cookMinutes ?? null,
    totalMinutes:
      input.totalMinutes ??
      (input.prepMinutes != null && input.cookMinutes != null
        ? input.prepMinutes + input.cookMinutes
        : null),
    // Inactive/rest time + make-ahead callout (#409); equipment list (#410).
    restMinutes: input.restMinutes ?? null,
    makeAheadNote: input.makeAheadNote ?? null,
    equipment: input.equipment.length > 0 ? input.equipment : null,
    difficulty: input.difficulty ?? null,
    cuisine: input.cuisine ?? null,
    // Persist declared dietary flags as a Postgres text[] (NULL when none) so
    // "safe for" filtering has a trustworthy, structured source (issue #404).
    dietaryFlags: input.dietaryFlags.length > 0 ? input.dietaryFlags : null,
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
    await tx.insert(recipeIngredients).values(
      input.ingredients.map((ing, i) => ({
        recipeId,
        position: i,
        section: ing.section ?? null,
        quantity: ing.quantity ?? null,
        quantityMax: ing.quantityMax ?? null,
        unit: ing.unit ?? null,
        item: ing.item,
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
        instruction: step.instruction,
        imageUrl: step.imageUrl ?? null,
        videoUrl: step.videoUrl ?? null,
        timerSeconds: step.timerSeconds ?? null,
        targetTempC: step.targetTempC ?? null,
        doneness: step.doneness ?? null,
        techniques: step.techniques.length > 0 ? step.techniques : null,
      })),
    );
  }
}

async function syncTags(tx: Tx, recipeId: string, names: string[]) {
  await tx.delete(recipeTags).where(eq(recipeTags.recipeId, recipeId));
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0) return;

  // Fold known aliases onto their canonical tag, then de-dup by the resulting
  // slug so e.g. "veggie" and "Vegetarian" collapse into one tag.
  const bySlug = new Map<string, { slug: string; name: string }>();
  for (const name of unique) {
    const canonical = canonicalizeTag(name);
    if (!bySlug.has(canonical.slug)) bySlug.set(canonical.slug, canonical);
  }
  const slugs = [...bySlug.values()];

  await tx
    .insert(tags)
    .values(slugs.map((s) => ({ slug: s.slug, name: s.name })))
    .onConflictDoNothing({ target: tags.slug });

  const rows = await tx.query.tags.findMany({
    where: inArray(
      tags.slug,
      slugs.map((s) => s.slug),
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
 * `recipe_versions_recipe_version_uq` constraint (issue #151) rejects the loser;
 * we retry inside a SAVEPOINT (`tx.transaction`) so the surrounding recipe
 * transaction survives the rolled-back attempt and the recomputed max reflects
 * the now-committed sibling — yielding sequential, gap-tolerant version numbers
 * without locking the whole table.
 */
async function journal(
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
  if (source.visibility === "public" || source.visibility === "unlisted")
    return true;
  if (source.authorId === author.id) return true;
  return (
    source.visibility === "group" &&
    source.groupId != null &&
    groupIds.includes(source.groupId)
  );
}

async function applyRecipeInput(
  tx: Tx,
  id: string,
  input: RecipeInput,
  author: User,
  label: string,
  current: { slug: string; publishedAt: Date | null },
) {
  const groupId = await resolveGroupId(tx, input, author);
  const nowPublished = input.status === "published";
  const publishedAt =
    nowPublished && !current.publishedAt ? new Date() : current.publishedAt;

  await tx
    .update(recipes)
    .set({ ...scalarFields(input, groupId), publishedAt })
    .where(eq(recipes.id, id));

  await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
  await tx.delete(recipeSteps).where(eq(recipeSteps.recipeId, id));
  await insertChildren(tx, id, input);
  await syncTags(tx, id, input.tags);
  await journal(tx, id, author.id, input, label);
  // Mint a share token the first time a recipe becomes unlisted (issue #204).
  // Guarded by `share_token IS NULL` so an existing token (and its enabled /
  // rotated state, #207) is preserved across edits and never regenerated here.
  if (input.visibility === "unlisted") {
    await tx
      .update(recipes)
      .set({ shareToken: generateShareToken() })
      .where(and(eq(recipes.id, id), isNull(recipes.shareToken)));
  }
  return { id, slug: current.slug };
}

export async function createRecipe(input: RecipeInput, author: User) {
  return withSlugConflictRetry(() =>
    db.transaction(async (tx) => {
      const groupId = await resolveGroupId(tx, input, author);
      const slug = await uniqueSlug(tx, recipeSlug(input.title));
      const [row] = await tx
        .insert(recipes)
        .values({
          ...scalarFields(input, groupId),
          slug,
          authorId: author.id,
          // A recipe created directly as unlisted needs its share token up front
          // so `/r/<token>` works immediately (issue #204).
          shareToken:
            input.visibility === "unlisted" ? generateShareToken() : null,
          publishedAt: input.status === "published" ? new Date() : null,
        })
        .returning({ id: recipes.id, slug: recipes.slug });
      const recipe = row!;
      await insertChildren(tx, recipe.id, input);
      await syncTags(tx, recipe.id, input.tags);
      await journal(tx, recipe.id, author.id, input, "Created");
      await recordEvent(tx, {
        recipeId: recipe.id,
        actorId: author.id,
        type: "created",
      });
      if (input.status === "published") {
        await recordEvent(tx, {
          recipeId: recipe.id,
          actorId: author.id,
          type: "published",
        });
      }
      return recipe;
    }),
  );
}

export async function updateRecipe(
  id: string,
  input: RecipeInput,
  author: User,
) {
  return db.transaction(async (tx) => {
    const current = await tx.query.recipes.findFirst({
      where: and(eq(recipes.id, id), eq(recipes.authorId, author.id)),
      columns: {
        id: true,
        slug: true,
        publishedAt: true,
        status: true,
        visibility: true,
      },
    });
    if (!current) throw new DomainError("NOT_FOUND");

    const result = await applyRecipeInput(
      tx,
      id,
      input,
      author,
      "Edited",
      current,
    );
    const newlyPublished =
      input.status === "published" && current.status !== "published";
    await recordEvent(tx, {
      recipeId: id,
      actorId: author.id,
      type: newlyPublished ? "published" : "updated",
    });
    if (input.visibility !== current.visibility) {
      await recordAudit(tx, {
        actorId: author.id,
        action: AuditAction.RecipeVisibilityChanged,
        targetType: "recipe",
        targetId: id,
        metadata: { from: current.visibility, to: input.visibility },
      });
    }
    return result;
  });
}

export async function forkRecipe(
  sourceIdOrSlug: string,
  author: User,
  forkNote?: string,
) {
  return withSlugConflictRetry(() =>
    db.transaction(async (tx) => {
      const source = await tx.query.recipes.findFirst({
        where: or(
          eq(recipes.id, sourceIdOrSlug),
          eq(recipes.slug, sourceIdOrSlug),
        ),
        with: {
          ingredients: { orderBy: [recipeIngredients.position] },
          steps: { orderBy: [recipeSteps.position] },
          tags: { with: { tag: true } },
        },
      });

      if (!source) throw new DomainError("NOT_FOUND");

      const groupIds =
        source.visibility === "group"
          ? await viewerGroupIds(tx, author.id)
          : [];
      if (!canForkSource(source, author, groupIds))
        throw new DomainError("NOT_FOUND");

      const input = buildAdaptationInput(source);

      const slug = await uniqueSlug(tx, recipeSlug(input.title));
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
          publishedAt: input.status === "published" ? new Date() : null,
        })
        .returning({ id: recipes.id, slug: recipes.slug });

      const recipe = row!;
      await insertChildren(tx, recipe.id, input);
      await syncTags(tx, recipe.id, input.tags);
      await journal(
        tx,
        recipe.id,
        author.id,
        input,
        `Adapted from "${source.title}"`,
      );

      // Record both halves of the fork so it shows on each recipe's timeline:
      // the adaptation's origin, and a new descendant on the source.
      await recordEvent(tx, {
        recipeId: recipe.id,
        actorId: author.id,
        type: "adapted",
        note: trimmedNote ?? `Adapted from "${source.title}"`,
        relatedRecipeId: source.id,
      });
      await recordEvent(tx, {
        recipeId: source.id,
        actorId: author.id,
        type: "adapted",
        note: trimmedNote,
        relatedRecipeId: recipe.id,
      });
      // Expose the source's slug so the action can revalidate the source's
      // (slug-based) detail page, whose lineage now includes this adaptation.
      return { ...recipe, source: { id: source.id, slug: source.slug } };
    }),
  );
}

export async function revertRecipe(
  id: string,
  versionNumber: number,
  author: User,
) {
  return db.transaction(async (tx) => {
    const current = await tx.query.recipes.findFirst({
      where: and(eq(recipes.id, id), eq(recipes.authorId, author.id)),
      columns: { id: true, slug: true, publishedAt: true, status: true },
    });
    if (!current) throw new DomainError("NOT_FOUND");

    const version = await tx.query.recipeVersions.findFirst({
      where: and(
        eq(recipeVersions.recipeId, id),
        eq(recipeVersions.versionNumber, versionNumber),
      ),
      columns: { snapshot: true },
    });
    if (!version) throw new DomainError("NOT_FOUND");

    const input = parseSnapshot(version.snapshot);
    if (!input) throw new DomainError("BAD_SNAPSHOT");

    const result = await applyRecipeInput(
      tx,
      id,
      input,
      author,
      `Reverted to v${versionNumber}`,
      current,
    );
    await recordEvent(tx, {
      recipeId: id,
      actorId: author.id,
      type: "updated",
      note: `Reverted to v${versionNumber}`,
    });
    return result;
  });
}

/**
 * Soft-delete a recipe (issue #165). Tombstones the row via `deleted_at` instead
 * of physically deleting it, so its versions, events, ratings, and comments —
 * the family history the product exists to preserve — survive and can be
 * restored. Owner-guarded; the `deleted_at IS NULL` guard makes a repeat delete
 * a no-op that reports NOT_FOUND rather than re-stamping the tombstone.
 *
 * Retention: tombstoned rows are kept indefinitely for now. A hard `purgeRecipe`
 * (permanent removal after a retention window, e.g. 30 days) is intentionally
 * deferred — when added it should be the only path that issues a real DELETE.
 */
export async function deleteRecipe(id: string, author: User) {
  const [row] = await db
    .update(recipes)
    .set({ deletedAt: new Date(), deletedBy: author.id })
    .where(
      and(
        eq(recipes.id, id),
        eq(recipes.authorId, author.id),
        isNull(recipes.deletedAt),
      ),
    )
    .returning({ id: recipes.id });
  if (!row) throw new DomainError("NOT_FOUND");
  await recordAudit(db, {
    actorId: author.id,
    action: AuditAction.RecipeDeleted,
    targetType: "recipe",
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
    .where(
      and(
        eq(recipes.id, id),
        eq(recipes.authorId, author.id),
        isNotNull(recipes.deletedAt),
      ),
    )
    .returning({ id: recipes.id, slug: recipes.slug });
  if (!row) throw new DomainError("NOT_FOUND");
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
      where: and(
        eq(recipes.id, id),
        eq(recipes.authorId, author.id),
        isNull(recipes.deletedAt),
      ),
      columns: {
        shareToken: true,
        shareLinkEnabled: true,
        shareTokenRotatedAt: true,
      },
    });
    if (!current) throw new DomainError("NOT_FOUND");

    const next: Partial<ShareLinkState> = {};
    if (change.rotate) {
      next.shareToken = generateShareToken();
      next.shareTokenRotatedAt = new Date();
    } else if (!current.shareToken && change.enabled !== false) {
      // First enable of a recipe that never had a token — mint one to share.
      next.shareToken = generateShareToken();
    }
    if (change.enabled !== undefined) next.shareLinkEnabled = change.enabled;

    if (Object.keys(next).length === 0) return current;

    const [updated] = await tx
      .update(recipes)
      .set(next)
      .where(eq(recipes.id, id))
      .returning({
        shareToken: recipes.shareToken,
        shareLinkEnabled: recipes.shareLinkEnabled,
        shareTokenRotatedAt: recipes.shareTokenRotatedAt,
      });
    if (!updated) throw new DomainError("NOT_FOUND");

    await recordAudit(tx, {
      actorId: author.id,
      action: AuditAction.RecipeShareLinkChanged,
      targetType: "recipe",
      targetId: id,
      metadata: {
        rotated: Boolean(change.rotate),
        enabled: updated.shareLinkEnabled,
      },
    });
    return updated;
  });
}