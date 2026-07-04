import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "~/server/db";
import {
  recipeIngredients,
  recipeSteps,
  recipeTags,
  recipeVersions,
  recipes,
  tags,
  type User,
} from "~/server/db/schema";
import { slugify } from "~/lib/utils";
import { recipeSlug, type RecipeInput } from "./validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function uniqueSlug(tx: Tx, base: string, ignoreId?: string): Promise<string> {
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

  const slugs = unique.map((n) => ({ name: n, slug: slugify(n).slice(0, 60) || n.toLowerCase() }));
  await tx
    .insert(tags)
    .values(slugs.map((s) => ({ slug: s.slug, name: s.name })))
    .onConflictDoNothing({ target: tags.slug });

  const rows = await tx.query.tags.findMany({
    where: inArray(tags.slug, slugs.map((s) => s.slug)),
    columns: { id: true },
  });
  if (rows.length > 0) {
    await tx
      .insert(recipeTags)
      .values(rows.map((r) => ({ recipeId, tagId: r.id })))
      .onConflictDoNothing();
  }
}

async function journal(tx: Tx, recipeId: string, authorId: string, input: RecipeInput, label?: string) {
  const [{ next } = { next: 1 }] = await tx
    .select({ next: sql<number>`coalesce(max(${recipeVersions.versionNumber}), 0) + 1` })
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
    return recipe;
  });
}

export async function updateRecipe(id: string, input: RecipeInput, author: User) {
  return db.transaction(async (tx) => {
    const current = await tx.query.recipes.findFirst({
      where: and(eq(recipes.id, id), eq(recipes.authorId, author.id)),
      columns: { id: true, slug: true, publishedAt: true, status: true },
    });
    if (!current) throw new Error("NOT_FOUND");

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
    await journal(tx, id, author.id, input, "Edited");
    return { id, slug: current.slug };
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
