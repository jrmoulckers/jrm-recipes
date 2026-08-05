import {
  Clock3,
  Flame,
  Hourglass,
  type LucideIcon,
  Sparkles,
  Thermometer,
  Timer,
  Users,
  Wrench,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { formatMinutes } from "~/lib/utils";
import { formatQuantity } from "~/lib/units";
import { DIETARY_TAG_LABELS } from "~/lib/substitutions";
import { Badge } from "~/components/ui/badge";
import type {
  IngredientInput,
  RecipeInput,
  StepInput,
} from "~/server/recipes/validation";

/** Group ingredients under their section, preserving first-appearance order.
 *  mirrors how the live recipe page renders grouped ingredients. */
function groupBySection(items: IngredientInput[]): {
  section: string | undefined;
  items: IngredientInput[];
}[] {
  const groups: { section: string | undefined; items: IngredientInput[] }[] =
    [];
  for (const item of items) {
    const section = item.section?.trim() ? item.section.trim() : undefined;
    const last = groups[groups.length - 1];
    if (last && last.section === section) last.items.push(item);
    else groups.push({ section, items: [item] });
  }
  return groups;
}

function formatTimer(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes && seconds) return `${minutes} min ${seconds} s`;
  if (minutes) return `${minutes} min`;
  return `${seconds} s`;
}

/**
 * A faithful, read-only render of the recipe the way cooks will see it on the
 * live recipe page. Mirroring that page's hero, grouped ingredients, and
 * numbered method. Driven straight off the editor's working payload so the
 * author can proof a recipe without saving and leaving the page (#follow-up).
 *
 * This intentionally reproduces the *presentation* rather than mounting the live
 * `IngredientsPanel`, which is coupled to persisted ids, nutrition, member
 * profiles, and network-backed suggestion slots that don't exist pre-save.
 */
export function RecipePreview({
  recipe,
  mode,
}: {
  recipe: RecipeInput;
  mode: "create" | "edit";
}) {
  const locale = useLocale();
  const t = useTranslations("recipePreview");
  const td = useTranslations("recipeDetail");

  const prep = recipe.prepMinutes ?? null;
  const cook = recipe.cookMinutes ?? null;
  const rest = recipe.restMinutes ?? null;
  const total = (prep ?? 0) + (cook ?? 0) + (rest ?? 0);

  const meta: { icon: LucideIcon; label: string }[] = [];
  if (total > 0) meta.push({ icon: Clock3, label: formatMinutes(total) });
  if (prep != null)
    meta.push({
      icon: Timer,
      label: t("prep", { time: formatMinutes(prep) }),
    });
  if (rest != null && rest > 0)
    meta.push({
      icon: Hourglass,
      label: t("rest", { time: formatMinutes(rest) }),
    });
  if (recipe.servings != null)
    meta.push({
      icon: Users,
      label: `${recipe.servings} ${recipe.servingsNoun ?? td("servingsNoun")}`,
    });
  if (recipe.difficulty)
    meta.push({
      icon: Flame,
      label: td(`difficulty.${recipe.difficulty}`),
    });

  const ingredientGroups = groupBySection(recipe.ingredients);
  const dietary = recipe.dietaryFlags ?? [];
  const tags = recipe.tags ?? [];
  const equipment = recipe.equipment ?? [];

  const origin = [
    recipe.handedDownFrom
      ? t("handedDownFrom", { name: recipe.handedDownFrom })
      : null,
    recipe.originYear ? t("since", { year: recipe.originYear }) : null,
    recipe.originPlace,
  ].filter(Boolean);

  function quantityLabel(ing: IngredientInput): string {
    const parts: string[] = [];
    if (ing.quantity != null) {
      let q = formatQuantity(ing.quantity, undefined, locale);
      if (ing.quantityMax != null)
        q += `\u2013${formatQuantity(ing.quantityMax, undefined, locale)}`;
      parts.push(q);
    }
    if (ing.unit) parts.push(ing.unit);
    return parts.join(" ");
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="size-4 text-primary" aria-hidden="true" />
        {t("notice")}
      </p>

      {/* Hero */}
      {recipe.coverImageUrl ? (
        <div className="relative aspect-[21/9] max-h-[420px] w-full overflow-hidden rounded-2xl border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element -- author URLs can't be pre-allowlisted for next/image */}
          <img
            src={recipe.coverImageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-background/10 to-transparent" />
        </div>
      ) : (
        <div className="aspect-[21/9] max-h-72 w-full rounded-2xl bg-gradient-to-br from-primary/20 via-accent/10 to-secondary/20" />
      )}

      <header className="flex flex-col gap-4">
        {(recipe.visibility !== "public" ||
          Boolean(recipe.cuisine) ||
          dietary.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {recipe.visibility !== "public" && (
              <Badge variant="muted" className="capitalize">
                {recipe.visibility}
              </Badge>
            )}
            {recipe.cuisine && (
              <Badge variant="outline">{recipe.cuisine}</Badge>
            )}
            {dietary.map((flag) => (
              <Badge key={flag} variant="secondary">
                {DIETARY_TAG_LABELS[flag]}
              </Badge>
            ))}
          </div>
        )}

        <h1 className="max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          {recipe.title || (
            <span className="text-muted-foreground">
              {mode === "edit" ? t("untitled") : t("titlePlaceholder")}
            </span>
          )}
        </h1>

        {recipe.description && (
          <p className="max-w-2xl text-lg text-muted-foreground">
            {recipe.description}
          </p>
        )}

        {origin.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-secondary-foreground">
            <Sparkles className="size-4 text-secondary" aria-hidden="true" />
            {origin.join(" \u00b7 ")}
          </p>
        )}

        {meta.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {meta.map((m, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 capitalize"
              >
                <m.icon className="size-4" /> {m.label}
              </span>
            ))}
          </div>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        {/* Ingredients */}
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            {td("ingredients.heading")}
          </h2>
          {ingredientGroups.length > 0 ? (
            <div className="flex flex-col gap-5">
              {ingredientGroups.map((group, gi) => (
                <div key={gi} className="flex flex-col gap-2">
                  {group.section && (
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.section}
                    </h3>
                  )}
                  <ul className="flex flex-col">
                    {group.items.map((ing, i) => {
                      const qty = quantityLabel(ing);
                      return (
                        <li
                          key={i}
                          className="flex gap-3 border-b border-border/50 py-2 last:border-0"
                        >
                          {qty && (
                            <span className="min-w-16 shrink-0 font-medium tabular-nums text-foreground">
                              {qty}
                            </span>
                          )}
                          <span className="flex-1">
                            {ing.item}
                            {ing.prep && (
                              <span className="text-muted-foreground">
                                , {ing.prep}
                              </span>
                            )}
                            {ing.optional && (
                              <Badge
                                variant="muted"
                                className="ml-2 align-middle"
                              >
                                {t("optional")}
                              </Badge>
                            )}
                            {ing.note && (
                              <span className="block text-sm text-muted-foreground">
                                {ing.note}
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">{t("noIngredients")}</p>
          )}

          {recipe.makeAheadNote && (
            <div className="mt-2 rounded-xl border border-border bg-muted/40 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Hourglass className="size-4 text-primary" />
                {td("ingredients.makeAhead")}
              </h3>
              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                {recipe.makeAheadNote}
              </p>
            </div>
          )}

          {equipment.length > 0 && (
            <div className="mt-2">
              <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
                <Wrench className="size-4 text-primary" />
                {td("ingredients.equipment")}
              </h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {equipment.map((tool) => (
                  <li key={tool} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-1.5 shrink-0 rounded-full bg-primary/60"
                    />
                    {tool}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Method */}
        <div className="flex flex-col gap-6">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            {td("method.heading")}
          </h2>
          {recipe.steps.length > 0 ? (
            <ol className="flex flex-col gap-5">
              {recipe.steps.map((step: StepInput, i) => (
                <li key={i} className="flex gap-4">
                  <span className="bg-primary/12 flex size-9 shrink-0 items-center justify-center rounded-full font-display text-lg font-semibold text-primary">
                    {i + 1}
                  </span>
                  <div className="flex flex-1 flex-col gap-2 pt-1">
                    {step.section && (
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {step.section}
                      </span>
                    )}
                    {step.title && (
                      <h3 className="font-display text-lg font-semibold leading-snug">
                        {step.title}
                      </h3>
                    )}
                    <p className="text-[1.02rem] leading-relaxed">
                      {step.instruction}
                    </p>
                    {step.imageUrl && (
                      <div className="relative mt-1 aspect-video max-w-md overflow-hidden rounded-lg border border-border">
                        {/* eslint-disable-next-line @next/next/no-img-element -- author URLs can't be pre-allowlisted for next/image */}
                        <img
                          src={step.imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                    {(step.timerSeconds != null ||
                      step.targetTempC != null ||
                      Boolean(step.doneness) ||
                      (step.techniques?.length ?? 0) > 0) && (
                      <div className="flex flex-wrap gap-2">
                        {step.timerSeconds != null && (
                          <Badge variant="secondary" className="gap-1">
                            <Timer className="size-3" />
                            {formatTimer(step.timerSeconds)}
                          </Badge>
                        )}
                        {step.targetTempC != null && (
                          <Badge variant="secondary" className="gap-1">
                            <Thermometer className="size-3" />
                            {`${step.targetTempC}\u00b0C`}
                          </Badge>
                        )}
                        {step.doneness && (
                          <Badge variant="muted" className="gap-1">
                            {step.doneness}
                          </Badge>
                        )}
                        {step.techniques?.map((technique) => (
                          <Badge
                            key={technique}
                            variant="outline"
                            className="capitalize"
                          >
                            {technique}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground">{t("noSteps")}</p>
          )}

          {recipe.story && (
            <div className="flex flex-col gap-2 border-t border-border pt-6">
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                <Sparkles
                  className="size-4 text-secondary"
                  aria-hidden="true"
                />
                {t("storyMemories")}
              </h3>
              <p className="whitespace-pre-line leading-relaxed text-foreground/90">
                {recipe.story}
              </p>
            </div>
          )}

          {(Boolean(recipe.notes) ||
            Boolean(recipe.sourceName) ||
            Boolean(recipe.sourceUrl)) && (
            <div className="flex flex-col gap-2 border-t border-border pt-6">
              <h3 className="font-display text-lg font-semibold">
                {td("notes")}
              </h3>
              {recipe.notes && (
                <p className="whitespace-pre-line leading-relaxed text-foreground/90">
                  {recipe.notes}
                </p>
              )}
              {(Boolean(recipe.sourceName) || Boolean(recipe.sourceUrl)) && (
                <p className="text-sm text-muted-foreground">
                  {td("source")}{" "}
                  {recipe.sourceUrl ? (
                    <a
                      href={recipe.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
                    >
                      {recipe.sourceName ?? recipe.sourceUrl}
                    </a>
                  ) : (
                    recipe.sourceName
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
