import { type Metadata } from 'next';
import { type ReactNode } from 'react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { CalendarDays, ChevronLeft, ChevronRight, Printer, UserRound, Users } from 'lucide-react';

import { getCurrentUser, isAuthConfigured } from '~/server/auth';
import { isDbConfigured } from '~/server/db';
import {
  listEntriesInRange,
  listEntriesWithPrepText,
  listGroupEntriesInRange,
  listPlannableRecipes,
  listViewerGroups,
  type GroupPlannerEntry,
  type PlannableRecipe,
  type PlannerEntry,
  type ViewerGroup,
} from '~/server/planner/queries';
import { recipeAllergenMap } from '~/server/recipes/queries';
import { rollUpMealNutritionWithTargets, type RollUpMeal } from '~/server/recipes/nutrition-rollup';
import { emptyNutritionRollUp, type NutritionRollUp } from '~/lib/nutrition-rollup';
import { type MemberNutritionAdherence } from '~/lib/nutrition-adherence';
import { NutritionRollUpCard } from '~/components/nutrition/nutrition-rollup-card';
import { listMemberProfiles } from '~/server/dietary/queries';
import { isAllergen, type Allergen } from '~/lib/allergens';
import { type ActiveMemberOption } from '~/lib/dietary-match';
import {
  buildPrepAheadReminders,
  type PlannedPrepRecipe,
  type PrepAheadReminder,
} from '~/lib/prep-ahead';
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
} from '~/server/planner/week';
import { Button } from '~/components/ui/button';
import { PrepAheadNote } from '~/components/planner/prep-ahead-note';
import { CopyLastWeekButton } from '~/components/planner/copy-last-week-button';
import { BuildShoppingListButton } from '~/components/planner/build-shopping-list-button';
import { withRouteMessages } from '~/components/i18n/route-messages';
import {
  PlannerBoard,
  PlannerEmptyState,
  type BoardDay,
  type BoardEntry,
  type BoardRecipe,
} from '~/components/planner/planner-board';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return { title: t('plan.title') };
}

async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; scope?: string }>;
}) {
  const { week, scope } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations('planner.page');
  const tSlots = await getTranslations('planner.board.mealSlot');
  const tBoard = await getTranslations('planner.board');
  const focusDate = parseDateParam(week);
  const { start, end, days } = getPlannerWeek(focusDate, locale);
  const startParam = toDateParam(start);
  const endParam = toDateParam(end);

  const user = await getCurrentUser();
  const dbConfigured = isDbConfigured();
  const authConfigured = isAuthConfigured();

  let entries: (PlannerEntry | GroupPlannerEntry)[] = [];
  let recipes: PlannableRecipe[] = [];
  let members: ActiveMemberOption[] = [];
  let allergensByRecipe = new Map<string, Allergen[]>();
  let prepReminders: PrepAheadReminder[] = [];
  let viewerGroups: ViewerGroup[] = [];
  let activeGroup: ViewerGroup | null = null;
  let nutritionAdherence: MemberNutritionAdherence[] = [];
  if (dbConfigured && user) {
    viewerGroups = await listViewerGroups(user.id);
    // Group scope (#363): a `?scope=<slug>` for a group the viewer belongs to
    // switches the board to that group's shared plan. Anything else, including
    // a slug the viewer isn't a member of, falls back to the personal plane, so
    // membership is enforced here, not just hidden.
    activeGroup =
      scope != null ? (viewerGroups.find((group) => group.slug === scope) ?? null) : null;
    const isGroupScope = activeGroup != null;

    const tomorrow = tomorrowParam();
    const [entryRows, recipeRows, profiles, prepRows] = await Promise.all([
      isGroupScope
        ? listGroupEntriesInRange(user, activeGroup!.id, startParam, endParam)
        : listEntriesInRange(user.id, startParam, endParam),
      listPlannableRecipes(user),
      listMemberProfiles(user.id),
      isGroupScope ? Promise.resolve([]) : listEntriesWithPrepText(user.id, tomorrow),
    ]);
    entries = entryRows ?? [];
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
    // dinner) only nudges once. Personal plane only.
    const tomorrowLabel = formatDayName(parseDateParam(tomorrow), locale);
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
          ...recipe.ingredients.map((ing) => [ing.item, ing.note].filter(Boolean).join(' ')),
        ],
      });
    }
    prepReminders = buildPrepAheadReminders([...plannedTomorrow.values()]);
  }
  const isGroupScope = activeGroup != null;

  const boardDays: BoardDay[] = days.map((day) => ({
    dateParam: toDateParam(day),
    weekdayLabel: formatDayName(day, locale),
    dayNumber: formatDayNumber(day, locale),
    fullLabel: formatFullDay(day, locale),
    isToday: isToday(day),
  }));

  const boardEntries: BoardEntry[] = entries.map((entry) => ({
    id: entry.id,
    dateParam: entry.date,
    slot: entry.slot,
    note: entry.note,
    plannedServings: entry.plannedServings,
    servingsMade: entry.servingsMade,
    leftoverSourceId: entry.leftoverSourceId,
    author:
      'user' in entry && entry.user
        ? { id: entry.user.id, name: entry.user.name ?? t('familyMember') }
        : null,
    recipe: entry.recipe
      ? {
          id: entry.recipe.id,
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
    defaultServings: recipe.servings,
    lastServings: recipe.lastServings,
  }));

  // Week nutrition roll-up (#1048). Every slot on the board is a meal, including
  // the note-only ones: a slot whose food we know nothing about is exactly what
  // the aggregate confidence has to account for, so it is passed through as a
  // meal with no recipe rather than filtered out.
  //
  // `plannedServings` is the right multiplier and does not double-count a batch
  // cook: the source meal stores what is *eaten then* in `plannedServings` (the
  // full batch lives in `servingsMade`), and each linked leftover slot carries
  // its own allocation, so summing the column visits every serving once.
  let weekNutrition: NutritionRollUp = emptyNutritionRollUp();
  if (dbConfigured && user && entries.length > 0) {
    const dayLabelByDate = new Map(boardDays.map((day) => [day.dateParam, day.weekdayLabel]));
    const meals: RollUpMeal[] = entries.map((entry) => ({
      id: entry.id,
      recipeId: entry.recipe?.id ?? null,
      title: entry.recipe?.title ?? entry.note?.trim() ?? tBoard('untitled'),
      context: `${dayLabelByDate.get(entry.date) ?? entry.date} ${tSlots(entry.slot).toLowerCase()}`,
      servings: entry.plannedServings ?? 1,
      date: entry.date,
    }));
    const scored = await rollUpMealNutritionWithTargets({
      meals,
      periodDates: boardDays.map((day) => day.dateParam),
      members,
      userId: user.id,
    });
    weekNutrition = scored.rollUp;
    nutritionAdherence = scored.adherence;
  }

  const showSignIn = authConfigured && dbConfigured && !user;

  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-primary">
          <CalendarDays className="size-5" aria-hidden="true" />
          <span className="text-sm font-semibold uppercase tracking-wide">{t('kicker')}</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              {formatWeekRange(start, end, locale)}
            </h1>
            <p className="mt-1 text-muted-foreground">{t('description')}</p>
          </div>
          <nav className="flex flex-wrap items-center gap-2" aria-label={t('a11y.weekNavigation')}>
            {dbConfigured && user && (
              <CopyLastWeekButton week={startParam} groupId={activeGroup?.id} />
            )}
            {dbConfigured && user && (
              <BuildShoppingListButton week={startParam} groupId={activeGroup?.id} />
            )}
            {dbConfigured && user && (
              <Button asChild variant="outline">
                <Link
                  href={
                    activeGroup
                      ? `/plan/print?week=${startParam}&scope=${activeGroup.slug}`
                      : `/plan/print?week=${startParam}`
                  }
                >
                  <Printer /> {t('printWeek')}
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="icon" aria-label={t('a11y.previousWeek')}>
              <Link
                href={
                  activeGroup
                    ? `/plan?scope=${activeGroup.slug}&week=${previousWeekParam(focusDate, locale)}`
                    : `/plan?week=${previousWeekParam(focusDate, locale)}`
                }
              >
                <ChevronLeft className="rtl:-scale-x-100" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                href={
                  activeGroup
                    ? `/plan?scope=${activeGroup.slug}&week=${todayParam()}`
                    : `/plan?week=${todayParam()}`
                }
              >
                {t('thisWeek')}
              </Link>
            </Button>
            <Button asChild variant="outline" size="icon" aria-label={t('a11y.nextWeek')}>
              <Link
                href={
                  activeGroup
                    ? `/plan?scope=${activeGroup.slug}&week=${nextWeekParam(focusDate, locale)}`
                    : `/plan?week=${nextWeekParam(focusDate, locale)}`
                }
              >
                <ChevronRight className="rtl:-scale-x-100" />
              </Link>
            </Button>
          </nav>
        </div>

        {dbConfigured && user && viewerGroups.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="tablist"
            aria-label={t('a11y.planScope')}
          >
            <Button asChild size="sm" variant={isGroupScope ? 'outline' : 'default'}>
              <Link href={`/plan?week=${startParam}`} role="tab" aria-selected={!isGroupScope}>
                <UserRound /> {t('myPlan')}
              </Link>
            </Button>
            {viewerGroups.map((group) => (
              <Button
                key={group.id}
                asChild
                size="sm"
                variant={activeGroup?.id === group.id ? 'default' : 'outline'}
              >
                <Link
                  href={`/plan?scope=${group.slug}&week=${startParam}`}
                  role="tab"
                  aria-selected={activeGroup?.id === group.id}
                >
                  <Users /> {group.name}
                </Link>
              </Button>
            ))}
          </div>
        )}
      </header>

      {!dbConfigured ? (
        <ConnectDbNotice />
      ) : showSignIn ? (
        <SignInNudge />
      ) : (
        <>
          <PrepAheadNote reminders={prepReminders} />
          <NutritionRollUpCard
            rollUp={weekNutrition}
            title={t('nutritionTitle')}
            perLabel={t('perDay')}
            perParts={days.length}
            adherence={nutritionAdherence}
          />
          <PlannerBoard
            days={boardDays}
            entries={boardEntries}
            recipes={boardRecipes}
            members={members}
            groupId={activeGroup?.id ?? null}
          />
          {boardEntries.length === 0 && <PlannerEmptyState groupName={activeGroup?.name ?? null} />}
        </>
      )}
    </div>
  );
}

async function ConnectDbNotice() {
  const t = await getTranslations('dbNotice');
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center text-muted-foreground">
      <p className="mx-auto max-w-md">
        {t.rich('plan', {
          code: (chunks: ReactNode) => (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{chunks}</code>
          ),
          file: (chunks: ReactNode) => <code className="font-mono text-sm">{chunks}</code>,
        })}
      </p>
    </div>
  );
}

async function SignInNudge() {
  const t = await getTranslations('planner.page.signIn');
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-token">
      <span className="bg-primary/12 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
        <CalendarDays className="size-7" aria-hidden="true" />
      </span>
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">{t('title')}</h2>
        <p className="mt-2 text-muted-foreground">{t('body')}</p>
      </div>
    </div>
  );
}

export default withRouteMessages(PlanPage);
