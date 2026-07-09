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
  };
};

export type PrintRecipe = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  visibility: string;
  servings: number | null;
  servingsNoun: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  difficulty: string | null;
  cuisine: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  notes: string | null;
  // Heritage fields (issues #377/#381) — optional so existing PrintRecipe
  // producers/fixtures stay valid; the backup export (#420) reads them so a
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
