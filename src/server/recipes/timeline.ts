/**
 * Pure helpers for recipe adaptations + timelines. Kept free of `db` and
 * `server-only` so the fork-cloning shape and timeline ordering can be unit
 * tested without a database.
 */
import type { RecipeEventType } from "~/server/db/schema";
import type { RecipeInput } from "./validation";

/** A source recipe with the related rows needed to deep-clone it into a fork. */
export type AdaptationSource = {
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  servings?: number | null;
  servingsNoun?: string | null;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  totalMinutes?: number | null;
  difficulty?: RecipeInput["difficulty"] | null;
  cuisine?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
  ingredients: {
    section?: string | null;
    quantity?: number | null;
    quantityMax?: number | null;
    unit?: string | null;
    item: string;
    note?: string | null;
    optional: boolean;
  }[];
  steps: {
    section?: string | null;
    instruction: string;
    imageUrl?: string | null;
    videoUrl?: string | null;
    timerSeconds?: number | null;
    techniques?: string[] | null;
  }[];
  tags: { tag: { name: string } }[];
};

const ADAPTATION_MARKER = "(Adaptation)";

/**
 * Title for a freshly-forked recipe: the source title plus a gentle marker so
 * the family can tell a variant from its original at a glance. Idempotent — we
 * never stack the marker if the source is already tagged.
 */
export function adaptationTitle(sourceTitle: string): string {
  const base = sourceTitle.trim();
  if (base.endsWith(ADAPTATION_MARKER)) return base;
  const withMarker = `${base} ${ADAPTATION_MARKER}`;
  // Respect the recipes.title varchar(200) limit; trim the base if needed.
  if (withMarker.length <= 200) return withMarker;
  const room = 200 - ADAPTATION_MARKER.length - 1;
  return `${base.slice(0, room).trimEnd()} ${ADAPTATION_MARKER}`;
}

/**
 * Deep-clone a viewable recipe into the `RecipeInput` for a new adaptation:
 * every ingredient, step (incl. media + techniques), and tag is copied. The
 * fork always starts as a private draft owned by whoever forks it.
 */
export function buildAdaptationInput(source: AdaptationSource): RecipeInput {
  return {
    title: adaptationTitle(source.title),
    description: source.description ?? undefined,
    coverImageUrl: source.coverImageUrl ?? undefined,
    servings: source.servings ?? undefined,
    servingsNoun: source.servingsNoun ?? undefined,
    prepMinutes: source.prepMinutes ?? undefined,
    cookMinutes: source.cookMinutes ?? undefined,
    totalMinutes: source.totalMinutes ?? undefined,
    difficulty: source.difficulty ?? undefined,
    cuisine: source.cuisine ?? undefined,
    sourceName: source.sourceName ?? undefined,
    sourceUrl: source.sourceUrl ?? undefined,
    notes: source.notes ?? undefined,
    visibility: "private",
    status: "draft",
    groupId: undefined,
    ingredients: source.ingredients.map((ing) => ({
      section: ing.section ?? undefined,
      quantity: ing.quantity ?? undefined,
      quantityMax: ing.quantityMax ?? undefined,
      unit: ing.unit ?? undefined,
      item: ing.item,
      note: ing.note ?? undefined,
      optional: ing.optional,
    })),
    steps: source.steps.map((step) => ({
      section: step.section ?? undefined,
      instruction: step.instruction,
      imageUrl: step.imageUrl ?? undefined,
      videoUrl: step.videoUrl ?? undefined,
      timerSeconds: step.timerSeconds ?? undefined,
      techniques: step.techniques ?? [],
    })),
    tags: source.tags.map((recipeTag) => recipeTag.tag.name),
  };
}

/** One rendered milestone in a recipe's timeline. */
export type TimelineEntry = {
  id: string;
  /** `adaptation` = a descendant fork of this recipe (a child link). */
  kind: RecipeEventType | "adaptation";
  note: string | null;
  createdAt: Date;
  actor: {
    name: string | null;
    handle: string | null;
    avatarUrl: string | null;
  } | null;
  /** Linked recipe: the origin for `adapted`, the fork for `adaptation`. */
  related: { slug: string; title: string } | null;
};

const KIND_ORDER: Record<TimelineEntry["kind"], number> = {
  created: 0,
  adapted: 0,
  updated: 1,
  suggestion_applied: 1,
  published: 2,
  adaptation: 3,
};

/**
 * Order timeline entries oldest-first so a recipe reads like a family history.
 * Ties on the same timestamp fall back to a stable milestone ordering (a recipe
 * is created before it is updated, published, or spawns adaptations).
 */
export function assembleTimeline(entries: TimelineEntry[]): TimelineEntry[] {
  return [...entries].sort((a, b) => {
    const byTime = a.createdAt.getTime() - b.createdAt.getTime();
    if (byTime !== 0) return byTime;
    return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  });
}
