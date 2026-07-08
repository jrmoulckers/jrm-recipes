import { type Nutrition } from "~/lib/nutrition";

export type CookIngredient = {
  id: string;
  position: number;
  section: string | null;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  item: string;
  note: string | null;
  /** Structured prep state, e.g. "diced", "softened", "room-temp" (#401). */
  prep?: string | null;
  /** 1-based ordinal of the step that uses this ingredient, or null (#425). */
  stepPosition?: number | null;
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
  /** Target internal/oven temperature in °C, or null (#417). */
  targetTempC?: number | null;
  /** Short doneness cue, e.g. "golden brown", or null (#417). */
  doneness?: string | null;
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
  /** Inactive/rest time in minutes, separate from prep + cook (#409). */
  restMinutes?: number | null;
  /** What can be prepared ahead of time, free text (#409). */
  makeAheadNote?: string | null;
  /** Required tools/equipment, in author order (#410). */
  equipment?: string[] | null;
  notes: string | null;
  /** Owning group id (household), or null for a personal recipe. Used to tag
   * cook events for per-household retention (#338). */
  householdId: string | null;
  nutrition: Nutrition;
  ingredients: CookIngredient[];
  steps: CookStep[];
};
