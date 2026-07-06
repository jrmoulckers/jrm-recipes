/**
 * Pure, framework-agnostic logic for the recipe "Reel" (9:16 short video) export.
 *
 * Everything here is deterministic and DOM-free so it can be unit-tested and
 * reused by the client renderer. The renderer (canvas + MediaRecorder) consumes
 * the ordered {@link ReelScene} list this module produces; it never re-derives
 * layout decisions itself.
 *
 * Visual language mirrors the share-card system in
 * `src/app/(main)/recipes/[id]/_assets/card.tsx` (same brand palette + fonts).
 */

/** Output frame — vertical 1080x1920 (9:16), the Reels/TikTok/Stories standard. */
export const REEL_SIZE = { width: 1080, height: 1920 } as const;

/** Capture frame rate. 30fps is plenty for text/photo motion and keeps files small. */
export const REEL_FPS = 30;

/** Brand palette — kept in lockstep with the share card. */
export const REEL_COLORS = {
  cream: "#fffaf3",
  ink: "#3d2817",
  terracotta: "#b45309",
  terracottaDeep: "#7c3d06",
  muted: "#6f5844",
} as const;

export type ReelDifficulty = "easy" | "medium" | "hard";

/** Difficulty dot colors, matching the share card. */
export const DIFFICULTY_DOT: Record<ReelDifficulty, string> = {
  easy: "#2f7d4f",
  medium: "#b4690e",
  hard: "#a23b2f",
};

/** Serializable ingredient line for the reel. */
export type ReelIngredientInput = {
  item: string;
  quantity?: number | null;
  quantityMax?: number | null;
  unit?: string | null;
  optional?: boolean | null;
};

/** Serializable step for the reel. */
export type ReelStepInput = {
  instruction: string;
  imageUrl?: string | null;
};

/**
 * Serializable recipe shape the client renderer receives. This is a plain object
 * (no server-only types) so it can cross the server/client boundary as props.
 */
export type ReelRecipe = {
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  author?: string | null;
  group?: string | null;
  totalMinutes?: number | null;
  servings?: number | null;
  servingsNoun?: string | null;
  difficulty?: ReelDifficulty | null;
  cuisine?: string | null;
  ingredients: ReelIngredientInput[];
  steps: ReelStepInput[];
};

/** A single ingredient chip/line shown in the reel. */
export type ReelIngredient = { text: string; optional: boolean };

/** A single method step shown in the reel. */
export type ReelStep = {
  /** 1-based position within the *original* recipe (so viewers can follow along). */
  number: number;
  totalSteps: number;
  instruction: string;
  imageUrl: string | null;
};

export type ReelChip = { label: string; dot?: string };

/** Discriminated union of every scene the renderer can draw. */
export type ReelScene =
  | {
      kind: "cover";
      durationMs: number;
      title: string;
      byline: string | null;
      chips: ReelChip[];
      imageUrl: string | null;
    }
  | {
      kind: "ingredients";
      durationMs: number;
      heading: string;
      items: ReelIngredient[];
      imageUrl: string | null;
    }
  | {
      kind: "step";
      durationMs: number;
      step: ReelStep;
      imageUrl: string | null;
    }
  | {
      kind: "outro";
      durationMs: number;
      headline: string;
      title: string;
      siteUrl: string;
    };

/** Site wordmark shown on the outro. */
export const REEL_SITE_URL = "heirloom.jrmoulckers.com";

/** Scene duration budget (ms). Tuned so the whole reel lands ~8–20s. */
export const SCENE_MS = {
  cover: 3000,
  ingredients: 3500,
  step: 3000,
  outro: 2500,
} as const;

/** Hard caps so a huge recipe still produces a snappy, postable reel. */
export const REEL_LIMITS = {
  maxIngredients: 6,
  maxSteps: 5,
} as const;

/** Round a float to at most 2 decimals, dropping trailing zeros ("0.50" -> "0.5"). */
function tidyNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/**
 * Format one ingredient into a compact human line, e.g.
 * `{quantity: 2, unit: "cup", item: "flour"}` -> `"2 cup flour"`.
 * Ranges (`quantity`..`quantityMax`) render as `"2–3 cup ..."`.
 */
export function formatIngredientLine(ing: ReelIngredientInput): string {
  const parts: string[] = [];
  if (typeof ing.quantity === "number" && ing.quantity > 0) {
    const min = tidyNumber(ing.quantity);
    if (typeof ing.quantityMax === "number" && ing.quantityMax > ing.quantity) {
      parts.push(`${min}\u2013${tidyNumber(ing.quantityMax)}`);
    } else {
      parts.push(min);
    }
  }
  if (ing.unit?.trim()) parts.push(ing.unit.trim());
  parts.push(ing.item.trim());
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Compact minutes formatter (e.g. 90 -> "1 hr 30 min", 45 -> "45 min"). */
export function formatMinutesShort(total: number): string {
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/**
 * Build the meta chips (time / servings / difficulty / cuisine), mirroring the
 * share card's chip logic so the two surfaces stay visually consistent.
 */
export function metaChips(recipe: ReelRecipe): ReelChip[] {
  const chips: ReelChip[] = [];
  if (recipe.totalMinutes && recipe.totalMinutes > 0) {
    chips.push({ label: formatMinutesShort(recipe.totalMinutes) });
  }
  if (recipe.servings && recipe.servings > 0) {
    chips.push({ label: `Serves ${recipe.servings}` });
  }
  if (recipe.difficulty) {
    const d = recipe.difficulty;
    chips.push({
      label: d.charAt(0).toUpperCase() + d.slice(1),
      dot: DIFFICULTY_DOT[d],
    });
  }
  if (recipe.cuisine?.trim()) {
    chips.push({ label: recipe.cuisine.trim() });
  }
  return chips;
}

/** Build the cover byline ("by X · Group"), or null when we have neither. */
export function coverByline(recipe: ReelRecipe): string | null {
  const parts: string[] = [];
  const author = recipe.author?.trim();
  const group = recipe.group?.trim();
  if (author) parts.push(`by ${author}`);
  if (group) parts.push(group);
  return parts.length ? parts.join("  \u00b7  ") : null;
}

/**
 * Choose which ingredients to feature. Non-optional (core) ingredients come
 * first, then optional ones, capped at {@link REEL_LIMITS.maxIngredients}.
 */
export function selectKeyIngredients(recipe: ReelRecipe): ReelIngredient[] {
  const lines = recipe.ingredients
    .filter((i) => i.item?.trim())
    .map((i) => ({
      text: formatIngredientLine(i),
      optional: Boolean(i.optional),
    }));
  const core = lines.filter((l) => !l.optional);
  const optional = lines.filter((l) => l.optional);
  return [...core, ...optional].slice(0, REEL_LIMITS.maxIngredients);
}

/**
 * Return `count` indices spread across `[0, length)`, always including the
 * endpoints. e.g. length=10, count=5 -> [0, 2, 4, 7, 9].
 */
export function evenlySpacedIndices(length: number, count: number): number[] {
  if (length <= 0 || count <= 0) return [];
  if (count >= length) return Array.from({ length }, (_, i) => i);
  if (count === 1) return [0];
  const out: number[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i * (length - 1)) / (count - 1));
    if (!seen.has(idx)) {
      seen.add(idx);
      out.push(idx);
    }
  }
  // Rounding collisions can leave us short; backfill with the next free indices
  // so we return exactly `count` distinct positions when possible.
  for (let i = 0; i < length && out.length < count; i++) {
    if (!seen.has(i)) {
      seen.add(i);
      out.push(i);
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * Pick an evenly-spread subset of steps (always including the first and last),
 * capped at {@link REEL_LIMITS.maxSteps}, preserving each step's original number.
 */
export function selectKeySteps(recipe: ReelRecipe): ReelStep[] {
  const all = recipe.steps
    .map((s, i) => ({ step: s, number: i + 1 }))
    .filter((s) => s.step.instruction?.trim());
  const total = all.length;
  if (total === 0) return [];

  const pickedIdx = evenlySpacedIndices(total, Math.min(REEL_LIMITS.maxSteps, total));

  return pickedIdx.map((idx) => {
    const { step, number } = all[idx]!;
    return {
      number,
      totalSteps: total,
      instruction: step.instruction.trim(),
      imageUrl: step.imageUrl?.trim() ? step.imageUrl.trim() : null,
    };
  });
}

/**
 * Turn a recipe into the ordered scene list the renderer plays:
 * cover -> ingredients (if any) -> key steps -> outro.
 *
 * Always yields at least a cover and an outro, so even an empty recipe produces
 * a valid, branded reel.
 */
export function buildReelScenes(recipe: ReelRecipe): ReelScene[] {
  const scenes: ReelScene[] = [];
  const cover = recipe.coverImageUrl?.trim() ? recipe.coverImageUrl.trim() : null;

  scenes.push({
    kind: "cover",
    durationMs: SCENE_MS.cover,
    title: recipe.title.trim() || "Untitled recipe",
    byline: coverByline(recipe),
    chips: metaChips(recipe),
    imageUrl: cover,
  });

  const ingredients = selectKeyIngredients(recipe);
  if (ingredients.length > 0) {
    scenes.push({
      kind: "ingredients",
      durationMs: SCENE_MS.ingredients,
      heading: "You'll need",
      items: ingredients,
      imageUrl: cover,
    });
  }

  for (const step of selectKeySteps(recipe)) {
    scenes.push({
      kind: "step",
      durationMs: SCENE_MS.step,
      step,
      imageUrl: step.imageUrl,
    });
  }

  scenes.push({
    kind: "outro",
    durationMs: SCENE_MS.outro,
    headline: "Family recipes, kept alive.",
    title: recipe.title.trim() || "Untitled recipe",
    siteUrl: REEL_SITE_URL,
  });

  return scenes;
}

/** Total runtime of a scene list in milliseconds. */
export function totalDurationMs(scenes: ReelScene[]): number {
  return scenes.reduce((sum, s) => sum + s.durationMs, 0);
}

/**
 * Given a global elapsed time, find which scene is on screen and how far through
 * it we are (0..1). Returns null once the reel has finished.
 */
export function sceneAtTime(
  scenes: ReelScene[],
  elapsedMs: number,
): { index: number; scene: ReelScene; progress: number } | null {
  if (elapsedMs < 0) return null;
  let acc = 0;
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]!;
    if (elapsedMs < acc + scene.durationMs) {
      const progress = (elapsedMs - acc) / scene.durationMs;
      return { index: i, scene, progress };
    }
    acc += scene.durationMs;
  }
  return null;
}

/**
 * Rewrite a Cloudinary delivery URL to request an optimized 9:16 crop at the
 * given size. No-op for non-Cloudinary hosts (returns the URL untouched).
 */
export function reelImageUrl(
  url: string | null | undefined,
  width: number = REEL_SIZE.width,
  height: number = REEL_SIZE.height,
): string | null {
  if (!url) return null;
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) {
    return url;
  }
  const t = `f_auto,q_auto,w_${width},h_${height},c_fill,g_auto`;
  return url.replace("/upload/", `/upload/${t}/`);
}

const DIFFICULTIES: ReelDifficulty[] = ["easy", "medium", "hard"];

function asDifficulty(value: unknown): ReelDifficulty | null {
  return DIFFICULTIES.includes(value as ReelDifficulty)
    ? (value as ReelDifficulty)
    : null;
}

/**
 * Map an already-loaded/authorized recipe onto the serializable {@link ReelRecipe}.
 * Accepts a structurally-typed subset so both the server page (FullRecipe) and
 * tests can call it without importing server-only types.
 */
export function mapRecipeToReel(recipe: {
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  author?: { name?: string | null } | null;
  group?: { name?: string | null } | null;
  totalMinutes?: number | null;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  servings?: number | null;
  servingsNoun?: string | null;
  difficulty?: string | null;
  cuisine?: string | null;
  ingredients: ReelIngredientInput[];
  steps: ReelStepInput[];
}): ReelRecipe {
  const total =
    recipe.totalMinutes ??
    ((recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0) || null);

  return {
    title: recipe.title,
    description: recipe.description ?? null,
    coverImageUrl: recipe.coverImageUrl ?? null,
    author: recipe.author?.name ?? null,
    group: recipe.group?.name ?? null,
    totalMinutes: total,
    servings: recipe.servings ?? null,
    servingsNoun: recipe.servingsNoun ?? null,
    difficulty: asDifficulty(recipe.difficulty),
    cuisine: recipe.cuisine ?? null,
    ingredients: recipe.ingredients.map((i) => ({
      item: i.item,
      quantity: i.quantity ?? null,
      quantityMax: i.quantityMax ?? null,
      unit: i.unit ?? null,
      optional: i.optional ?? false,
    })),
    steps: recipe.steps.map((s) => ({
      instruction: s.instruction,
      imageUrl: s.imageUrl ?? null,
    })),
  };
}
