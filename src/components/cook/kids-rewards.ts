/**
 * On-device "chef badges" rewards for Kids mode (issue #413). Entirely
 * client-side and offline-friendly: earned badges (and a lifetime cook counter)
 * live in localStorage, so a kid keeps a collection they can revisit — no
 * database or network involved.
 *
 * Awarding is idempotent by badge id: finishing the same recipe again never
 * duplicates its sticker, and milestone badges are granted once. All storage
 * access is defensively guarded so a private-mode / disabled-storage browser
 * simply earns nothing rather than throwing mid-celebration.
 */
export type KidBadge = {
  /** Stable unique id used for idempotent awarding. */
  id: string;
  /** Kid-readable name, e.g. "I made Banana Bread". */
  name: string;
  /** Sticker glyph. */
  emoji: string;
  /** When it was first earned (epoch ms). */
  earnedAt: number;
};

const BADGES_KEY = "heirloom-kids-badges";
const COUNT_KEY = "heirloom-kids-cook-count";

const STICKER_EMOJI = [
  "🍪",
  "🧁",
  "🥞",
  "🍕",
  "🌮",
  "🥗",
  "🍜",
  "🍰",
  "🥧",
  "🍞",
  "🍳",
  "🥪",
];

const MILESTONES: ReadonlyArray<{ count: number; name: string; emoji: string }> = [
  { count: 3, name: "3 Recipes Cooked!", emoji: "🥉" },
  { count: 5, name: "5 Recipes Cooked!", emoji: "🥈" },
  { count: 10, name: "10 Recipes Cooked!", emoji: "🥇" },
];

function safeLocal(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function isBadge(value: unknown): value is KidBadge {
  if (!value || typeof value !== "object") return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b.id === "string" &&
    typeof b.name === "string" &&
    typeof b.emoji === "string" &&
    typeof b.earnedAt === "number"
  );
}

/** All earned badges, most-recent last. Never throws. */
export function readBadges(): KidBadge[] {
  const ls = safeLocal();
  if (!ls) return [];
  try {
    const raw = ls.getItem(BADGES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBadge);
  } catch {
    return [];
  }
}

function readCount(ls: Storage | null): number {
  if (!ls) return 0;
  try {
    const raw = ls.getItem(COUNT_KEY);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function stickerEmoji(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return STICKER_EMOJI[hash % STICKER_EMOJI.length] ?? "🍽️";
}

/**
 * Record a completed cook and return the full badge collection plus any badges
 * newly earned this time (for the celebratory reveal). Idempotent per badge id.
 */
export function awardForCompletion(
  recipeTitle: string,
  recipeSlug: string,
  now: number = Date.now(),
): { badges: KidBadge[]; newlyEarned: KidBadge[] } {
  const existing = readBadges();
  const owned = new Set(existing.map((b) => b.id));
  const ls = safeLocal();

  const priorCount = readCount(ls);
  const newCount = priorCount + 1;

  const candidates: KidBadge[] = [];
  if (priorCount === 0) {
    candidates.push({
      id: "first-cook",
      name: "First Cook!",
      emoji: "⭐",
      earnedAt: now,
    });
  }
  candidates.push({
    id: `recipe:${recipeSlug}`,
    name: `I made ${recipeTitle}`,
    emoji: stickerEmoji(recipeSlug),
    earnedAt: now,
  });
  for (const milestone of MILESTONES) {
    if (newCount >= milestone.count) {
      candidates.push({
        id: `cook-${milestone.count}`,
        name: milestone.name,
        emoji: milestone.emoji,
        earnedAt: now,
      });
    }
  }

  const newlyEarned = candidates.filter((b) => !owned.has(b.id));
  const badges = [...existing, ...newlyEarned];

  if (ls) {
    try {
      ls.setItem(BADGES_KEY, JSON.stringify(badges));
      ls.setItem(COUNT_KEY, String(newCount));
    } catch {
      /* storage full / unavailable — badges just won't persist this time */
    }
  }

  return { badges, newlyEarned };
}
