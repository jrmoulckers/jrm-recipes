import { describe, expect, it } from "vitest";

import {
  clampStepIndex,
  countRunningTimers,
  cookStorageKey,
  formatCountdown,
  isInteractiveShortcutTarget,
  makeTimer,
  parseCookState,
  reconcileTimer,
  reconcileTimers,
  serializeCookState,
  stepShortcutForKey,
  timerStatusText,
  type StoredCookState,
  type TimerRecord,
} from "./cook-state";

function timer(overrides: Partial<TimerRecord> = {}): TimerRecord {
  return { duration: 300, remaining: 300, status: "idle", endsAt: null, ...overrides };
}

describe("cookStorageKey", () => {
  it("namespaces per recipe id", () => {
    expect(cookStorageKey("abc")).toBe("heirloom:cook:v1:abc");
  });
});

describe("clampStepIndex", () => {
  it("keeps indices inside the step range", () => {
    expect(clampStepIndex(-3, 5)).toBe(0);
    expect(clampStepIndex(2, 5)).toBe(2);
    expect(clampStepIndex(9, 5)).toBe(4);
  });

  it("returns 0 when there are no steps", () => {
    expect(clampStepIndex(4, 0)).toBe(0);
  });
});

describe("makeTimer", () => {
  it("creates an idle timer from a duration", () => {
    expect(makeTimer(90)).toEqual({
      duration: 90,
      remaining: 90,
      status: "idle",
      endsAt: null,
    });
  });

  it("floors nullish or negative durations to zero", () => {
    expect(makeTimer(null).duration).toBe(0);
    expect(makeTimer(-10).duration).toBe(0);
  });
});

describe("countRunningTimers", () => {
  it("counts only running timers, not paused or complete (ck10)", () => {
    const timers: Record<string, TimerRecord> = {
      a: timer({ status: "running" }),
      b: timer({ status: "paused" }),
      c: timer({ status: "complete" }),
      d: timer({ status: "running" }),
      e: timer({ status: "idle" }),
    };
    expect(countRunningTimers(timers)).toBe(2);
  });

  it("is zero for an empty map", () => {
    expect(countRunningTimers({})).toBe(0);
  });
});

describe("reconcileTimer", () => {
  it("recomputes remaining for a running timer from its end time (ck05)", () => {
    const now = 10_000;
    const restored = reconcileTimer(
      timer({ status: "running", remaining: 300, endsAt: now + 120_000 }),
      now,
    );
    expect(restored.remaining).toBe(120);
    expect(restored.status).toBe("running");
  });

  it("completes a running timer whose end time has passed", () => {
    const now = 10_000;
    const restored = reconcileTimer(
      timer({ status: "running", remaining: 30, endsAt: now - 1_000 }),
      now,
    );
    expect(restored.status).toBe("complete");
    expect(restored.remaining).toBe(0);
    expect(restored.endsAt).toBeNull();
  });

  it("leaves paused, idle, and complete timers untouched", () => {
    const paused = timer({ status: "paused", remaining: 42, endsAt: null });
    const idle = timer({ status: "idle" });
    expect(reconcileTimer(paused, 10_000)).toBe(paused);
    expect(reconcileTimer(idle, 10_000)).toBe(idle);
  });
});

describe("reconcileTimers", () => {
  it("preserves object identity when nothing changes", () => {
    const timers = { a: timer({ status: "paused", remaining: 10 }) };
    expect(reconcileTimers(timers, 5_000)).toBe(timers);
  });

  it("updates running timers in place", () => {
    const now = 0;
    const timers = {
      a: timer({ status: "running", remaining: 300, endsAt: 60_000 }),
    };
    const next = reconcileTimers(timers, now);
    expect(next).not.toBe(timers);
    expect(next.a?.remaining).toBe(60);
  });
});

describe("formatCountdown (ck11)", () => {
  it("formats minutes and seconds with zero padding", () => {
    expect(formatCountdown(300)).toBe("5:00");
    expect(formatCountdown(90)).toBe("1:30");
    expect(formatCountdown(45)).toBe("0:45");
  });

  it("adds an hours segment when needed", () => {
    expect(formatCountdown(3661)).toBe("1:01:01");
  });

  it("never goes negative", () => {
    expect(formatCountdown(-5)).toBe("0:00");
  });

  it("rounds partial seconds up to match the live countdown", () => {
    expect(formatCountdown(89.2)).toBe("1:30");
  });
});

describe("timerStatusText", () => {
  it("describes each timer status", () => {
    expect(timerStatusText(timer({ status: "complete" }))).toBe("Timer complete");
    expect(timerStatusText(timer({ status: "running", remaining: 65 }))).toBe(
      "1:05 remaining",
    );
    expect(timerStatusText(timer({ status: "paused", remaining: 65 }))).toBe(
      "Paused with 1:05 remaining",
    );
    expect(timerStatusText(timer({ status: "idle", duration: 120 }))).toBe(
      "2:00 ready",
    );
  });
});

describe("stepShortcutForKey (ck04)", () => {
  it("maps arrow and space keys to navigation on a plain target", () => {
    const div = document.createElement("div");
    expect(stepShortcutForKey("ArrowLeft", div)).toBe("previous");
    expect(stepShortcutForKey("ArrowRight", div)).toBe("next");
    expect(stepShortcutForKey(" ", div)).toBe("next");
    expect(stepShortcutForKey("Spacebar", div)).toBe("next");
  });

  it("ignores unrelated keys", () => {
    const div = document.createElement("div");
    expect(stepShortcutForKey("Enter", div)).toBeNull();
    expect(stepShortcutForKey("a", div)).toBeNull();
  });

  it("stands down when a step video is focused so Space toggles play/pause", () => {
    const video = document.createElement("video");
    expect(stepShortcutForKey(" ", video)).toBeNull();
    expect(stepShortcutForKey("ArrowRight", video)).toBeNull();
  });

  it("stands down for buttons, inputs, and contenteditable regions", () => {
    const button = document.createElement("button");
    const input = document.createElement("input");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(stepShortcutForKey(" ", button)).toBeNull();
    expect(stepShortcutForKey(" ", input)).toBeNull();
    expect(stepShortcutForKey(" ", editable)).toBeNull();
  });

  it("stands down when the target is nested inside a control", () => {
    const button = document.createElement("button");
    const icon = document.createElement("span");
    button.appendChild(icon);
    expect(isInteractiveShortcutTarget(icon)).toBe(true);
    expect(stepShortcutForKey(" ", icon)).toBeNull();
  });

  it("treats a null target as non-interactive", () => {
    expect(isInteractiveShortcutTarget(null)).toBe(false);
    expect(stepShortcutForKey("ArrowRight", null)).toBe("next");
  });
});

describe("cook state serialization (ck05)", () => {
  const state: StoredCookState = {
    stepIndex: 3,
    servings: 6,
    system: "metric",
    checked: ["ing-1", "ing-2"],
    timers: {
      "step-1": timer({ status: "running", remaining: 120, endsAt: 999_000 }),
      "step-2": timer({ status: "paused", remaining: 45, endsAt: null }),
    },
  };

  it("round-trips through serialize/parse", () => {
    const parsed = parseCookState(serializeCookState(state));
    expect(parsed).toEqual(state);
  });

  it("returns null for empty or malformed input", () => {
    expect(parseCookState(null)).toBeNull();
    expect(parseCookState("")).toBeNull();
    expect(parseCookState("not json")).toBeNull();
    expect(parseCookState("[1,2,3]")).toBeNull();
  });

  it("fills defaults for missing or invalid fields", () => {
    const parsed = parseCookState(
      JSON.stringify({ stepIndex: "nope", system: "klingon", checked: "x" }),
    );
    expect(parsed).toEqual({
      stepIndex: 0,
      servings: null,
      system: "original",
      checked: [],
      timers: {},
    });
  });

  it("drops malformed timers and non-string checked ids", () => {
    const parsed = parseCookState(
      JSON.stringify({
        stepIndex: 1,
        servings: 4,
        system: "us",
        checked: ["ok", 5, null, "also-ok"],
        timers: {
          good: timer({ status: "running", remaining: 10, endsAt: 1_000 }),
          bad: { duration: "x", status: "running" },
        },
      }),
    );
    expect(parsed?.checked).toEqual(["ok", "also-ok"]);
    expect(Object.keys(parsed?.timers ?? {})).toEqual(["good"]);
  });
});
