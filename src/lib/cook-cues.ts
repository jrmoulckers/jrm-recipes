import { type UnitSystem } from "~/lib/cook-state";

/**
 * Precision-cooking cues derived from a recipe's steps — pure and framework-free
 * so both Cook Mode and tests can share the exact same logic.
 *
 * Two concerns live here:
 *  - Target-temperature formatting that honours the cook's unit system (#417).
 *  - Early preheat / make-ahead reminders so the oven or prep is ready in time
 *    (#424): we scan step text for a preheat instruction and surface it up front
 *    rather than letting the cook discover it only once they reach that step.
 */

/** A step, reduced to just the fields the cue helpers need. */
export type CueStep = {
  position: number;
  instruction: string;
  targetTempC?: number | null;
};

/** Convert Celsius to Fahrenheit, rounded to the nearest whole degree. */
export function celsiusToFahrenheit(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}

/**
 * Format a target temperature for display, honouring the cook's unit system.
 * US cooks see °F; everyone else sees °C. Non-finite input yields null so the
 * caller can hide the badge cleanly.
 */
export function formatStepTemperature(
  tempC: number | null | undefined,
  system: UnitSystem,
): string | null {
  if (tempC == null || !Number.isFinite(tempC)) return null;
  if (system === "us") {
    return `${celsiusToFahrenheit(tempC)}°F`;
  }
  return `${Math.round(tempC)}°C`;
}

const PREHEAT_PATTERN =
  /\b(pre-?heat|heat (?:the |your )?oven|warm (?:the |your )?oven|oven to)\b/i;

/** Whether a step's instruction reads as a preheat / oven-warming instruction. */
export function isPreheatStep(instruction: string): boolean {
  return PREHEAT_PATTERN.test(instruction);
}

export type PreheatCue = {
  /** 1-based position of the preheat step. */
  stepNumber: number;
  /** Target temperature in °C, when the step carries one. */
  targetTempC: number | null;
};

/**
 * Find the earliest preheat step that a cook would benefit from starting ahead
 * of time — i.e. one that isn't already the very first step. Returns null when
 * there's nothing to pull forward (no preheat step, or it's already step 1).
 */
export function findPreheatCue(steps: readonly CueStep[]): PreheatCue | null {
  const sorted = [...steps].sort((a, b) => a.position - b.position);
  const firstPosition = sorted[0]?.position ?? null;
  for (const step of sorted) {
    if (isPreheatStep(step.instruction)) {
      // If the very first thing you do is preheat, no reminder is needed.
      if (step.position === firstPosition) return null;
      return { stepNumber: step.position, targetTempC: step.targetTempC ?? null };
    }
  }
  return null;
}
