/**
 * Prep-ahead heuristic (issue #388). A planned dinner falls apart at 6pm for
 * the same reason every time: the chicken is still a brick, or the meat needed
 * to marinate hours ago. This scans tomorrow's planned recipes' step and
 * ingredient text for language that means "start this the night before" —
 * defrost/thaw, marinate, soak, overnight, chill, bring to room temp — so the
 * planner can nudge you *tonight*.
 *
 * Deliberately a pure, dependency-free heuristic: no scheduler, no cron, no DB.
 * That keeps it unit-testable and cheap to run on every plan render.
 */

export type PrepAheadCueKind =
  | "defrost"
  | "marinate"
  | "soak"
  | "overnight"
  | "chill"
  | "room-temp";

export type PrepAheadCue = {
  kind: PrepAheadCueKind;
  /** Short imperative label, e.g. "defrost" — safe to join into a sentence. */
  label: string;
};

type CuePattern = {
  kind: PrepAheadCueKind;
  label: string;
  pattern: RegExp;
};

/**
 * Ordered so the rendered summary reads naturally (defrost → marinate → soak →
 * overnight → chill → room temp). Each pattern is word-boundaried so "chill"
 * never fires on "chilli" and "soak" never fires on a brand name.
 */
const CUE_PATTERNS: CuePattern[] = [
  {
    kind: "defrost",
    label: "defrost",
    pattern: /\b(?:defrost|thaw)(?:s|ed|ing)?\b/i,
  },
  {
    kind: "marinate",
    label: "marinate",
    pattern: /\bmarin(?:ate|ated|ating|ade)\b/i,
  },
  {
    kind: "soak",
    label: "soak",
    pattern: /\bsoak(?:s|ed|ing)?\b/i,
  },
  {
    kind: "overnight",
    label: "start it the night before",
    pattern: /\b(?:overnight|night before|day before)\b/i,
  },
  {
    kind: "chill",
    label: "chill",
    pattern: /\b(?:chill|refrigerate)(?:s|ed|ing)?\b/i,
  },
  {
    kind: "room-temp",
    label: "bring to room temperature",
    pattern: /\b(?:room temp(?:erature)?|come to room)\b/i,
  },
];

/** Detect the distinct prep-ahead cues present across a recipe's text blocks. */
export function detectPrepAheadCues(texts: readonly string[]): PrepAheadCue[] {
  const haystack = texts
    .filter((t): t is string => Boolean(t))
    .join("\n");
  if (!haystack.trim()) return [];
  const cues: PrepAheadCue[] = [];
  for (const { kind, label, pattern } of CUE_PATTERNS) {
    if (pattern.test(haystack)) cues.push({ kind, label });
  }
  return cues;
}

/**
 * Join cue labels into a human phrase: ["defrost"] → "defrost";
 * ["defrost","marinate"] → "defrost & marinate";
 * ["defrost","marinate","chill"] → "defrost, marinate & chill".
 */
export function summarizePrepCues(cues: readonly PrepAheadCue[]): string {
  const labels = cues.map((c) => c.label);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(", ")} & ${labels[labels.length - 1]!}`;
}

/** A planned recipe to inspect — the text blocks are its steps + ingredients. */
export type PlannedPrepRecipe = {
  slug: string;
  title: string;
  /** Label for the day this meal is planned, e.g. "Thursday". */
  dayLabel: string;
  /** Free text to scan: step instructions plus ingredient items/notes. */
  texts: string[];
};

export type PrepAheadReminder = {
  slug: string;
  title: string;
  dayLabel: string;
  cues: PrepAheadCue[];
  /** Ready-to-render phrase, e.g. "defrost & marinate". */
  summary: string;
};

/**
 * Turn tomorrow's planned recipes into prep-ahead reminders, dropping any with
 * no cues. Returns an empty array when nothing needs a head start, so callers
 * can render nothing without special-casing.
 */
export function buildPrepAheadReminders(
  recipes: readonly PlannedPrepRecipe[],
): PrepAheadReminder[] {
  const reminders: PrepAheadReminder[] = [];
  for (const recipe of recipes) {
    const cues = detectPrepAheadCues(recipe.texts);
    if (cues.length === 0) continue;
    reminders.push({
      slug: recipe.slug,
      title: recipe.title,
      dayLabel: recipe.dayLabel,
      cues,
      summary: summarizePrepCues(cues),
    });
  }
  return reminders;
}
