"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  Clock3,
  ListOrdered,
  Pause,
  Play,
  RotateCcw,
  Timer,
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
import { cn, formatMinutes } from "~/lib/utils";

import { IngredientsDrawer } from "./ingredients-drawer";
import type { CookRecipe, CookStep } from "./types";
import { useScreenWakeLock } from "./use-screen-wake-lock";

type TimerStatus = "idle" | "running" | "paused" | "complete";

type TimerRecord = {
  duration: number;
  remaining: number;
  status: TimerStatus;
  endsAt: number | null;
};

type ActiveTimer = {
  step: CookStep;
  stepIndex: number;
  timer: TimerRecord;
};

type WindowWithLegacyAudio = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function clampStep(index: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(Math.max(index, 0), total - 1);
}

function makeTimer(step: CookStep): TimerRecord {
  const duration = Math.max(0, step.timerSeconds ?? 0);
  return {
    duration,
    remaining: duration,
    status: "idle",
    endsAt: null,
  };
}

function timerForStep(timers: Record<string, TimerRecord>, step: CookStep) {
  return timers[step.id] ?? makeTimer(step);
}

function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds,
    ).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function shortTimerLabel(seconds: number) {
  if (seconds >= 60) {
    const minutes = Math.round(seconds / 60);
    return `${minutes} min`;
  }
  return `${seconds}s`;
}

function timerStatusText(timer: TimerRecord) {
  if (timer.status === "complete") return "Timer complete";
  if (timer.status === "running") return `${formatCountdown(timer.remaining)} remaining`;
  if (timer.status === "paused") return `Paused with ${formatCountdown(timer.remaining)} remaining`;
  return `${formatCountdown(timer.duration)} ready`;
}

function playTimerTone() {
  if (typeof window === "undefined") return;

  const AudioContextConstructor =
    window.AudioContext ?? (window as WindowWithLegacyAudio).webkitAudioContext;
  if (!AudioContextConstructor) return;

  let context: AudioContext;
  try {
    context = new AudioContextConstructor();
  } catch {
    return;
  }

  const play = () => {
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.setValueAtTime(660, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.55);
    oscillator.onended = () => {
      void context.close().catch(() => undefined);
    };
  };

  if (context.state === "suspended") {
    void context
      .resume()
      .then(play)
      .catch(() => {
        void context.close().catch(() => undefined);
      });
    return;
  }

  play();
}

function shouldIgnoreShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.closest(
      "a,button,input,textarea,select,[role='button'],[role='dialog'],[contenteditable='true']",
    ) != null
  );
}

function useCookTimers(recipe: CookRecipe) {
  const [timers, setTimers] = React.useState<Record<string, TimerRecord>>({});
  const announcedTimersRef = React.useRef<Set<string>>(new Set());

  const hasRunningTimers = React.useMemo(
    () => Object.values(timers).some((timer) => timer.status === "running"),
    [timers],
  );

  React.useEffect(() => {
    if (!hasRunningTimers) return;

    const intervalId = window.setInterval(() => {
      setTimers((previous) => {
        let changed = false;
        const next: Record<string, TimerRecord> = { ...previous };
        const now = Date.now();

        for (const [stepId, timer] of Object.entries(previous)) {
          if (timer.status !== "running") continue;

          const endsAt = timer.endsAt ?? now;
          const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
          if (remaining === timer.remaining && remaining > 0) continue;

          next[stepId] = {
            ...timer,
            remaining,
            status: remaining === 0 ? "complete" : "running",
            endsAt: remaining === 0 ? null : endsAt,
          };
          changed = true;
        }

        return changed ? next : previous;
      });
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [hasRunningTimers]);

  React.useEffect(() => {
    recipe.steps.forEach((step, index) => {
      const timer = timers[step.id];
      if (timer?.status !== "complete") return;
      if (announcedTimersRef.current.has(step.id)) return;

      announcedTimersRef.current.add(step.id);
      playTimerTone();
      toast.success(`Step ${index + 1} timer is done`, {
        description: step.section ?? recipe.title,
      });
    });
  }, [recipe.steps, recipe.title, timers]);

  const startTimer = React.useCallback((step: CookStep) => {
    if (step.timerSeconds == null || step.timerSeconds <= 0) return;

    announcedTimersRef.current.delete(step.id);
    setTimers((previous) => {
      const current = timerForStep(previous, step);
      const remaining =
        current.status === "complete" || current.remaining <= 0
          ? current.duration
          : current.remaining;

      return {
        ...previous,
        [step.id]: {
          ...current,
          remaining,
          status: "running",
          endsAt: Date.now() + remaining * 1000,
        },
      };
    });
  }, []);

  const pauseTimer = React.useCallback((step: CookStep) => {
    setTimers((previous) => {
      const current = previous[step.id];
      if (current?.status !== "running") return previous;

      const remaining = Math.max(
        0,
        Math.ceil(((current.endsAt ?? Date.now()) - Date.now()) / 1000),
      );

      return {
        ...previous,
        [step.id]: {
          ...current,
          remaining,
          status: remaining === 0 ? "complete" : "paused",
          endsAt: null,
        },
      };
    });
  }, []);

  const resetTimer = React.useCallback((step: CookStep) => {
    announcedTimersRef.current.delete(step.id);
    setTimers((previous) => ({
      ...previous,
      [step.id]: makeTimer(step),
    }));
  }, []);

  const activeTimers = React.useMemo(() => {
    const active: ActiveTimer[] = [];

    recipe.steps.forEach((step, stepIndex) => {
      const timer = timers[step.id];
      if (!timer || timer.status === "idle") return;
      active.push({ step, stepIndex, timer });
    });

    return active;
  }, [recipe.steps, timers]);

  return {
    timers,
    activeTimers,
    startTimer,
    pauseTimer,
    resetTimer,
  };
}

export function CookExperience({ recipe }: { recipe: CookRecipe }) {
  const wakeLockStatus = useScreenWakeLock();
  const [stepIndex, setStepIndex] = React.useState(0);
  const totalSteps = recipe.steps.length;
  const firstStep = recipe.steps[0];
  const {
    timers,
    activeTimers,
    startTimer,
    pauseTimer,
    resetTimer,
  } = useCookTimers(recipe);

  React.useEffect(() => {
    setStepIndex((current) => clampStep(current, totalSteps));
  }, [totalSteps]);

  const goToStep = React.useCallback(
    (index: number) => {
      setStepIndex(clampStep(index, totalSteps));
    },
    [totalSteps],
  );

  const goPrevious = React.useCallback(() => {
    setStepIndex((current) => clampStep(current - 1, totalSteps));
  }, [totalSteps]);

  const goNext = React.useCallback(() => {
    setStepIndex((current) => clampStep(current + 1, totalSteps));
  }, [totalSteps]);

  React.useEffect(() => {
    if (totalSteps === 0) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreShortcutTarget(event.target)) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
      }

      if (event.key === "ArrowRight" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        goNext();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrevious, totalSteps]);

  if (!firstStep) {
    return (
      <EmptyCookExperience
        recipe={recipe}
        wakeLockStatus={wakeLockStatus}
      />
    );
  }

  const currentStep = recipe.steps[stepIndex] ?? firstStep;
  const currentTimer =
    currentStep.timerSeconds != null ? timerForStep(timers, currentStep) : null;
  const progressValue = ((stepIndex + 1) / totalSteps) * 100;
  const canGoPrevious = stepIndex > 0;
  const canGoNext = stepIndex < totalSteps - 1;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <CookHeader
        recipe={recipe}
        activeTimers={activeTimers}
        currentIndex={stepIndex}
        totalSteps={totalSteps}
        progressValue={progressValue}
        wakeLockStatus={wakeLockStatus}
        onStepSelect={goToStep}
      />

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-5 px-3 py-4 sm:px-5 sm:py-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section
          key={currentStep.id}
          aria-labelledby="current-step-title"
          className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-token-lg motion-safe:animate-fade-in"
        >
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
              {currentStep.techniques?.map((technique) => (
                <Badge key={technique} variant="outline" className="text-sm">
                  {technique}
                </Badge>
              ))}
              {currentStep.timerSeconds != null && (
                <Badge variant="accent" className="gap-1 text-sm">
                  <Timer className="size-3.5" />
                  {shortTimerLabel(currentStep.timerSeconds)}
                </Badge>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <p className="text-sm font-semibold text-muted-foreground">
                Step {stepIndex + 1} of {totalSteps}
              </p>
              <h1
                id="current-step-title"
                className="max-w-4xl font-display text-3xl font-semibold leading-tight tracking-tight text-pretty sm:text-4xl lg:text-5xl"
              >
                {currentStep.instruction}
              </h1>
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

      <footer className="sticky bottom-0 z-30 border-t border-border bg-background/95 px-3 py-3 backdrop-blur sm:px-5">
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
          />

          <Button
            type="button"
            size="xl"
            className="h-16 justify-end text-lg sm:h-[4.5rem]"
            onClick={goNext}
            disabled={!canGoNext}
          >
            {canGoNext ? "Next" : "Done"}
            <ArrowRight />
          </Button>
        </div>
      </footer>
    </div>
  );
}

function CookHeader({
  recipe,
  activeTimers,
  currentIndex,
  totalSteps,
  progressValue,
  wakeLockStatus,
  onStepSelect,
}: {
  recipe: CookRecipe;
  activeTimers: ActiveTimer[];
  currentIndex: number;
  totalSteps: number;
  progressValue: number;
  wakeLockStatus: string;
  onStepSelect: (index: number) => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-3 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="hidden sm:inline-flex">
              Cook mode
            </Badge>
            <span className="font-medium">
              Step {currentIndex + 1} of {totalSteps}
            </span>
            {activeTimers.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Timer className="size-3.5" />
                {activeTimers.length} active
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
        <IngredientsDrawer recipe={recipe} className="h-12 px-3 md:hidden" />
        <IngredientsDrawer recipe={recipe} className="hidden md:inline-flex" />
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
        aria-live="polite"
      >
        <div className="font-mono text-5xl font-bold tabular-nums tracking-tight sm:text-6xl">
          {formatCountdown(timer.remaining)}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {timerStatusText(timer)}
        </p>
      </div>

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
                            {shortTimerLabel(step.timerSeconds)}
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
}: {
  recipe: CookRecipe;
  wakeLockStatus: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3">
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
          <IngredientsDrawer recipe={recipe} className="hidden sm:inline-flex" />
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
              <IngredientsDrawer recipe={recipe} className="sm:hidden" />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
