/**
 * Deterministic, offline plain-text recipe parser (#370).
 *
 * URL import needs a site to publish schema.org JSON-LD, but most heirloom
 * recipes arrive as freeform text — a relative's message, a typed note, an
 * OCR'd index card. This parser splits that text into the editor's row shapes
 * ({@link ImportedRecipe}) using only heuristics: a title, an ingredients
 * block, and a steps block. Ingredient lines reuse {@link parseIngredientLine}
 * (and thus the shared unit normalization); anything it can't structure still
 * imports as item text. Pure and unit-tested — no network, no AI.
 */
import {
  parseIngredientLine,
  type ImportedIngredient,
  type ImportedRecipe,
  type ImportedStep,
} from "./import";

const EMPTY: ImportedRecipe = {
  title: "",
  description: "",
  coverImageUrl: "",
  servings: "",
  servingsNoun: "",
  prepMinutes: "",
  cookMinutes: "",
  cuisine: "",
  sourceName: "",
  sourceUrl: "",
  tags: "",
  ingredients: [],
  steps: [],
};

const INGREDIENT_HEADINGS = ["ingredients", "you will need", "you'll need"];
const STEP_HEADINGS = [
  "instructions",
  "directions",
  "method",
  "steps",
  "preparation",
  "directions",
  "to make",
];

/** Normalize a line to a comparable heading token (letters only, lowercased). */
function headingToken(line: string): string {
  return line
    .toLowerCase()
    .replace(/[^a-z' ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesHeading(line: string, headings: string[]): boolean {
  const token = headingToken(line);
  if (!token || token.length > 30) return false;
  return headings.some((h) => token === h || token === `${h} list`);
}

/** Strip a leading bullet or ordinal marker ("1.", "1)", "-", "•", "Step 2:"). */
function stripMarker(line: string): string {
  return line
    .replace(/^\s*step\s*\d+\s*[:.)-]?\s*/i, "")
    .replace(/^\s*\d+\s*[.)]\s+/, "")
    .replace(/^\s*[-*•·]\s+/, "")
    .trim();
}

const QUANTITY_PREFIX =
  /^\s*(?:[-*•·]\s*)?(?:\d+[\d.,/\s-]*|[½¼¾⅓⅔⅛⅜⅝⅞]|a\s|an\s|one\s|two\s|three\s|half\s)/i;

function looksLikeIngredient(line: string): boolean {
  if (/^\s*[-*•·]\s+/.test(line)) return true;
  return QUANTITY_PREFIX.test(line);
}

const NUMBERED_STEP = /^\s*(?:step\s*)?\d+\s*[.)]\s+/i;

function looksLikeNumberedStep(line: string): boolean {
  return NUMBERED_STEP.test(line);
}

function wordCount(line: string): number {
  return line.trim().split(/\s+/).filter(Boolean).length;
}

function toStep(instruction: string): ImportedStep {
  return {
    section: "",
    instruction,
    imageUrl: "",
    videoUrl: "",
    timerMinutes: "",
    techniques: "",
  };
}

function buildSteps(lines: string[]): ImportedStep[] {
  return lines
    .map(stripMarker)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(toStep);
}

function buildIngredients(lines: string[]): ImportedIngredient[] {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => parseIngredientLine(stripMarker(l)))
    .filter((ing) => ing.item.trim().length > 0);
}

/**
 * Parse freeform recipe text into the editor's row shapes. Never throws; an
 * unrecognizable blob still yields a title (first line) so the user lands in the
 * editor with something to edit.
 */
export function parseRecipeText(raw: string): ImportedRecipe {
  const text = (raw ?? "").replace(/\r\n?/g, "\n");
  const rawLines = text.split("\n");
  const lines = rawLines.map((l) => l.trim());

  // Locate section headings.
  let ingredientsAt = -1;
  let stepsAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line) continue;
    if (ingredientsAt === -1 && matchesHeading(line, INGREDIENT_HEADINGS)) {
      ingredientsAt = i;
    } else if (stepsAt === -1 && matchesHeading(line, STEP_HEADINGS)) {
      stepsAt = i;
    }
  }

  const firstNonEmpty = lines.findIndex((l) => l.length > 0);
  if (firstNonEmpty === -1) return { ...EMPTY };

  // Title: the first non-empty line that isn't itself a section heading.
  const headingRow = ingredientsAt === -1 ? stepsAt : ingredientsAt;
  const titleIdx =
    headingRow > firstNonEmpty || headingRow === -1 ? firstNonEmpty : -1;
  const title = titleIdx >= 0 ? lines[titleIdx]! : "";

  let ingredientLines: string[] = [];
  let stepLines: string[] = [];

  if (ingredientsAt !== -1 || stepsAt !== -1) {
    // Heading-driven split.
    if (ingredientsAt !== -1) {
      const end = stepsAt > ingredientsAt ? stepsAt : lines.length;
      ingredientLines = lines.slice(ingredientsAt + 1, end);
    }
    if (stepsAt !== -1) {
      const end =
        ingredientsAt > stepsAt ? ingredientsAt : lines.length;
      stepLines = lines.slice(stepsAt + 1, end);
    }
  } else {
    // No headings: classify heuristically. Everything after the title is an
    // ingredient until the first numbered step or a clearly prose sentence,
    // after which the remainder is steps.
    const body = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line, index }) => line.length > 0 && index !== titleIdx);

    let splitAt = body.length;
    for (let i = 0; i < body.length; i++) {
      const { line } = body[i]!;
      const numbered = looksLikeNumberedStep(line);
      const prose = !looksLikeIngredient(line) && wordCount(line) >= 8;
      if (numbered || (prose && i > 0)) {
        splitAt = i;
        break;
      }
    }
    ingredientLines = body.slice(0, splitAt).map((b) => b.line);
    stepLines = body.slice(splitAt).map((b) => b.line);

    // If nothing looked like an ingredient, treat the whole body as steps.
    if (ingredientLines.every((l) => !looksLikeIngredient(l)) && stepLines.length === 0) {
      stepLines = ingredientLines;
      ingredientLines = [];
    }
  }

  return {
    ...EMPTY,
    title,
    ingredients: buildIngredients(ingredientLines),
    steps: buildSteps(stepLines),
  };
}
