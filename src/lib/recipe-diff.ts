/**
 * Pure, dependency-free diff of two recipe version snapshots (#358).
 *
 * `recipe_versions.snapshot` is validated into a {@link RecipeInput} by
 * `parseSnapshot`; this module compares two such payloads (or `null` for a
 * missing/legacy snapshot) and produces a structured, render-ready diff of the
 * scalar fields, ingredient lines, and steps. It never throws on malformed or
 * differently-shaped input — a `null` side is treated as an empty recipe so a
 * brand-new or legacy version still diffs cleanly.
 *
 * Kept free of React / DB imports so it can be unit-tested in isolation and
 * reused on the client.
 */
import type {
  IngredientInput,
  RecipeInput,
  StepInput,
} from "~/server/recipes/validation";

/** A changed scalar field (title, times, servings, notes, …). */
export type FieldChange = {
  key: string;
  label: string;
  before: string | null;
  after: string | null;
};

export type LineChangeKind = "added" | "removed" | "changed" | "unchanged";

/** One aligned line in an ingredient or step diff. */
export type LineDiff = {
  kind: LineChangeKind;
  /** Formatted text of the line before the change (null when added). */
  before: string | null;
  /** Formatted text of the line after the change (null when removed). */
  after: string | null;
};

export type SectionDiff = {
  lines: LineDiff[];
  added: number;
  removed: number;
  changed: number;
};

export type RecipeDiff = {
  fields: FieldChange[];
  ingredients: SectionDiff;
  steps: SectionDiff;
  /** Whether the two snapshots are identical across every tracked surface. */
  identical: boolean;
  summary: { changed: number; added: number; removed: number };
};

function str(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

function num(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

/** Human-readable one-line rendering of an ingredient row. */
export function formatIngredientLine(ing: IngredientInput): string {
  const qty =
    ing.quantity != null &&
    ing.quantityMax != null &&
    ing.quantityMax !== ing.quantity
      ? `${ing.quantity}–${ing.quantityMax}`
      : num(ing.quantity);
  const parts = [qty, str(ing.unit), str(ing.item)].filter(Boolean);
  let line = parts.join(" ");
  const extras: string[] = [];
  if (str(ing.prep)) extras.push(str(ing.prep));
  if (str(ing.note)) extras.push(str(ing.note));
  if (extras.length) line += ` (${extras.join(", ")})`;
  if (ing.optional) line += " · optional";
  return line.trim();
}

/** Human-readable one-line rendering of a method step. */
export function formatStepLine(step: StepInput): string {
  const section = str(step.section);
  const instruction = str(step.instruction);
  return section ? `${section}: ${instruction}` : instruction;
}

/**
 * Longest-common-subsequence alignment over line "keys", used to distinguish
 * inserts/removes from in-place edits. Returns indices of matched pairs.
 */
function lcsPairs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        a[i] === b[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

/**
 * Diff two ordered lists of items into added/removed/changed/unchanged lines.
 * Alignment is by `key` (stable identity such as the ingredient item text);
 * aligned rows whose `display` differs are reported as `changed`.
 */
function diffLines<T>(
  before: T[],
  after: T[],
  key: (item: T) => string,
  display: (item: T) => string,
  pairGaps = false,
): SectionDiff {
  const beforeKeys = before.map(key);
  const afterKeys = after.map(key);
  const pairs = lcsPairs(beforeKeys, afterKeys);

  const lines: LineDiff[] = [];
  let added = 0;
  let removed = 0;
  let changed = 0;

  const pushRow = (bItem: T | null, aItem: T | null) => {
    if (bItem != null && aItem != null) {
      const beforeText = display(bItem);
      const afterText = display(aItem);
      if (beforeText === afterText) {
        lines.push({ kind: "unchanged", before: beforeText, after: afterText });
      } else {
        lines.push({ kind: "changed", before: beforeText, after: afterText });
        changed++;
      }
    } else if (bItem != null) {
      lines.push({ kind: "removed", before: display(bItem), after: null });
      removed++;
    } else if (aItem != null) {
      lines.push({ kind: "added", before: null, after: display(aItem) });
      added++;
    }
  };

  // Emit the unmatched rows sitting between two anchors. When `pairGaps` is set
  // (steps, which are positional), leftover before/after rows are paired into
  // `changed` edits; otherwise they stay as discrete removed/added rows.
  const flushGap = (bItems: T[], aItems: T[]) => {
    if (pairGaps) {
      const shared = Math.min(bItems.length, aItems.length);
      for (let k = 0; k < shared; k++) pushRow(bItems[k]!, aItems[k]!);
      for (let k = shared; k < bItems.length; k++) pushRow(bItems[k]!, null);
      for (let k = shared; k < aItems.length; k++) pushRow(null, aItems[k]!);
    } else {
      for (const item of bItems) pushRow(item, null);
      for (const item of aItems) pushRow(null, item);
    }
  };

  let bi = 0;
  let ai = 0;
  for (const [pb, pa] of pairs) {
    flushGap(before.slice(bi, pb), after.slice(ai, pa));
    pushRow(before[pb]!, after[pa]!);
    bi = pb + 1;
    ai = pa + 1;
  }
  flushGap(before.slice(bi), after.slice(ai));

  return { lines, added, removed, changed };
}

const SCALAR_FIELDS: Array<{
  key: keyof RecipeInput;
  label: string;
}> = [
  { key: "title", label: "Title" },
  { key: "description", label: "Description" },
  { key: "servings", label: "Servings" },
  { key: "servingsNoun", label: "Serving unit" },
  { key: "prepMinutes", label: "Prep time" },
  { key: "cookMinutes", label: "Cook time" },
  { key: "totalMinutes", label: "Total time" },
  { key: "restMinutes", label: "Rest time" },
  { key: "difficulty", label: "Difficulty" },
  { key: "cuisine", label: "Cuisine" },
  { key: "notes", label: "Notes" },
];

const EMPTY_RECIPE: Partial<RecipeInput> = {
  title: "",
  ingredients: [],
  steps: [],
};

function fieldValue(
  recipe: Partial<RecipeInput>,
  key: keyof RecipeInput,
): string {
  const value = recipe[key];
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

/**
 * Compare two recipe snapshots. Either side may be `null` (missing/legacy
 * version) and is treated as an empty recipe. The result lists only *changed*
 * scalar fields plus a full aligned ingredient/step diff.
 */
export function diffRecipeSnapshots(
  before: RecipeInput | null,
  after: RecipeInput | null,
): RecipeDiff {
  const a = before ?? (EMPTY_RECIPE as RecipeInput);
  const b = after ?? (EMPTY_RECIPE as RecipeInput);

  const fields: FieldChange[] = [];
  for (const { key, label } of SCALAR_FIELDS) {
    const beforeVal = fieldValue(a, key);
    const afterVal = fieldValue(b, key);
    if (beforeVal !== afterVal) {
      fields.push({
        key: String(key),
        label,
        before: beforeVal || null,
        after: afterVal || null,
      });
    }
  }

  const ingredients = diffLines(
    a.ingredients ?? [],
    b.ingredients ?? [],
    (ing) => str(ing.item).toLowerCase(),
    formatIngredientLine,
  );
  const steps = diffLines(
    a.steps ?? [],
    b.steps ?? [],
    (step) => str(step.instruction).toLowerCase().slice(0, 80),
    formatStepLine,
    true,
  );

  const added = ingredients.added + steps.added;
  const removed = ingredients.removed + steps.removed;
  const changed = fields.length + ingredients.changed + steps.changed;

  return {
    fields,
    ingredients,
    steps,
    identical: added === 0 && removed === 0 && changed === 0,
    summary: { changed, added, removed },
  };
}
