/**
 * Pure state helpers for cook mode: timer bookkeeping, keyboard shortcuts, and
 * localStorage (de)serialization. Kept free of React and DOM side effects so
 * they can be shared by the cook-mode hook and unit-tested in isolation.
 */

export type TimerStatus = "idle" | "running" | "paused" | "complete";

export type TimerRecord = {
  duration: number;
  /** Best-known seconds left; recomputed from `endsAt` for running timers. */
  remaining: number;
  status: TimerStatus;
  /** Absolute epoch-ms the timer finishes; only set while running. */
  endsAt: number | null;
};

export type UnitSystem = "original" | "us" | "metric";

/** The persisted shape of a single recipe's cook session. */
export type StoredCookState = {
  stepIndex: number;
  servings: number | null;
  system: UnitSystem;
  checked: string[];
  timers: Record<string, TimerRecord>;
};

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = "heirloom:cook:v1:";

/** localStorage key for a recipe's cook session. */
export function cookStorageKey(recipeId: string): string {
  return `${STORAGE_PREFIX}${recipeId}`;
}

/** Clamp a step index into the valid `[0, total)` range. */
export function clampStepIndex(index: number, totalSteps: number): number {
  if (totalSteps <= 0) return 0;
  return Math.min(Math.max(index, 0), totalSteps - 1);
}

/** A fresh, idle timer for a step's configured duration. */
export function makeTimer(durationSeconds: number | null | undefined): TimerRecord {
  const duration = Math.max(0, durationSeconds ?? 0);
  return { duration, remaining: duration, status: "idle", endsAt: null };
}

/**
 * Recompute a running timer's remaining seconds from its absolute end time so
 * a timer keeps the correct countdown across reloads. Non-running timers and
 * running timers whose value is unchanged are returned untouched.
 */
export function reconcileTimer(timer: TimerRecord, now: number): TimerRecord {
  if (timer.status !== "running" || timer.endsAt == null) return timer;

  const remaining = Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
  if (remaining <= 0) {
    return { ...timer, remaining: 0, status: "complete", endsAt: null };
  }
  if (remaining === timer.remaining) return timer;
  return { ...timer, remaining };
}

/** Reconcile every timer, preserving referential identity when nothing changes. */
export function reconcileTimers(
  timers: Record<string, TimerRecord>,
  now: number,
): Record<string, TimerRecord> {
  let changed = false;
  const next: Record<string, TimerRecord> = {};

  for (const [id, timer] of Object.entries(timers)) {
    const reconciled = reconcileTimer(timer, now);
    if (reconciled !== timer) changed = true;
    next[id] = reconciled;
  }

  return changed ? next : timers;
}

/** Count only timers that are actively counting down. */
export function countRunningTimers(timers: Record<string, TimerRecord>): number {
  let count = 0;
  for (const timer of Object.values(timers)) {
    if (timer.status === "running") count += 1;
  }
  return count;
}

/** Format seconds as a stable `m:ss` (or `h:mm:ss`) countdown string. */
export function formatCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      seconds,
    ).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Message keys the timer status line resolves against the catalog. */
export type TimerStatusKey = "complete" | "remaining" | "paused" | "ready";

/**
 * Resolves a timer-status message key (with an optional formatted `{time}`
 * value) to a localized string. The call shape matches next-intl's
 * `useTranslations` return value, so a component can pass
 * `useTranslations("cook.timer")` straight in while this module stays free of
 * React and i18n dependencies.
 */
export type TimerStatusTranslator = (
  key: TimerStatusKey,
  values?: { time: string },
) => string;

/** Human-readable status line shown under the big countdown. */
export function timerStatusText(
  timer: TimerRecord,
  t: TimerStatusTranslator,
): string {
  if (timer.status === "complete") return t("complete");
  if (timer.status === "running") {
    return t("remaining", { time: formatCountdown(timer.remaining) });
  }
  if (timer.status === "paused") {
    return t("paused", { time: formatCountdown(timer.remaining) });
  }
  return t("ready", { time: formatCountdown(timer.duration) });
}

const INTERACTIVE_SHORTCUT_SELECTOR =
  "a,button,input,textarea,select,video,audio,[role='button'],[role='slider'],[role='dialog'],[contenteditable='true']";

/**
 * True when a keyboard event originates from an interactive/media control that
 * owns keys like Space/Enter (e.g. a step video's play/pause), so global
 * step-navigation shortcuts should stand down.
 */
export function isInteractiveShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest(INTERACTIVE_SHORTCUT_SELECTOR) != null;
}

export type StepShortcut = "next" | "previous";

/**
 * Map a keydown to a step navigation intent, or null to ignore it. Returns null
 * whenever focus is on an interactive/media control so we never hijack Space
 * from a focused video, button, or text field.
 */
export function stepShortcutForKey(
  key: string,
  target: EventTarget | null,
): StepShortcut | null {
  if (isInteractiveShortcutTarget(target)) return null;
  if (key === "ArrowLeft") return "previous";
  if (key === "ArrowRight" || key === " " || key === "Spacebar") return "next";
  return null;
}

/** Serialize a cook session for localStorage, tagging it with a schema version. */
export function serializeCookState(state: StoredCookState): string {
  return JSON.stringify({ version: STORAGE_VERSION, ...state });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnitSystem(value: unknown): value is UnitSystem {
  return value === "original" || value === "us" || value === "metric";
}

function isTimerStatus(value: unknown): value is TimerStatus {
  return (
    value === "idle" ||
    value === "running" ||
    value === "paused" ||
    value === "complete"
  );
}

function parseTimer(value: unknown): TimerRecord | null {
  if (!isRecord(value)) return null;

  const { duration, remaining, status, endsAt } = value;
  if (typeof duration !== "number" || !Number.isFinite(duration)) return null;
  if (typeof remaining !== "number" || !Number.isFinite(remaining)) return null;
  if (!isTimerStatus(status)) return null;
  if (endsAt !== null && (typeof endsAt !== "number" || !Number.isFinite(endsAt))) {
    return null;
  }

  return {
    duration: Math.max(0, duration),
    remaining: Math.max(0, remaining),
    status,
    endsAt,
  };
}

function parseTimers(value: unknown): Record<string, TimerRecord> {
  if (!isRecord(value)) return {};

  const timers: Record<string, TimerRecord> = {};
  for (const [id, raw] of Object.entries(value)) {
    const timer = parseTimer(raw);
    if (timer) timers[id] = timer;
  }
  return timers;
}

function parseChecked(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Parse a persisted cook session, discarding anything malformed. Returns null
 * when there is nothing usable so callers can fall back to defaults.
 */
export function parseCookState(
  raw: string | null | undefined,
): StoredCookState | null {
  if (!raw) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;

  const stepIndex =
    typeof data.stepIndex === "number" && Number.isFinite(data.stepIndex)
      ? Math.max(0, Math.floor(data.stepIndex))
      : 0;
  const servings =
    typeof data.servings === "number" && Number.isFinite(data.servings)
      ? data.servings
      : null;
  const system = isUnitSystem(data.system) ? data.system : "original";
  const checked = parseChecked(data.checked);
  const timers = parseTimers(data.timers);

  return { stepIndex, servings, system, checked, timers };
}
