"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  clampStepIndex,
  cookStorageKey,
  countRunningTimers,
  makeTimer,
  parseCookState,
  reconcileTimers,
  serializeCookState,
  type StoredCookState,
  type TimerRecord,
  type UnitSystem,
} from "~/lib/cook-state";

import type { CookRecipe, CookStep } from "./types";

export type ActiveTimer = {
  step: CookStep;
  stepIndex: number;
  timer: TimerRecord;
};

type WindowWithLegacyAudio = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

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

function defaultState(recipe: CookRecipe): StoredCookState {
  return {
    stepIndex: 0,
    servings: recipe.servings ?? null,
    system: "original",
    checked: [],
    timers: {},
  };
}

/**
 * Owns all cook-mode state that should outlive an individual drawer or a page
 * reload: the current step, ingredient scaling/units/checklist, and per-step
 * timers. State is lifted here (fixing the drawer-unmount reset) and mirrored to
 * localStorage keyed by recipe id, with timers persisted by absolute end time so
 * a running countdown survives a reload.
 */
export function useCookSession(recipe: CookRecipe) {
  const storageKey = cookStorageKey(recipe.id);
  const totalSteps = recipe.steps.length;
  const baseServings = recipe.servings ?? null;

  const [state, setState] = React.useState<StoredCookState>(() =>
    defaultState(recipe),
  );
  const [loaded, setLoaded] = React.useState(false);
  const announcedTimersRef = React.useRef<Set<string>>(new Set());

  // Hydrate from localStorage after mount so SSR output stays deterministic.
  React.useEffect(() => {
    if (typeof window === "undefined") {
      setLoaded(true);
      return;
    }

    const stored = parseCookState(window.localStorage.getItem(storageKey));
    if (stored) {
      const timers = reconcileTimers(stored.timers, Date.now());
      // Don't replay tones/toasts for timers that finished while we were away.
      for (const [id, timer] of Object.entries(timers)) {
        if (timer.status === "complete") announcedTimersRef.current.add(id);
      }
      setState({
        stepIndex: clampStepIndex(stored.stepIndex, totalSteps),
        servings: stored.servings ?? baseServings,
        system: stored.system,
        checked: stored.checked,
        timers,
      });
    }
    setLoaded(true);
  }, [storageKey, totalSteps, baseServings]);

  // Persist after hydration; skipping the pre-load render avoids clobbering
  // stored data with the initial defaults.
  React.useEffect(() => {
    if (!loaded || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, serializeCookState(state));
    } catch {
      // Ignore quota / private-mode write failures.
    }
  }, [loaded, state, storageKey]);

  // Keep the step index valid if the recipe's step count ever changes.
  React.useEffect(() => {
    setState((prev) => {
      const clamped = clampStepIndex(prev.stepIndex, totalSteps);
      return clamped === prev.stepIndex ? prev : { ...prev, stepIndex: clamped };
    });
  }, [totalSteps]);

  const hasRunningTimers = React.useMemo(
    () => countRunningTimers(state.timers) > 0,
    [state.timers],
  );

  // Tick running timers off their absolute end time.
  React.useEffect(() => {
    if (!hasRunningTimers) return;

    const intervalId = window.setInterval(() => {
      setState((prev) => {
        const timers = reconcileTimers(prev.timers, Date.now());
        return timers === prev.timers ? prev : { ...prev, timers };
      });
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [hasRunningTimers]);

  // Announce completion once per timer (meaningful moment for screen readers).
  React.useEffect(() => {
    recipe.steps.forEach((step, index) => {
      const timer = state.timers[step.id];
      if (timer?.status !== "complete") return;
      if (announcedTimersRef.current.has(step.id)) return;

      announcedTimersRef.current.add(step.id);
      playTimerTone();
      toast.success(`Step ${index + 1} timer is done`, {
        description: step.section ?? recipe.title,
      });
    });
  }, [recipe.steps, recipe.title, state.timers]);

  const goToStep = React.useCallback(
    (index: number) => {
      setState((prev) => {
        const clamped = clampStepIndex(index, totalSteps);
        return clamped === prev.stepIndex
          ? prev
          : { ...prev, stepIndex: clamped };
      });
    },
    [totalSteps],
  );

  const goPrevious = React.useCallback(() => {
    setState((prev) => {
      const clamped = clampStepIndex(prev.stepIndex - 1, totalSteps);
      return clamped === prev.stepIndex ? prev : { ...prev, stepIndex: clamped };
    });
  }, [totalSteps]);

  const goNext = React.useCallback(() => {
    setState((prev) => {
      const clamped = clampStepIndex(prev.stepIndex + 1, totalSteps);
      return clamped === prev.stepIndex ? prev : { ...prev, stepIndex: clamped };
    });
  }, [totalSteps]);

  const startTimer = React.useCallback((step: CookStep) => {
    if (step.timerSeconds == null || step.timerSeconds <= 0) return;

    announcedTimersRef.current.delete(step.id);
    setState((prev) => {
      const current = prev.timers[step.id] ?? makeTimer(step.timerSeconds);
      const remaining =
        current.status === "complete" || current.remaining <= 0
          ? current.duration
          : current.remaining;

      return {
        ...prev,
        timers: {
          ...prev.timers,
          [step.id]: {
            ...current,
            remaining,
            status: "running",
            endsAt: Date.now() + remaining * 1000,
          },
        },
      };
    });
  }, []);

  const pauseTimer = React.useCallback((step: CookStep) => {
    setState((prev) => {
      const current = prev.timers[step.id];
      if (current?.status !== "running") return prev;

      const remaining = Math.max(
        0,
        Math.ceil(((current.endsAt ?? Date.now()) - Date.now()) / 1000),
      );

      return {
        ...prev,
        timers: {
          ...prev.timers,
          [step.id]: {
            ...current,
            remaining,
            status: remaining === 0 ? "complete" : "paused",
            endsAt: null,
          },
        },
      };
    });
  }, []);

  const resetTimer = React.useCallback((step: CookStep) => {
    announcedTimersRef.current.delete(step.id);
    setState((prev) => ({
      ...prev,
      timers: { ...prev.timers, [step.id]: makeTimer(step.timerSeconds) },
    }));
  }, []);

  const setServings = React.useCallback((next: number) => {
    setState((prev) => ({ ...prev, servings: next }));
  }, []);

  const setSystem = React.useCallback((next: UnitSystem) => {
    setState((prev) => ({ ...prev, system: next }));
  }, []);

  const toggleChecked = React.useCallback((id: string) => {
    setState((prev) => {
      const checked = prev.checked.includes(id)
        ? prev.checked.filter((entry) => entry !== id)
        : [...prev.checked, id];
      return { ...prev, checked };
    });
  }, []);

  const clearSession = React.useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Ignore private-mode failures.
      }
    }
    announcedTimersRef.current.clear();
    setState(defaultState(recipe));
  }, [recipe, storageKey]);

  const activeTimers = React.useMemo<ActiveTimer[]>(() => {
    const active: ActiveTimer[] = [];
    recipe.steps.forEach((step, stepIndex) => {
      const timer = state.timers[step.id];
      if (!timer || timer.status === "idle") return;
      active.push({ step, stepIndex, timer });
    });
    return active;
  }, [recipe.steps, state.timers]);

  const runningTimerCount = React.useMemo(
    () => countRunningTimers(state.timers),
    [state.timers],
  );

  const checkedSet = React.useMemo<ReadonlySet<string>>(
    () => new Set(state.checked),
    [state.checked],
  );

  return {
    stepIndex: state.stepIndex,
    timers: state.timers,
    activeTimers,
    runningTimerCount,
    servings: state.servings ?? baseServings ?? 1,
    system: state.system,
    checked: checkedSet,
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
  };
}
