/**
 * Pure, framework-agnostic helpers for the lightweight emoji reactions (#342).
 *
 * The emoji set is fixed and family-appropriate. Reactions are stored by a
 * semantic key (`love`, `yum`, …) rather than the glyph so the rendered emoji
 * can change without a data migration. The toggle reducer here drives the
 * optimistic UI and is unit-tested independently of the server.
 */

export type ReactionEmojiKey =
  | "love"
  | "yum"
  | "clap"
  | "wow"
  | "fire"
  | "party";

/** The fixed display order + glyph + accessible label for each reaction. */
export const REACTION_EMOJI: {
  key: ReactionEmojiKey;
  glyph: string;
  label: string;
}[] = [
  { key: "love", glyph: "❤️", label: "Love" },
  { key: "yum", glyph: "😋", label: "Yum" },
  { key: "clap", glyph: "👏", label: "Applause" },
  { key: "wow", glyph: "😮", label: "Wow" },
  { key: "fire", glyph: "🔥", label: "Fire" },
  { key: "party", glyph: "🎉", label: "Celebrate" },
];

const EMOJI_BY_KEY = new Map(REACTION_EMOJI.map((e) => [e.key, e]));

/** Glyph for a reaction key, falling back to a neutral dot if unknown. */
export function reactionGlyph(key: ReactionEmojiKey): string {
  return EMOJI_BY_KEY.get(key)?.glyph ?? "•";
}

/** Accessible label for a reaction key. */
export function reactionLabel(key: ReactionEmojiKey): string {
  return EMOJI_BY_KEY.get(key)?.label ?? key;
}

/** Per-emoji tally for one target: how many reacted and whether the viewer did. */
export type ReactionCount = {
  emoji: ReactionEmojiKey;
  count: number;
  reacted: boolean;
};

/**
 * Optimistically toggle the viewer's reaction for `emoji` against a target's
 * current counts. Adding when absent increments and marks reacted; toggling an
 * existing reaction decrements and unmarks. Zero-count entries are dropped so
 * the bar only shows emoji someone actually used. Pure: returns a new array.
 */
export function toggleReactionState(
  counts: ReactionCount[],
  emoji: ReactionEmojiKey,
): ReactionCount[] {
  const existing = counts.find((c) => c.emoji === emoji);
  let next: ReactionCount[];
  if (!existing) {
    next = [...counts, { emoji, count: 1, reacted: true }];
  } else {
    next = counts.map((c) =>
      c.emoji === emoji
        ? {
            emoji,
            count: c.reacted ? c.count - 1 : c.count + 1,
            reacted: !c.reacted,
          }
        : c,
    );
  }
  return next
    .filter((c) => c.count > 0)
    .sort(
      (a, b) =>
        REACTION_EMOJI.findIndex((e) => e.key === a.emoji) -
        REACTION_EMOJI.findIndex((e) => e.key === b.emoji),
    );
}

/** True if the viewer currently reacts with `emoji` in this tally. */
export function hasReacted(
  counts: ReactionCount[],
  emoji: ReactionEmojiKey,
): boolean {
  return counts.some((c) => c.emoji === emoji && c.reacted && c.count > 0);
}
