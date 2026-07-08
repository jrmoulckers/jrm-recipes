import { type Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { getCurrentUser, isAuthConfigured } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import {
  listEntriesInRange,
  listEntriesWithPrepText,
  listPlannableRecipes,
  type PlannableRecipe,
  type PlannerEntry,
} from "~/server/planner/queries";
import { recipeAllergenMap } from "~/server/recipes/queries";
import { listMemberProfiles } from "~/server/dietary/queries";
import { isAllergen, type Allergen } from "~/lib/allergens";
import { type ActiveMemberOption } from "~/lib/dietary-match";
import {
  buildPrepAheadReminders,
  type PlannedPrepRecipe,
  type PrepAheadReminder,
} from "~/lib/prep-ahead";
import {
  formatDayName,
  formatDayNumber,
  formatFullDay,
  formatWeekRange,
  getPlannerWeek,
  isToday,
  nextWeekParam,
  parseDateParam,
  previousWeekParam,
  toDateParam,
  todayParam,
  tomorrowParam,
} from "~/server/planner/week";
import { Button } from "~/components/ui/button";
import { PrepAheadNote } from "~/components/planner/prep-ahead-note";
import {
  PlannerBoard,
  PlannerEmptyState,
  type BoardDay,
  type BoardEntry,
  type BoardRecipe,
} from "~/components/planner/planner-board";

export const metadata: Metadata = { title: "Plan" };

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const focusDate = parseDateParam(week);
  const { start, end, days } = getPlannerWeek(focusDate);
  const startParam = toDateParam(start);
  const endParam = toDateParam(end);

  const user = await getCurrentUser();
  const dbConfigured = isDbConfigured();
  const authConfigured = isAuthConfigured();

  let entries: PlannerEntry[] = [];
  let recipes: PlannableRecipe[] = [];
  let members: ActiveMemberOption[] = [];
  let allergensByRecipe = new Map<string, Allergen[]>();
  let prepReminders: PrepAheadReminder[] = [];
  if (dbConfigured && user) {
    const tomorrow = tomorrowParam();
    const [entryRows, recipeRows, profiles, prepRows] = await Promise.all([
      listEntriesInRange(user.id, startParam, endParam),
      listPlannableRecipes(user),
      listMemberProfiles(user.id),
      listEntriesWithPrepText(user.id, tomorrow),
    ]);
    entries = entryRows;
    recipes = recipeRows;
    members = profiles.map((m) => ({
      id: m.id,
      name: m.name,
      allergens: (m.allergens ?? []).filter(isAllergen),
    }));
    // Only pay for the allergen roll-up when someone with allergies is active.
    if (members.some((m) => m.allergens.length > 0)) {
      const recipeIds = entries
        .map((entry) => entry.recipe?.id)
        .filter((id): id is string => Boolean(id));
      allergensByRecipe = await recipeAllergenMap(recipeIds);
    }

    // Prep-ahead nudge (#388): scan tomorrow's planned recipes for "start it
    // tonight" language. Dedupe by slug so a recipe planned twice (lunch +
    // dinner) only nudges once.
    const tomorrowLabel = formatDayName(parseDateParam(tomorrow));
    const plannedTomorrow = new Map<string, PlannedPrepRecipe>();
    for (const entry of prepRows) {
      const recipe = entry.recipe;
      if (!recipe || plannedTomorrow.has(recipe.slug)) continue;
      plannedTomorrow.set(recipe.slug, {
        slug: recipe.slug,
        title: recipe.title,
        dayLabel: tomorrowLabel,
        texts: [
          ...recipe.steps.map((step) => step.instruction),
          ...recipe.ingredients.map((ing) =>
            [ing.item, ing.note].filter(Boolean).join(" "),
          ),
        ],
      });
    }
    prepReminders = buildPrepAheadReminders([...plannedTomorrow.values()]);
  }

  const boardDays: BoardDay[] = days.map((day) => ({
    dateParam: toDateParam(day),
    weekdayLabel: formatDayName(day),
    dayNumber: formatDayNumber(day),
    fullLabel: formatFullDay(day),
    isToday: isToday(day),
  }));

  const boardEntries: BoardEntry[] = entries.map((entry) => ({
    id: entry.id,
    dateParam: entry.date,
    slot: entry.slot,
    note: entry.note,
    recipe: entry.recipe
      ? {
          slug: entry.recipe.slug,
          title: entry.recipe.title,
          allergens: allergensByRecipe.get(entry.recipe.id) ?? [],
        }
      : null,
  }));

  const boardRecipes: BoardRecipe[] = recipes.map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    slug: recipe.slug,
  }));

  const showSignIn = authConfigured && dbConfigured && !user;

  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-primary">
          <CalendarDays className="size-5" aria-hidden="true" />
          <span className="text-sm font-semibold uppercase tracking-wide">
            Meal planner
          </span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              {formatWeekRange(start, end)}
            </h1>
            <p className="mt-1 text-muted-foreground">
              Plan the week&rsquo;s meals — assign recipes or quick notes to each
              day.
            </p>
          </div>
          <nav className="flex items-center gap-2" aria-label="Week navigation">
            <Button
              asChild
              variant="outline"
              size="icon"
              aria-label="Previous week"
            >
              <Link href={`/plan?week=${previousWeekParam(focusDate)}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/plan?week=${todayParam()}`}>This week</Link>
            </Button>
            <Button asChild variant="outline" size="icon" aria-label="Next week">
              <Link href={`/plan?week=${nextWeekParam(focusDate)}`}>
                <ChevronRight />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {!dbConfigured ? (
        <ConnectDbNotice />
      ) : showSignIn ? (
        <SignInNudge />
      ) : (
        <>
          <PrepAheadNote reminders={prepReminders} />
          <PlannerBoard
            days={boardDays}
            entries={boardEntries}
            recipes={boardRecipes}
            members={members}
          />
          {boardEntries.length === 0 && <PlannerEmptyState />}
        </>
      )}
    </div>
  );
}

function ConnectDbNotice() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center text-muted-foreground">
      <p className="mx-auto max-w-md">
        Connect a database to start planning meals. Set{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          DATABASE_URL
        </code>{" "}
        (see <code className="font-mono text-sm">.env.example</code>) or run{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          docker compose up -d
        </code>
        .
      </p>
    </div>
  );
}

function SignInNudge() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-token">
      <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <CalendarDays className="size-7" aria-hidden="true" />
      </span>
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">
          Your meal plan is private
        </h2>
        <p className="mt-2 text-muted-foreground">
          Sign in from the header to plan the week and pull in your recipes.
        </p>
      </div>
    </div>
  );
}
