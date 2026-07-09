import {
  formatIngredientLine,
  formatRecipeMeta,
  formatStepLine,
  groupIngredients,
  groupSteps,
  provenanceLines,
} from "~/components/print/export";
import type { PrintRecipe } from "~/components/print/types";

/**
 * A single recipe laid out for print/keepsake surfaces (issues #397/#407):
 * title, meta, ingredients, method, notes, and heritage. Purely presentational
 * and built from the already-tested print serializers, so it renders identically
 * on paper and never touches server-only data.
 */
export function RecipePrintBody({ recipe }: { recipe: PrintRecipe }) {
  const meta = formatRecipeMeta(recipe);
  const provenance = provenanceLines(recipe);
  let stepNumber = 0;

  return (
    <div>
      <h2 className="font-display text-2xl font-bold tracking-tight">
        {recipe.title}
      </h2>
      {recipe.description ? (
        <p className="mt-2 text-muted-foreground">{recipe.description}</p>
      ) : null}
      {meta.length > 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{meta.join(" · ")}</p>
      ) : null}

      <section className="mt-6">
        <h3 className="font-display text-lg font-semibold">Ingredients</h3>
        {recipe.ingredients.length === 0 ? (
          <p className="mt-1 text-muted-foreground">No ingredients listed.</p>
        ) : (
          groupIngredients(recipe.ingredients).map((group, groupIndex) => (
            <div key={group.section ?? `ing-${groupIndex}`} className="mt-2">
              {group.section ? (
                <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.section}
                </h4>
              ) : null}
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {group.items.map((ingredient) => (
                  <li key={ingredient.id}>{formatIngredientLine(ingredient)}</li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="mt-6">
        <h3 className="font-display text-lg font-semibold">Method</h3>
        {recipe.steps.length === 0 ? (
          <p className="mt-1 text-muted-foreground">No steps listed.</p>
        ) : (
          groupSteps(recipe.steps).map((group, groupIndex) => (
            <div key={group.section ?? `step-${groupIndex}`} className="mt-2">
              {group.section ? (
                <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.section}
                </h4>
              ) : null}
              <ol className="mt-1 space-y-2">
                {group.items.map((step) => {
                  stepNumber += 1;
                  return (
                    <li key={step.id} className="flex gap-3">
                      <span className="font-display font-semibold text-primary">
                        {stepNumber}.
                      </span>
                      <span>{formatStepLine(step)}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))
        )}
      </section>

      {recipe.notes ? (
        <section className="mt-6">
          <h3 className="font-display text-lg font-semibold">Notes</h3>
          <p className="mt-1 whitespace-pre-line text-muted-foreground">
            {recipe.notes.trim()}
          </p>
        </section>
      ) : null}

      {recipe.story || provenance.length > 0 ? (
        <section className="mt-6">
          <h3 className="font-display text-lg font-semibold">Story</h3>
          {provenance.map((line) => (
            <p key={line} className="mt-1 text-sm italic text-muted-foreground">
              {line}
            </p>
          ))}
          {recipe.story ? (
            <p className="mt-2 whitespace-pre-line text-muted-foreground">
              {recipe.story.trim()}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
