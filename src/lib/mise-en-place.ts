/**
 * Mise en place derivation (#402): turn a recipe's EXISTING ingredients into a
 * pre-cook "gather & prep" view — grouped by ingredient section, with prep
 * tasks pulled from the structured `prep` field (#401). Pure and framework-free
 * so Cook Mode and tests share the same logic; strictly read-only (no schema,
 * no persistence).
 */

/** The ingredient fields the mise en place derivation needs. */
export type MiseIngredient = {
  id: string;
  section: string | null;
  item: string;
  prep?: string | null;
  optional?: boolean;
};

export type MiseSection = {
  /** Section name, or null for ungrouped ingredients. */
  section: string | null;
  items: MiseIngredient[];
};

export type PrepTask = {
  /** Owning ingredient id, used as a stable React key. */
  id: string;
  item: string;
  prep: string;
  optional: boolean;
};

/**
 * Group ingredients by their section, preserving both the order sections first
 * appear and the order of items within each section. Ungrouped ingredients
 * (null section) keep their own bucket.
 */
export function groupIngredientsBySection(
  ingredients: readonly MiseIngredient[],
): MiseSection[] {
  const order: (string | null)[] = [];
  const buckets = new Map<string | null, MiseIngredient[]>();

  for (const ingredient of ingredients) {
    const key = ingredient.section?.trim() ? ingredient.section : null;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)?.push(ingredient);
  }

  return order.map((section) => ({
    section,
    items: buckets.get(section) ?? [],
  }));
}

/**
 * Derive the "prep ahead" tasks: one per ingredient that carries a non-empty
 * `prep` note (e.g. "diced", "softened"), in recipe order. Ingredients without
 * prep are skipped so the list stays focused on actual knife/prep work.
 */
export function derivePrepTasks(
  ingredients: readonly MiseIngredient[],
): PrepTask[] {
  const tasks: PrepTask[] = [];
  for (const ingredient of ingredients) {
    const prep = ingredient.prep?.trim();
    if (!prep) continue;
    tasks.push({
      id: ingredient.id,
      item: ingredient.item,
      prep,
      optional: ingredient.optional ?? false,
    });
  }
  return tasks;
}

/** Whether a recipe has anything to gather (i.e. a mise en place is useful). */
export function hasMiseEnPlace(ingredients: readonly MiseIngredient[]): boolean {
  return ingredients.length > 0;
}
