/**
 * The weekly family digest builder (issue #354).
 *
 * Pure + deterministic: it takes a user's groups and the candidate recipes from
 * those groups and folds them into a per-group summary of the last N days. All
 * the retention-loop logic lives here — windowing (new vs. updated), tenant
 * scoping (only the user's own groups, never private recipes), and the
 * skip-when-empty rule — so it unit-tests without a database or an email
 * provider. The DB read lives in `./queries`; rendering lives in `./email`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A group the recipient belongs to. */
export interface DigestGroup {
  id: string;
  name: string;
}

/** A candidate recipe from one of the recipient's groups. */
export interface DigestRecipe {
  id: string;
  slug: string;
  title: string;
  groupId: string | null;
  visibility: string;
  authorName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DigestRecipeEntry {
  id: string;
  slug: string;
  title: string;
  authorName: string | null;
}

export interface DigestGroupSummary {
  groupId: string;
  groupName: string;
  newRecipes: DigestRecipeEntry[];
  updatedCount: number;
}

export interface WeeklyDigest {
  periodDays: number;
  since: Date;
  totalNew: number;
  totalUpdated: number;
  groups: DigestGroupSummary[];
}

/**
 * Fold a recipient's group activity into a weekly digest, or return `null` when
 * there's nothing to report (so callers never send an empty email).
 *
 * Scoping (no cross-tenant leakage): only recipes whose `groupId` is one of the
 * recipient's `groups` and whose visibility is group-visible (`group`/`public`)
 * are ever considered — a private recipe, or one in a group the recipient isn't
 * in, can never surface. Windowing: a recipe created within the window counts as
 * *new*; one only updated within the window counts as *updated* (never both).
 */
export function buildWeeklyDigest(input: {
  groups: DigestGroup[];
  recipes: DigestRecipe[];
  now?: Date;
  windowDays?: number;
}): WeeklyDigest | null {
  const now = input.now ?? new Date();
  const windowDays = input.windowDays ?? 7;
  const since = new Date(now.getTime() - windowDays * DAY_MS);

  const groupIds = new Set(input.groups.map((g) => g.id));
  const nameById = new Map(input.groups.map((g) => [g.id, g.name]));

  const summaries = new Map<string, DigestGroupSummary>();

  for (const recipe of input.recipes) {
    // Tenant + visibility scoping — the core no-leakage guard.
    if (recipe.groupId == null || !groupIds.has(recipe.groupId)) continue;
    if (recipe.visibility !== "group" && recipe.visibility !== "public") {
      continue;
    }

    const isNew = recipe.createdAt.getTime() >= since.getTime();
    const isUpdated =
      !isNew && recipe.updatedAt.getTime() >= since.getTime();
    if (!isNew && !isUpdated) continue;

    let summary = summaries.get(recipe.groupId);
    if (!summary) {
      summary = {
        groupId: recipe.groupId,
        groupName: nameById.get(recipe.groupId) ?? "Your group",
        newRecipes: [],
        updatedCount: 0,
      };
      summaries.set(recipe.groupId, summary);
    }

    if (isNew) {
      summary.newRecipes.push({
        id: recipe.id,
        slug: recipe.slug,
        title: recipe.title,
        authorName: recipe.authorName,
      });
    } else {
      summary.updatedCount += 1;
    }
  }

  const groups = [...summaries.values()]
    .filter((s) => s.newRecipes.length > 0 || s.updatedCount > 0)
    .sort(
      (a, b) =>
        b.newRecipes.length - a.newRecipes.length ||
        b.updatedCount - a.updatedCount,
    );

  const totalNew = groups.reduce((n, g) => n + g.newRecipes.length, 0);
  const totalUpdated = groups.reduce((n, g) => n + g.updatedCount, 0);

  if (totalNew === 0 && totalUpdated === 0) return null;

  return { periodDays: windowDays, since, totalNew, totalUpdated, groups };
}
