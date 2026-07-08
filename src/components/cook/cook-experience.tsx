"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListOrdered,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Timer,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Separator } from "~/components/ui/separator";
import {
  formatCountdown,
  makeTimer,
  stepShortcutForKey,
  timerStatusText,
  type TimerRecord,
  type TimerStatus,
} from "~/lib/cook-state";
import { cn, formatMinutes } from "~/lib/utils";
import type { IngredientsPanelControls } from "~/components/recipe/ingredients-panel";

import { IngredientsDrawer } from "./ingredients-drawer";
import { CookAllergenBanner } from "./cook-allergen-banner";
import { TechniqueChips } from "./technique-chips";
import type { CookRecipe, CookStep } from "./types";
import { useCookSession, type ActiveTimer } from "./use-cook-session";
import { useScreenWakeLock } from "./use-screen-wake-lock";
import { useSpeech } from "./use-speech";
import { useOneHandedNav } from "./use-one-handed-nav";
import { useHousehold } from "~/components/household/household-provider";

export function CookExperience({ recipe }: { recipe: CookRecipe }) {
  const wakeLockStatus = useScreenWakeLock();
  const speech = useSpeech();
  const household = useHousehold();
  const router = useRouter();
  const totalSteps = recipe.steps.length;
  const firstStep = recipe.steps[0];

  const {
    stepIndex,
    timers,
    activeTimers,
    runningTimerCount,
    servings,
    system,
    checked,
    goToStep,
    goNext,
    goPrevious,
    startTimer,
    pauseTimer,
    resetTimer,
    setServings,
    setSystem,
    toggleChecked,
    clearSession,
  } = useCookSession(recipe, { householdSize: household.size });

  const oneHandedNav = useOneHandedNav({
    onNext: goNext,
    onPrevious: goPrevious,
  });

  const ingredientControls = React.useMemo<IngredientsPanelControls>(
    () => ({
      servings,
      onServingsChange: setServings,
      system,
      onSystemChange: setSystem,
      checked,
      onToggleChecked: toggleChecked,
      householdSize: household.size,
    }),
    [servings, setServings, system, setSystem, checked, toggleChecked, household.size],
  );

  const handleFinish = React.useCallback(() => {
    clearSession();
    toast.success("Nicely done — recipe complete!", {
      description: `Log this cook to add ${recipe.title} to your journal.`,
      action: {
        label: "Log this cook",
        onClick: () => router.push(`/recipes/${recipe.slug}`),
      },
    });
    router.push(`/recipes/${recipe.slug}`);
  }, [clearSession, recipe.slug, recipe.title, router]);

  React.useEffect(() => {
    if (totalSteps === 0) return;

    function handleKeyDown(event: KeyboardEvent) {
      const shortcut = stepShortcutForKey(event.key, event.target);
      if (!shortcut) return;

      event.preventDefault();
      if (shortcut === "previous") goPrevious();
      else goNext();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrevious, totalSteps]);

  const stepHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const hasNavigatedRef = React.useRef(false);
  const [stepAnnouncement, setStepAnnouncement] = React.useState("");

  // On step navigation (arrow keys, Prev/Next, or an overview jump) move focus
  // to the new step's heading and announce the new position politely. Without
  // this a screen-reader user hears nothing change and a keyboard user's focus
  // is stranded on a control that just scrolled out of view. The heading text
  // carries the instruction; the live region reinforces the position. Skips the
  // first mount (and any resumed-session restore) so focus isn't yanked on load.
  React.useEffect(() => {
    if (totalSteps === 0) return;
    if (!hasNavigatedRef.current) {
      hasNavigatedRef.current = true;
      return;
    }
    stepHeadingRef.current?.focus();
    setStepAnnouncement(`Step ${stepIndex + 1} of ${totalSteps}`);
  }, [stepIndex, totalSteps]);

  // Read-aloud (#436): speak the active step whenever it changes (or the moment
  // read-aloud is switched on). `speak` cancels any prior utterance, so rapid
  // navigation never stacks up. Destructured so the effect depends on the stable
  // callback, not the controller object's per-render identity.
  const { enabled: readAloud, speak } = speech;
  const currentInstruction = recipe.steps[stepIndex]?.instruction ?? "";
  const currentStepId = recipe.steps[stepIndex]?.id ?? null;
  React.useEffect(() => {
    if (readAloud && currentInstruction) speak(currentInstruction);
  }, [readAloud, currentStepId, currentInstruction, speak]);

  if (!firstStep) {
    return (
      <EmptyCookExperience
        recipe={recipe}
        wakeLockStatus={wakeLockStatus}
        ingredientControls={ingredientControls}
      />
    );
  }

  const currentStep = recipe.steps[stepIndex] ?? firstStep;
  const currentTimer =
    currentStep.timerSeconds != null
      ? (timers[currentStep.id] ?? makeTimer(currentStep.timerSeconds))
      : null;
  const progressValue = ((stepIndex + 1) / totalSteps) * 100;
  const canGoPrevious = stepIndex > 0;
  const canGoNext = stepIndex < totalSteps - 1;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <CookHeader
        recipe={recipe}
        runningTimerCount={runningTimerCount}
        currentIndex={stepIndex}
        totalSteps={totalSteps}
        progressValue={progressValue}
        wakeLockStatus={wakeLockStatus}
        onStepSelect={goToStep}
        ingredientControls={ingredientControls}
      />

      <CookAllergenBanner recipe={recipe} />

      <p className="sr-only" role="status" aria-live="polite">
        {stepAnnouncement}
      </p>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-5 px-3 py-4 sm:px-5 sm:py-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section
          key={currentStep.id}
          aria-labelledby="current-step-title"
          onClick={oneHandedNav.onClick}
          onTouchStart={oneHandedNav.onTouchStart}
          onTouchEnd={oneHandedNav.onTouchEnd}
          className="relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-token-lg motion-safe:animate-fade-in"
        >
          {canGoPrevious && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-1 text-muted-foreground/25"
            >
              <ChevronLeft className="size-8" />
            </span>
          )}
          {canGoNext && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center pr-1 text-muted-foreground/25"
            >
              <ChevronRight className="size-8" />
            </span>
          )}

          <StepMedia
            step={currentStep}
            stepNumber={stepIndex + 1}
            recipeTitle={recipe.title}
          />

          <div className="flex flex-col gap-8 p-5 sm:p-8 lg:p-10">
            <div className="flex flex-wrap items-center gap-2">
              {currentStep.section && (
                <Badge variant="secondary" className="text-sm">
                  {currentStep.section}
                </Badge>
              )}
              <TechniqueChips
                techniques={currentStep.techniques}
                className="text-sm"
              />
              {currentStep.timerSeconds != null && (
                <Badge variant="accent" className="gap-1 text-sm">
                  <Timer className="size-3.5" />
                  {formatCountdown(currentStep.timerSeconds)}
                </Badge>
              )}
              {speech.supported && (
                <ReadAloudControls
                  enabled={speech.enabled}
                  onToggle={() => speech.setEnabled(!speech.enabled)}
                  onRepeat={() => speech.speak(currentStep.instruction)}
                />
              )}
            </div>

            <div className="flex flex-col gap-4">
              <p className="text-sm font-semibold text-muted-foreground">
                Step {stepIndex + 1} of {totalSteps}
              </p>
              <h1
                id="current-step-title"
                ref={stepHeadingRef}
                tabIndex={-1}
                className="max-w-4xl text-pretty font-display text-3xl font-semibold leading-tight tracking-tight focus:outline-none sm:text-4xl lg:text-5xl"
              >
                {currentStep.instruction}
              </h1>
              {totalSteps > 1 && (
                <p className="text-xs text-muted-foreground/80">
                  Tap the sides or swipe to move between steps.
                </p>
              )}
            </div>
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-28 lg:self-start">
          {currentTimer && (
            <StepTimerCard
              step={currentStep}
              timer={currentTimer}
              onStart={startTimer}
              onPause={pauseTimer}
              onReset={resetTimer}
            />
          )}

          <RecipeAtAGlance recipe={recipe} />

          {activeTimers.length > 0 && (
            <ActiveTimersPanel
              activeTimers={activeTimers}
              currentStepId={currentStep.id}
              onPause={pauseTimer}
              onReset={resetTimer}
              onSelect={goToStep}
              onStart={startTimer}
            />
          )}

          {recipe.notes && <CookNotes notes={recipe.notes} />}
        </aside>
      </main>

      <footer className="sticky bottom-0 z-30 border-t border-border bg-background/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-3 backdrop-blur sm:pl-[max(1.25rem,env(safe-area-inset-left))] sm:pr-[max(1.25rem,env(safe-area-inset-right))]">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <Button
            type="button"
            size="xl"
            variant="outline"
            className="h-16 justify-start text-lg sm:h-[4.5rem]"
            onClick={goPrevious}
            disabled={!canGoPrevious}
          >
            <ArrowLeft />
            Previous
          </Button>

          <IngredientsDrawer
            recipe={recipe}
            className="hidden h-16 px-6 text-lg sm:inline-flex"
            label="Ingredients"
            controls={ingredientControls}
          />

          <Button
            type="button"
            size="xl"
            className="h-16 justify-end text-lg sm:h-[4.5rem]"
            onClick={canGoNext ? goNext : handleFinish}
          >
            {canGoNext ? "Next" : "Done"}
            {canGoNext ? <ArrowRight /> : <CheckCircle2 />}
          </Button>
        </div>
      </footer>
    </div>
  );
}

function CookHeader({
  recipe,
  runningTimerCount,
  currentIndex,
  totalSteps,
  progressValue,
  wakeLockStatus,
  onStepSelect,
  ingredientControls,
}: {
  recipe: CookRecipe;
  runningTimerCount: number;
  currentIndex: number;
  totalSteps: number;
  progressValue: number;
  wakeLockStatus: string;
  onStepSelect: (index: number) => void;
  ingredientControls: IngredientsPanelControls;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 py-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:pl-[max(1.25rem,env(safe-area-inset-left))] sm:pr-[max(1.25rem,env(safe-area-inset-right))]">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="hidden sm:inline-flex">
              Cook mode
            </Badge>
            <span className="font-medium">
              Step {currentIndex + 1} of {totalSteps}
            </span>
            {runningTimerCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Timer className="size-3.5" />
                {runningTimerCount} active
              </span>
            )}
            {wakeLockStatus === "active" && (
              <Badge variant="success" className="hidden md:inline-flex">
                Screen awake
              </Badge>
            )}
          </div>
          <h2 className="truncate font-display text-lg font-semibold tracking-tight sm:text-2xl">
            {recipe.title}
          </h2>
        </div>

        <OverviewDialog
          steps={recipe.steps}
          currentIndex={currentIndex}
          onStepSelect={onStepSelect}
        />
        <IngredientsDrawer
          recipe={recipe}
          className="h-12 px-3 md:hidden"
          controls={ingredientControls}
        />
        <IngredientsDrawer
          recipe={recipe}
          className="hidden md:inline-flex"
          controls={ingredientControls}
        />
        <Button asChild variant="ghost" size="icon" aria-label="Exit cook mode">
          <Link href={`/recipes/${recipe.slug}`}>
            <X />
          </Link>
        </Button>
      </div>

      <ProgressPrimitive.Root
        value={progressValue}
        className="h-2 w-full overflow-hidden bg-muted"
        aria-label="Cooking progress"
      >
        <ProgressPrimitive.Indicator
          className="h-full bg-primary transition-[width] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: `${progressValue}%` }}
        />
      </ProgressPrimitive.Root>
    </header>
  );
}

function ReadAloudControls({
  enabled,
  onToggle,
  onRepeat,
}: {
  enabled: boolean;
  onToggle: () => void;
  onRepeat: () => void;
}) {
  return (
    <div className="ml-auto flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={enabled ? "default" : "outline"}
        aria-pressed={enabled}
        onClick={onToggle}
      >
        {enabled ? <Volume2 /> : <VolumeX />}
        Read aloud
      </Button>
      {enabled && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label="Repeat this step aloud"
          onClick={onRepeat}
        >
          <Repeat />
          Repeat
        </Button>
      )}
    </div>
  );
}

function StepMedia({
  step,
  stepNumber,
  recipeTitle,
}: {
  step: CookStep;
  stepNumber: number;
  recipeTitle: string;
}) {
  if (!step.imageUrl && !step.videoUrl) return null;

  return (
    <div
      className={cn(
        "grid gap-3 border-b border-border bg-muted p-3",
        step.imageUrl && step.videoUrl && "lg:grid-cols-2",
      )}
    >
      {step.imageUrl && (
        <div className="relative aspect-video overflow-hidden rounded-xl bg-background">
          <Image
            src={step.imageUrl}
            alt={`Step ${stepNumber} visual for ${recipeTitle}`}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 70vw"
            className="object-cover"
          />
        </div>
      )}
      {step.videoUrl && (
        <video
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full rounded-xl bg-background"
        >
          <source src={step.videoUrl} />
          Your browser does not support embedded recipe videos.
        </video>
      )}
    </div>
  );
}

function StepTimerCard({
  step,
  timer,
  onStart,
  onPause,
  onReset,
}: {
  step: CookStep;
  timer: TimerRecord;
  onStart: (step: CookStep) => void;
  onPause: (step: CookStep) => void;
  onReset: (step: CookStep) => void;
}) {
  const t = useTranslations("cook.timer");
  const isRunning = timer.status === "running";
  const isComplete = timer.status === "complete";

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-token",
        isComplete && "border-success/40 bg-success/10 ring-2 ring-success/20",
      )}
      aria-labelledby="step-timer-title"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="step-timer-title"
          className="flex items-center gap-2 font-display text-xl font-semibold"
        >
          <Timer className="size-5 text-primary" />
          Step timer
        </h2>
        {isComplete && (
          <Badge variant="success" className="gap-1">
            <Bell className="size-3.5" />
            Done
          </Badge>
        )}
      </div>

      <div
        className="mt-5 rounded-2xl bg-muted px-4 py-5 text-center"
        role="timer"
        aria-live="off"
        aria-label={`Step timer, ${formatCountdown(timer.remaining)} remaining`}
      >
        <div className="font-mono text-5xl font-bold tabular-nums tracking-tight sm:text-6xl">
          {formatCountdown(timer.remaining)}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {timerStatusText(timer, (key, values) => t(key, values))}
        </p>
      </div>
      <TimerAnnouncer timer={timer} />

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="lg"
          variant={isRunning ? "secondary" : "default"}
          className="h-14"
          onClick={() => (isRunning ? onPause(step) : onStart(step))}
        >
          {isRunning ? <Pause /> : <Play />}
          {isRunning ? "Pause" : isComplete ? "Restart" : "Start"}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="h-14"
          onClick={() => onReset(step)}
        >
          <RotateCcw />
          Reset
        </Button>
      </div>
    </section>
  );
}

/**
 * Screen-reader-only live region for the step timer. The visible countdown is
 * NOT announced continuously (it uses role="timer" + aria-live="off"); this only
 * speaks at meaningful transitions — start, pause, and completion.
 */
function TimerAnnouncer({ timer }: { timer: TimerRecord }) {
  const [message, setMessage] = React.useState("");
  const previousStatusRef = React.useRef<TimerStatus>(timer.status);

  React.useEffect(() => {
    const previous = previousStatusRef.current;
    if (previous === timer.status) return;
    previousStatusRef.current = timer.status;

    if (timer.status === "running") {
      setMessage(`Timer started, ${formatCountdown(timer.remaining)} remaining`);
    } else if (timer.status === "paused") {
      setMessage(`Timer paused, ${formatCountdown(timer.remaining)} remaining`);
    } else if (timer.status === "complete") {
      setMessage("Timer complete");
    }
  }, [timer.status, timer.remaining]);

  return (
    <p className="sr-only" role="status">
      {message}
    </p>
  );
}

function RecipeAtAGlance({ recipe }: { recipe: CookRecipe }) {
  const hasMeta =
    recipe.totalMinutes != null ||
    recipe.prepMinutes != null ||
    recipe.cookMinutes != null ||
    recipe.servings != null;

  if (!hasMeta) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-token">
      <h2 className="font-display text-xl font-semibold">At a glance</h2>
      <div className="mt-4 grid gap-3 text-sm">
        {recipe.totalMinutes != null && (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Clock3 className="size-4 text-primary" />
            <span className="font-medium text-foreground">
              {formatMinutes(recipe.totalMinutes)}
            </span>
            total
          </span>
        )}
        {recipe.prepMinutes != null && (
          <span className="flex items-center gap-2 text-muted-foreground">
            <ChefHat className="size-4 text-primary" />
            <span className="font-medium text-foreground">
              {formatMinutes(recipe.prepMinutes)}
            </span>
            prep
          </span>
        )}
        {recipe.cookMinutes != null && (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Timer className="size-4 text-primary" />
            <span className="font-medium text-foreground">
              {formatMinutes(recipe.cookMinutes)}
            </span>
            cooking
          </span>
        )}
        {recipe.servings != null && (
          <span className="flex items-center gap-2 text-muted-foreground">
            <BookOpen className="size-4 text-primary" />
            <span className="font-medium text-foreground">
              {recipe.servings} {recipe.servingsNoun ?? "servings"}
            </span>
          </span>
        )}
      </div>
    </section>
  );
}

function ActiveTimersPanel({
  activeTimers,
  currentStepId,
  onSelect,
  onStart,
  onPause,
  onReset,
}: {
  activeTimers: ActiveTimer[];
  currentStepId: string;
  onSelect: (index: number) => void;
  onStart: (step: CookStep) => void;
  onPause: (step: CookStep) => void;
  onReset: (step: CookStep) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-token">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
        <Timer className="size-5 text-primary" />
        Active timers
      </h2>
      <div className="mt-4 flex flex-col gap-2">
        {activeTimers.map(({ step, stepIndex, timer }) => {
          const isCurrent = currentStepId === step.id;
          const isRunning = timer.status === "running";

          return (
            <div
              key={step.id}
              className={cn(
                "rounded-xl border border-border bg-background p-3",
                isCurrent && "border-primary/40 bg-primary/10",
                timer.status === "complete" && "border-success/40 bg-success/10",
              )}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() => onSelect(stepIndex)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Jump to step ${stepIndex + 1}: ${
                  step.section ?? step.instruction
                } — ${formatCountdown(timer.remaining)} remaining`}
              >
                <span className="min-w-0">
                  <span className="block font-medium">Step {stepIndex + 1}</span>
                  <span className="line-clamp-1 text-sm text-muted-foreground">
                    {step.section ?? step.instruction}
                  </span>
                </span>
                <span className="font-mono text-lg font-semibold tabular-nums">
                  {formatCountdown(timer.remaining)}
                </span>
              </button>

              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => (isRunning ? onPause(step) : onStart(step))}
                >
                  {isRunning ? <Pause /> : <Play />}
                  {isRunning ? "Pause" : "Start"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onReset(step)}
                >
                  <RotateCcw />
                  Reset
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CookNotes({ notes }: { notes: string }) {
  return (
    <details className="group rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-token">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-xl font-semibold [&::-webkit-details-marker]:hidden">
        Cook&apos;s notes
        <ChevronDown className="size-5 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <Separator className="my-4" />
      <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
        {notes}
      </p>
    </details>
  );
}

function OverviewDialog({
  steps,
  currentIndex,
  onStepSelect,
}: {
  steps: CookStep[];
  currentIndex: number;
  onStepSelect: (index: number) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="lg" className="h-12 sm:h-14">
          <ListOrdered />
          <span className="hidden sm:inline">Overview</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-5 pr-14 text-left">
          <DialogTitle className="text-2xl">Recipe overview</DialogTitle>
          <DialogDescription>
            Jump to any step without stopping timers.
          </DialogDescription>
        </DialogHeader>
        <ol className="max-h-[70dvh] overflow-y-auto p-3">
          {steps.map((step, index) => {
            const isCurrent = index === currentIndex;

            return (
              <li key={step.id}>
                <button
                  type="button"
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={`Go to step ${index + 1}: ${
                    step.section ?? step.instruction
                  }`}
                  className={cn(
                    "flex w-full gap-4 rounded-xl p-3 text-left transition-colors hover:bg-muted",
                    isCurrent && "bg-primary/10 text-foreground",
                  )}
                  onClick={() => {
                    onStepSelect(index);
                    setOpen(false);
                  }}
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full border border-border font-display text-lg font-semibold",
                      isCurrent && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    {step.section && (
                      <span className="block text-sm font-medium text-muted-foreground">
                        {step.section}
                      </span>
                    )}
                    <span className="block text-base leading-relaxed">
                      {step.instruction}
                    </span>
                    {(step.timerSeconds != null || step.techniques?.length) && (
                      <span className="mt-2 flex flex-wrap gap-2">
                        {step.timerSeconds != null && (
                          <Badge variant="secondary">
                            <Timer className="size-3" />
                            {formatCountdown(step.timerSeconds)}
                          </Badge>
                        )}
                        {step.techniques?.map((technique) => (
                          <Badge key={technique} variant="outline">
                            {technique}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </span>
                  {isCurrent && (
                    <CheckCircle2 className="mt-1 size-5 shrink-0 text-primary" />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

function EmptyCookExperience({
  recipe,
  wakeLockStatus,
  ingredientControls,
}: {
  recipe: CookRecipe;
  wakeLockStatus: string;
  ingredientControls: IngredientsPanelControls;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Cook mode</Badge>
              {wakeLockStatus === "active" && (
                <Badge variant="success" className="hidden md:inline-flex">
                  Screen awake
                </Badge>
              )}
            </div>
            <h1 className="truncate font-display text-xl font-semibold">
              {recipe.title}
            </h1>
          </div>
          <IngredientsDrawer
            recipe={recipe}
            className="hidden sm:inline-flex"
            controls={ingredientControls}
          />
          <Button asChild variant="ghost" size="icon" aria-label="Exit cook mode">
            <Link href={`/recipes/${recipe.slug}`}>
              <X />
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-5 py-10">
        <section className="w-full rounded-2xl border border-border bg-card p-8 text-center text-card-foreground shadow-token-lg">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/12 text-primary">
            <ChefHat className="size-8" />
          </div>
          <h2 className="mt-6 font-display text-3xl font-semibold tracking-tight">
            No cooking steps yet
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-muted-foreground">
            This recipe is saved, but the method still needs step-by-step
            instructions before cook mode can guide you through it.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href={`/recipes/${recipe.slug}`}>
                <ArrowLeft />
                Back to recipe
              </Link>
            </Button>
            {recipe.ingredients.length > 0 && (
              <IngredientsDrawer
                recipe={recipe}
                className="sm:hidden"
                controls={ingredientControls}
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
