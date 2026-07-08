export type CookIngredient = {
  id: string;
  position: number;
  section: string | null;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  item: string;
  note: string | null;
  optional: boolean;
};

export type CookStep = {
  id: string;
  position: number;
  section: string | null;
  instruction: string;
  imageUrl: string | null;
  videoUrl: string | null;
  timerSeconds: number | null;
  techniques: string[] | null;
};

export type CookRecipe = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  servings: number | null;
  servingsNoun: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  notes: string | null;
  /** Owning group id (household), or null for a personal recipe. Used to tag
   * cook events for per-household retention (#338). */
  householdId: string | null;
  ingredients: CookIngredient[];
  steps: CookStep[];
};
