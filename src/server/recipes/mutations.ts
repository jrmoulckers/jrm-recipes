import "server-only";

import { and, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "~/server/db";
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
import { slugify } from "~/lib/utils";
import { recipeSlug, type RecipeInput } from "./validation";
import { parseSnapshot } from "./queries";
import { buildAdaptationInput } from "./timeline";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

async function uniqueSlug(
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

function scalarFields(input: RecipeInput) {
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
    difficulty: input.difficulty ?? null,
    cuisine: input.cuisine ?? null,
    sourceName: input.sourceName ?? null,
    sourceUrl: input.sourceUrl ?? null,
    notes: input.notes ?? null,
    visibility: input.visibility,
    status: input.status,
    groupId: input.groupId ?? null,
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
        techniques: step.techniques.length > 0 ? step.techniques : null,
      })),
    );
  }
}

async function syncTags(tx: Tx, recipeId: string, names: string[]) {
  await tx.delete(recipeTags).where(eq(recipeTags.recipeId, recipeId));
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0) return;

  const slugs = unique.map((n) => ({
    name: n,
    slug: slugify(n).slice(0, 60) || n.toLowerCase(),
  }));
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

async function journal(
  tx: Tx,
  recipeId: string,
  authorId: string,
  input: RecipeInput,
  label?: string,
) {
  const [{ next } = { next: 1 }] = await tx
    .select({
      next: sql<number>`coalesce(max(${recipeVersions.versionNumber}), 0) + 1`,
    })
    .from(recipeVersions)
    .where(eq(recipeVersions.recipeId, recipeId));
  await tx.insert(recipeVersions).values({
    recipeId,
    authorId,
    versionNumber: next,
    label: label ?? null,
    snapshot: JSON.stringify(input),
  });
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
  const nowPublished = input.status === "published";
  const publishedAt =
    nowPublished && !current.publishedAt ? new Date() : current.publishedAt;

  await tx
    .update(recipes)
    .set({ ...scalarFields(input), publishedAt })
    .where(eq(recipes.id, id));

  await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
  await tx.delete(recipeSteps).where(eq(recipeSteps.recipeId, id));
  await insertChildren(tx, id, input);
  await syncTags(tx, id, input.tags);
  await journal(tx, id, author.id, input, label);
  return { id, slug: current.slug };
}

export async function createRecipe(input: RecipeInput, author: User) {
  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(tx, recipeSlug(input.title));
    const [row] = await tx
      .insert(recipes)
      .values({
        ...scalarFields(input),
        slug,
        authorId: author.id,
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
  });
}

export async function updateRecipe(
  id: string,
  input: RecipeInput,
  author: User,
) {
  return db.transaction(async (tx) => {
    const current = await tx.query.recipes.findFirst({
      where: and(eq(recipes.id, id), eq(recipes.authorId, author.id)),
      columns: { id: true, slug: true, publishedAt: true, status: true },
    });
    if (!current) throw new Error("NOT_FOUND");

    const result = await applyRecipeInput(tx, id, input, author, "Edited", current);
    const newlyPublished =
      input.status === "published" && current.status !== "published";
    await recordEvent(tx, {
      recipeId: id,
      actorId: author.id,
      type: newlyPublished ? "published" : "updated",
    });
    return result;
  });
}

export async function forkRecipe(
  sourceIdOrSlug: string,
  author: User,
  forkNote?: string,
) {
  return db.transaction(async (tx) => {
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

    if (!source) throw new Error("NOT_FOUND");

    const groupIds =
      source.visibility === "group" ? await viewerGroupIds(tx, author.id) : [];
    if (!canForkSource(source, author, groupIds)) throw new Error("NOT_FOUND");

    const input = buildAdaptationInput(source);

    const slug = await uniqueSlug(tx, recipeSlug(input.title));
    const note = forkNote?.trim();
    const trimmedNote = note ? note.slice(0, 300) : null;
    const [row] = await tx
      .insert(recipes)
      .values({
        ...scalarFields(input),
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

    // Record both halves of the fork so it shows on each recipe's timeline: the
    // adaptation's origin, and a new descendant on the source.
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
    return recipe;
  });
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
    if (!current) throw new Error("NOT_FOUND");

    const version = await tx.query.recipeVersions.findFirst({
      where: and(
        eq(recipeVersions.recipeId, id),
        eq(recipeVersions.versionNumber, versionNumber),
      ),
      columns: { snapshot: true },
    });
    if (!version) throw new Error("NOT_FOUND");

    const input = parseSnapshot(version.snapshot);
    if (!input) throw new Error("BAD_SNAPSHOT");

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

export async function deleteRecipe(id: string, author: User) {
  const [row] = await db
    .delete(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.authorId, author.id)))
    .returning({ id: recipes.id });
  if (!row) throw new Error("NOT_FOUND");
  return row;
}
