export type PrintRecipeIngredient = {
  id: string;
  section: string | null;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  item: string;
  note: string | null;
  optional: boolean;
};

export type PrintRecipeStep = {
  id: string;
  section: string | null;
  instruction: string;
  timerSeconds: number | null;
  techniques: string[] | null;
};

export type PrintRecipeTag = {
  tag: {
    name: string;
    slug: string;
    category: 'meal' | 'cuisine' | 'dietary' | 'general';
  };
};

export type PrintRecipe = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  /** Author-written alt for the cover, or null to keep the current alt (#125). */
  coverImageAlt: string | null;
  visibility: string;
  servings: number | null;
  servingsNoun: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  difficulty: string | null;
  cuisine: string | null;
  cuisines: string[];
  sourceName: string | null;
  sourceUrl: string | null;
  notes: string | null;
  // Heritage fields (issues #377/#381). Optional so existing PrintRecipe
  // producers/fixtures stay valid. The backup export (#420) reads them so a
  // family's story and provenance are never lost when they take their data home.
  story?: string | null;
  handedDownFrom?: string | null;
  originYear?: string | null;
  originPlace?: string | null;
  author: {
    name: string | null;
  } | null;
  ingredients: PrintRecipeIngredient[];
  steps: PrintRecipeStep[];
  tags: PrintRecipeTag[];
};
