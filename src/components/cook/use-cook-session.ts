"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { toast } from "sonner";

import {
  clampStepIndex,
  cookStorageKey,
  countRunningCustomTimers,
  countRunningTimers,
  makeCustomTimer,
  makeTimer,
  parseCookState,
  reconcileCustomTimers,
  reconcileTimers,
  serializeCookState,
  type StoredCookState,
  type TimerRecord,
  type UnitSystem,
} from "~/lib/cook-state";
import {
  buildCookTimerNotification,
  COOK_NOTIFICATION_TAG_PREFIX,
  COOK_NOTIFICATION_TYPE,
  cookTimerNotificationUrl,
  requestTimerNotificationPermission,
  shouldSendTimerNotification,
} from "~/lib/cook-notify";
import { defaultSystemForLocale } from "~/lib/units";
import { track } from "~/lib/analytics";
import { HAPTICS, vibrate } from "~/lib/haptics";
import {
  beginCookSession,
  endCookSession,
  markFirstCookStarted,
  type WritableStorage,
} from "~/lib/analytics/cook-tracking";

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

/**
 * Fire a system notification for a completed timer when the tab is backgrounded
 * (#186). Foreground completion keeps its tone + toast; this surfaces the alert
 * on the lock screen / tray via the SW registration when the cook has stepped
 * away. Best-effort: degrades silently where the SW or notifications are
 * unavailable (dev, unsupported, denied).
 */
function notifyTimerComplete(input: {
  stepNumber: number;
  section: string | null;
  recipeTitle: string;
  recipeSlug: string;
  stepId: string;
}): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  const supported =
    typeof Notification !== "undefined" && "serviceWorker" in navigator;
  const permission =
    typeof Notification !== "undefined" ? Notification.permission : "denied";
  const documentHidden =
    typeof document !== "undefined" && document.visibilityState === "hidden";
  if (!shouldSendTimerNotification({ supported, permission, documentHidden })) {
    return;
  }

  const { title, options } = buildCookTimerNotification(input);
  void navigator.serviceWorker.ready
    .then((registration) => registration.showNotification(title, options))
    .catch(() => {
      // SW not ready or notifications unavailable — tone + toast already fired.
    });
}

function defaultState(
  recipe: CookRecipe,
  householdSize: number | null,
  system: UnitSystem,
): StoredCookState {
  return {
    stepIndex: 0,
    servings: householdSize ?? recipe.servings ?? null,
    system,
    checked: [],
    timers: {},
    customTimers: [],
  };
}

/**
 * Background system notification for a completed custom timer (#392). Mirrors
 * `notifyTimerComplete` but titles the alert with the timer's own label instead
 * of a step number. Best-effort and silent where the SW/notifications aren't
 * available; foreground completion still gets its tone + toast.
 */
function notifyCustomTimerComplete(input: {
  label: string;
  recipeTitle: string;
  recipeSlug: string;
  timerId: string;
}): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  const supported =
    typeof Notification !== "undefined" && "serviceWorker" in navigator;
  const permission =
    typeof Notification !== "undefined" ? Notification.permission : "denied";
  const documentHidden =
    typeof document !== "undefined" && document.visibilityState === "hidden";
  if (!shouldSendTimerNotification({ supported, permission, documentHidden })) {
    return;
  }

  const url = cookTimerNotificationUrl(input.recipeSlug);
  void navigator.serviceWorker.ready
    .then((registration) =>
      registration.showNotification(`${input.label} is done`, {
        body: input.recipeTitle,
        tag: `${COOK_NOTIFICATION_TAG_PREFIX}:${input.recipeSlug}:${input.timerId}`,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url, type: COOK_NOTIFICATION_TYPE },
      }),
    )
    .catch(() => {
      // SW not ready or notifications unavailable — tone + toast already fired.
    });
}

/** Generate a collision-resistant id for a custom timer. */
function newCustomTimerId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `ct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** localStorage, or null when unavailable (SSR / private mode). */
function cookStorage(): WritableStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Owns all cook-mode state that should outlive an individual drawer or a page
 * reload: the current step, ingredient scaling/units/checklist, and per-step
 * timers. State is lifted here (fixing the drawer-unmount reset) and mirrored to
 * localStorage keyed by recipe id, with timers persisted by absolute end time so
 * a running countdown survives a reload.
 */
export function useCookSession(
  recipe: CookRecipe,
  options?: { householdSize?: number | null },
) {
  const householdSize = options?.householdSize ?? null;
  const storageKey = cookStorageKey(recipe.id);
  const totalSteps = recipe.steps.length;
  const baseServings = recipe.servings ?? null;
  // No stored preference yet? Start from the system the reader's locale implies
  // (US → imperial, elsewhere → metric); an explicit, persisted choice always
  // wins during hydration below.
  const locale = useLocale();

  const [state, setState] = React.useState<StoredCookState>(() =>
    defaultState(recipe, householdSize, defaultSystemForLocale(locale)),
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
      const customTimers = reconcileCustomTimers(
        stored.customTimers,
        Date.now(),
      );
      // Don't replay tones/toasts for timers that finished while we were away.
      for (const [id, timer] of Object.entries(timers)) {
        if (timer.status === "complete") announcedTimersRef.current.add(id);
      }
      for (const timer of customTimers) {
        if (timer.status === "complete")
          announcedTimersRef.current.add(timer.id);
      }
      setState({
        stepIndex: clampStepIndex(stored.stepIndex, totalSteps),
        servings: stored.servings ?? householdSize ?? baseServings,
        system: stored.system,
        checked: stored.checked,
        timers,
        customTimers,
      });
    }
    setLoaded(true);
  }, [storageKey, totalSteps, baseServings, householdSize]);

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
      return clamped === prev.stepIndex
        ? prev
        : { ...prev, stepIndex: clamped };
    });
  }, [totalSteps]);

  // cook_started: once per session, deduped across reload via a localStorage
  // marker (#313). Runs after hydration and never inside the 250ms timer loop.
  const startedRef = React.useRef(false);
  React.useEffect(() => {
    if (!loaded || startedRef.current) return;
    startedRef.current = true;
    const { isNew } = beginCookSession(cookStorage(), recipe.id);
    if (isNew) {
      track("cook_started", {
        recipeId: recipe.id,
        totalSteps,
        householdId: recipe.householdId,
      });
      // Activation funnel (#328): the user's first-ever cook on this device.
      const { isFirstEver } = markFirstCookStarted(cookStorage());
      if (isFirstEver) track("first_cook_started", { recipeId: recipe.id });
    }
  }, [loaded, recipe.id, recipe.householdId, totalSteps]);

  // cook_step_advanced / cook_completed: driven off step-index changes only, so
  // the 250ms timer tick (which only touches timers) never re-runs this.
  const prevStepRef = React.useRef<number | null>(null);
  const completedRef = React.useRef(false);
  React.useEffect(() => {
    if (!loaded) return;
    const previous = prevStepRef.current;
    prevStepRef.current = state.stepIndex;
    // First settle after hydration establishes the baseline, not an advance.
    if (previous === null || state.stepIndex <= previous) return;

    track("cook_step_advanced", {
      recipeId: recipe.id,
      stepIndex: state.stepIndex,
      totalSteps,
    });

    if (
      !completedRef.current &&
      totalSteps > 0 &&
      state.stepIndex >= totalSteps - 1
    ) {
      completedRef.current = true;
      const { durationMs } = endCookSession(cookStorage(), recipe.id);
      track("cook_completed", {
        recipeId: recipe.id,
        totalSteps,
        durationMs,
        householdId: recipe.householdId,
      });
    }
  }, [loaded, state.stepIndex, totalSteps, recipe.id, recipe.householdId]);

  const hasRunningTimers = React.useMemo(
    () =>
      countRunningTimers(state.timers) +
        countRunningCustomTimers(state.customTimers) >
      0,
    [state.timers, state.customTimers],
  );

  // Tick running timers off their absolute end time.
  React.useEffect(() => {
    if (!hasRunningTimers) return;

    const intervalId = window.setInterval(() => {
      setState((prev) => {
        const now = Date.now();
        const timers = reconcileTimers(prev.timers, now);
        const customTimers = reconcileCustomTimers(prev.customTimers, now);
        if (timers === prev.timers && customTimers === prev.customTimers) {
          return prev;
        }
        return { ...prev, timers, customTimers };
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
      vibrate(HAPTICS.timerComplete);
      track("cook_timer_completed", { recipeId: recipe.id });
      toast.success(`Step ${index + 1} timer is done`, {
        description: step.section ?? recipe.title,
      });
      notifyTimerComplete({
        stepNumber: index + 1,
        section: step.section,
        recipeTitle: recipe.title,
        recipeSlug: recipe.slug,
        stepId: step.id,
      });
    });
  }, [recipe.id, recipe.slug, recipe.steps, recipe.title, state.timers]);

  // Announce completion once per custom timer (#392), keyed by the timer's own
  // id and titled with its label so several finishing at once each speak for
  // themselves.
  React.useEffect(() => {
    state.customTimers.forEach((timer) => {
      if (timer.status !== "complete") return;
      if (announcedTimersRef.current.has(timer.id)) return;

      announcedTimersRef.current.add(timer.id);
      playTimerTone();
      vibrate(HAPTICS.timerComplete);
      track("cook_timer_completed", { recipeId: recipe.id });
      toast.success(`${timer.label || "Timer"} is done`, {
        description: recipe.title,
      });
      notifyCustomTimerComplete({
        label: timer.label || "Timer",
        recipeTitle: recipe.title,
        recipeSlug: recipe.slug,
        timerId: timer.id,
      });
    });
  }, [recipe.id, recipe.slug, recipe.title, state.customTimers]);

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
      return clamped === prev.stepIndex
        ? prev
        : { ...prev, stepIndex: clamped };
    });
  }, [totalSteps]);

  const goNext = React.useCallback(() => {
    setState((prev) => {
      const clamped = clampStepIndex(prev.stepIndex + 1, totalSteps);
      return clamped === prev.stepIndex
        ? prev
        : { ...prev, stepIndex: clamped };
    });
  }, [totalSteps]);

  const startTimer = React.useCallback(
    (step: CookStep) => {
      if (step.timerSeconds == null || step.timerSeconds <= 0) return;

      track("cook_timer_started", { recipeId: recipe.id });
      announcedTimersRef.current.delete(step.id);
      // Contextual permission ask (#186): the user just chose to run a timer, so
      // prompt now (a user gesture) rather than on cold load. No-op unless the
      // permission is still "default"; denial degrades to tone + toast only.
      void requestTimerNotificationPermission(
        typeof Notification !== "undefined" ? Notification : undefined,
      );
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
    },
    [recipe.id],
  );

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

  const addCustomTimer = React.useCallback(
    (input: {
      label: string;
      durationSeconds: number;
      stepPosition?: number | null;
    }): string | null => {
      if (
        !Number.isFinite(input.durationSeconds) ||
        input.durationSeconds <= 0
      ) {
        return null;
      }

      track("cook_timer_started", { recipeId: recipe.id });
      // Contextual permission ask (#186): the cook just started a timer.
      void requestTimerNotificationPermission(
        typeof Notification !== "undefined" ? Notification : undefined,
      );

      const id = newCustomTimerId();
      announcedTimersRef.current.delete(id);
      const timer = makeCustomTimer({
        id,
        label: input.label.trim() || "Timer",
        durationSeconds: input.durationSeconds,
        stepPosition: input.stepPosition ?? null,
        start: true,
      });
      setState((prev) => ({
        ...prev,
        customTimers: [...prev.customTimers, timer],
      }));
      return id;
    },
    [recipe.id],
  );

  const startCustomTimer = React.useCallback((id: string) => {
    announcedTimersRef.current.delete(id);
    setState((prev) => ({
      ...prev,
      customTimers: prev.customTimers.map((timer) => {
        if (timer.id !== id) return timer;
        const remaining =
          timer.status === "complete" || timer.remaining <= 0
            ? timer.duration
            : timer.remaining;
        return {
          ...timer,
          remaining,
          status: "running",
          endsAt: Date.now() + remaining * 1000,
        };
      }),
    }));
  }, []);

  const pauseCustomTimer = React.useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      customTimers: prev.customTimers.map((timer) => {
        if (timer.id !== id || timer.status !== "running") return timer;
        const remaining = Math.max(
          0,
          Math.ceil(((timer.endsAt ?? Date.now()) - Date.now()) / 1000),
        );
        return {
          ...timer,
          remaining,
          status: remaining === 0 ? "complete" : "paused",
          endsAt: null,
        };
      }),
    }));
  }, []);

  const resetCustomTimer = React.useCallback((id: string) => {
    announcedTimersRef.current.delete(id);
    setState((prev) => ({
      ...prev,
      customTimers: prev.customTimers.map((timer) =>
        timer.id === id
          ? {
              ...timer,
              remaining: timer.duration,
              status: "idle",
              endsAt: null,
            }
          : timer,
      ),
    }));
  }, []);

  const removeCustomTimer = React.useCallback((id: string) => {
    announcedTimersRef.current.delete(id);
    setState((prev) => ({
      ...prev,
      customTimers: prev.customTimers.filter((timer) => timer.id !== id),
    }));
  }, []);

  const setServings = React.useCallback(
    (next: number) => {
      track("cook_servings_scaled", { recipeId: recipe.id, servings: next });
      setState((prev) => ({ ...prev, servings: next }));
    },
    [recipe.id],
  );

  const setSystem = React.useCallback(
    (next: UnitSystem) => {
      track("cook_unit_system_changed", { recipeId: recipe.id, system: next });
      setState((prev) => ({ ...prev, system: next }));
    },
    [recipe.id],
  );

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
    // Clear the cook_started marker too, so re-cooking starts a fresh session.
    endCookSession(cookStorage(), recipe.id);
    announcedTimersRef.current.clear();
    setState(
      defaultState(recipe, householdSize, defaultSystemForLocale(locale)),
    );
  }, [recipe, storageKey, householdSize, locale]);

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
    () =>
      countRunningTimers(state.timers) +
      countRunningCustomTimers(state.customTimers),
    [state.timers, state.customTimers],
  );

  const checkedSet = React.useMemo<ReadonlySet<string>>(
    () => new Set(state.checked),
    [state.checked],
  );

  return {
    stepIndex: state.stepIndex,
    timers: state.timers,
    activeTimers,
    customTimers: state.customTimers,
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
    addCustomTimer,
    startCustomTimer,
    pauseCustomTimer,
    resetCustomTimer,
    removeCustomTimer,
    setServings,
    setSystem,
    toggleChecked,
    clearSession,
  };
}
