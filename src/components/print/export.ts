import { displayUnit, formatQuantity } from "~/lib/units";
import { absoluteUrl, formatMinutes } from "~/lib/utils";
import type {
  PrintRecipe,
  PrintRecipeIngredient,
  PrintRecipeStep,
} from "~/components/print/types";

type SectionGroup<T> = {
  section: string | null;
  items: T[];
};

function capitalize(value: string): string {
  return value.length > 0
    ? `${value[0]?.toUpperCase()}${value.slice(1)}`
    : value;
}

function cleanLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function firstSentence(value: string | null): string | null {
  if (!value) return null;
  const clean = cleanLine(value);
  const sentence = /.*?[.!?](?:\s|$)/.exec(clean)?.[0]?.trim();
  return sentence ?? clean;
}

function groupBySection<T extends { section: string | null }>(
  items: T[],
): SectionGroup<T>[] {
  const groups: SectionGroup<T>[] = [];

  for (const item of items) {
    const existing = groups.find((group) => group.section === item.section);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ section: item.section, items: [item] });
    }
  }

  return groups;
}

export function groupIngredients(
  ingredients: PrintRecipeIngredient[],
): SectionGroup<PrintRecipeIngredient>[] {
  return groupBySection(ingredients);
}

export function groupSteps(
  steps: PrintRecipeStep[],
): SectionGroup<PrintRecipeStep>[] {
  return groupBySection(steps);
}

export function recipeUrl(recipe: Pick<PrintRecipe, "slug">): string {
  return absoluteUrl(`/recipes/${recipe.slug}`);
}

export function formatRecipeMeta(recipe: PrintRecipe): string[] {
  const meta: string[] = [];

  if (recipe.servings != null) {
    meta.push(
      `${formatQuantity(recipe.servings)} ${recipe.servingsNoun ?? "servings"}`,
    );
  }
  if (recipe.totalMinutes != null && recipe.totalMinutes > 0) {
    meta.push(`Total ${formatMinutes(recipe.totalMinutes)}`);
  }
  if (recipe.prepMinutes != null && recipe.prepMinutes > 0) {
    meta.push(`Prep ${formatMinutes(recipe.prepMinutes)}`);
  }
  if (recipe.cookMinutes != null && recipe.cookMinutes > 0) {
    meta.push(`Cook ${formatMinutes(recipe.cookMinutes)}`);
  }
  if (recipe.difficulty) meta.push(capitalize(recipe.difficulty));
  if (recipe.cuisine) meta.push(recipe.cuisine);

  return meta;
}

export function formatTimerLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (remainder === 0) return formatMinutes(minutes);

  return `${formatMinutes(minutes)} ${remainder} sec`;
}

export function formatIngredientAmount(
  ingredient: PrintRecipeIngredient,
): string {
  const unit = displayUnit(
    ingredient.unit,
    ingredient.quantityMax ?? ingredient.quantity,
  );

  if (ingredient.quantity == null) return unit;

  const quantity =
    ingredient.quantityMax != null
      ? `${formatQuantity(ingredient.quantity)}–${formatQuantity(
          ingredient.quantityMax,
        )}`
      : formatQuantity(ingredient.quantity);

  return [quantity, unit].filter(Boolean).join(" ");
}

export function formatIngredientLine(
  ingredient: PrintRecipeIngredient,
): string {
  const amount = formatIngredientAmount(ingredient);
  const note = ingredient.note ? ` — ${ingredient.note}` : "";
  const optional = ingredient.optional ? " (optional)" : "";

  return cleanLine(
    `${amount ? `${amount} ` : ""}${ingredient.item}${note}${optional}`,
  );
}

export function formatStepLine(step: PrintRecipeStep): string {
  const details = [
    step.timerSeconds != null
      ? `Timer: ${formatTimerLabel(step.timerSeconds)}`
      : null,
    step.techniques && step.techniques.length > 0
      ? `Techniques: ${step.techniques.join(", ")}`
      : null,
  ].filter((detail): detail is string => detail != null);

  return cleanLine(
    `${step.instruction}${details.length > 0 ? ` (${details.join("; ")})` : ""}`,
  );
}

function sourceLine(recipe: PrintRecipe): string | null {
  if (recipe.sourceName && recipe.sourceUrl) {
    return `Source: ${recipe.sourceName} — ${recipe.sourceUrl}`;
  }
  if (recipe.sourceUrl) return `Source: ${recipe.sourceUrl}`;
  if (recipe.sourceName) return `Source: ${recipe.sourceName}`;
  return null;
}

export function serializeRecipePlainText(recipe: PrintRecipe): string {
  const lines: string[] = [recipe.title, "=".repeat(recipe.title.length), ""];
  const meta = formatRecipeMeta(recipe);
  const source = sourceLine(recipe);
  let stepNumber = 1;

  if (recipe.description) lines.push(cleanLine(recipe.description), "");
  if (recipe.author?.name) lines.push(`By ${recipe.author.name}`);
  if (meta.length > 0) lines.push(meta.join(" · "));
  if (recipe.tags.length > 0) {
    lines.push(`Tags: ${recipe.tags.map(({ tag }) => tag.name).join(", ")}`);
  }
  if (lines.at(-1) !== "") lines.push("");

  lines.push("Ingredients");
  if (recipe.ingredients.length === 0) {
    lines.push("- No ingredients listed.");
  } else {
    for (const group of groupIngredients(recipe.ingredients)) {
      if (group.section) lines.push(`${group.section}:`);
      for (const ingredient of group.items) {
        lines.push(`- ${formatIngredientLine(ingredient)}`);
      }
    }
  }

  lines.push("", "Method");
  if (recipe.steps.length === 0) {
    lines.push("No steps listed.");
  } else {
    for (const group of groupSteps(recipe.steps)) {
      if (group.section) lines.push(`${group.section}:`);
      for (const step of group.items) {
        lines.push(`${stepNumber}. ${formatStepLine(step)}`);
        stepNumber += 1;
      }
    }
  }

  if (recipe.notes) lines.push("", "Notes", recipe.notes.trim());
  if (source) lines.push("", source);
  lines.push("", recipeUrl(recipe));

  return `${lines.join("\n").trim()}\n`;
}

export function serializeRecipeMarkdown(recipe: PrintRecipe): string {
  const lines: string[] = [`# ${recipe.title}`, ""];
  const meta = formatRecipeMeta(recipe);
  const source = sourceLine(recipe);
  let stepNumber = 1;

  if (recipe.description) lines.push(`_${cleanLine(recipe.description)}_`, "");
  if (recipe.author?.name) lines.push(`**By:** ${recipe.author.name}`);
  if (meta.length > 0) lines.push(`**Meta:** ${meta.join(" · ")}`);
  if (recipe.tags.length > 0) {
    lines.push(
      `**Tags:** ${recipe.tags.map(({ tag }) => `#${tag.name}`).join(" ")}`,
    );
  }
  if (lines.at(-1) !== "") lines.push("");

  lines.push("## Ingredients");
  if (recipe.ingredients.length === 0) {
    lines.push("- No ingredients listed.");
  } else {
    for (const group of groupIngredients(recipe.ingredients)) {
      if (group.section) lines.push("", `### ${group.section}`);
      for (const ingredient of group.items) {
        lines.push(`- ${formatIngredientLine(ingredient)}`);
      }
    }
  }

  lines.push("", "## Method");
  if (recipe.steps.length === 0) {
    lines.push("No steps listed.");
  } else {
    for (const group of groupSteps(recipe.steps)) {
      if (group.section) lines.push("", `### ${group.section}`);
      for (const step of group.items) {
        lines.push(`${stepNumber}. ${formatStepLine(step)}`);
        stepNumber += 1;
      }
    }
  }

  if (recipe.notes) lines.push("", "## Notes", recipe.notes.trim());
  if (source) lines.push("", source);
  lines.push("", `[Open recipe](${recipeUrl(recipe)})`);

  return `${lines.join("\n").trim()}\n`;
}

export function serializeShareCaption(recipe: PrintRecipe): string {
  return [recipe.title, firstSentence(recipe.description), recipeUrl(recipe)]
    .filter((line): line is string => line != null && line.length > 0)
    .join("\n");
}

export function recipeDownloadFilename(
  recipe: Pick<PrintRecipe, "slug" | "title">,
  extension: "md" | "txt",
): string {
  const fallback = recipe.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = recipe.slug.trim() || fallback || "recipe";

  return `${base}.${extension}`;
}
