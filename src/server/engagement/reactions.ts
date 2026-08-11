import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import { db, isDbConfigured } from '~/server/db';
import { DomainError } from '~/server/errors';
import { canViewRecipe } from '~/server/recipes/queries';
import { notify } from '~/server/notifications/notify';
import { comments, cookLogEntries, reactions, reviews, type User } from '~/server/db/schema';
import type { ReactionCount, ReactionEmojiKey } from '~/lib/reactions';
import { REACTION_EMOJI } from '~/lib/reactions';

export type ReactionTargetType = 'comment' | 'review' | 'cook_log';

type RecipeAccessRow = {
  id: string;
  title: string;
  authorId: string;
  visibility: string;
  groupId: string | null;
};

/** The reacted-to content plus enough context to gate access and notify. */
type ReactionTargetInfo = {
  /** The user who owns the reacted-to comment / review / cook-log post. */
  ownerId: string;
  recipe: RecipeAccessRow;
};

/** Human-readable label for the reacted-to content, used in the inbox copy. */
const TARGET_LABEL: Record<ReactionTargetType, string> = {
  comment: 'comment',
  review: 'review',
  cook_log: 'cook',
};

type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Resolve the reacted-to content's owner and its recipe (for access control and
 * the reaction notification's deep link).
 */
async function loadReactionTarget(
  exec: Exec,
  targetType: ReactionTargetType,
  targetId: string,
): Promise<ReactionTargetInfo | null> {
  const recipeColumns = {
    id: true,
    title: true,
    authorId: true,
    visibility: true,
    groupId: true,
  } as const;

  if (targetType === 'comment') {
    const row = await exec.query.comments.findFirst({
      where: eq(comments.id, targetId),
      columns: { id: true, userId: true },
      with: { recipe: { columns: recipeColumns } },
    });
    return row?.recipe ? { ownerId: row.userId, recipe: row.recipe } : null;
  }
  if (targetType === 'review') {
    const row = await exec.query.reviews.findFirst({
      where: eq(reviews.id, targetId),
      columns: { id: true, userId: true },
      with: { recipe: { columns: recipeColumns } },
    });
    return row?.recipe ? { ownerId: row.userId, recipe: row.recipe } : null;
  }
  const row = await exec.query.cookLogEntries.findFirst({
    where: eq(cookLogEntries.id, targetId),
    columns: { id: true, userId: true },
    with: { recipe: { columns: recipeColumns } },
  });
  return row?.recipe ? { ownerId: row.userId, recipe: row.recipe } : null;
}

/**
 * Toggle the viewer's reaction on a comment / review / cook-log post (#342).
 * One row per (target, user, emoji): a first tap inserts, a second removes.
 * Access is gated by the target's recipe visibility. Returns the resulting
 * state so the optimistic client can reconcile.
 */
export async function toggleReaction(
  input: {
    targetType: ReactionTargetType;
    targetId: string;
    emoji: ReactionEmojiKey;
  },
  user: User,
): Promise<{ reacted: boolean }> {
  return db.transaction(async (tx) => {
    const target = await loadReactionTarget(tx, input.targetType, input.targetId);
    if (!target) throw new DomainError('NOT_FOUND');
    if (!(await canViewRecipe(target.recipe, user))) throw new DomainError('FORBIDDEN');

    const existing = await tx.query.reactions.findFirst({
      where: and(
        eq(reactions.targetType, input.targetType),
        eq(reactions.targetId, input.targetId),
        eq(reactions.userId, user.id),
        eq(reactions.emoji, input.emoji),
      ),
      columns: { id: true },
    });

    if (existing) {
      await tx.delete(reactions).where(eq(reactions.id, existing.id));
      return { reacted: false };
    }

    const inserted = await tx
      .insert(reactions)
      .values({
        targetType: input.targetType,
        targetId: input.targetId,
        userId: user.id,
        emoji: input.emoji,
      })
      .onConflictDoNothing()
      .returning({ id: reactions.id });

    // Notify the content owner only on a genuine add (#348), not a toggle-off
    // and not a race-losing conflict. Skip self-reactions before writing so we
    // don't spend an insert notify() would only no-op (its self-guard still
    // protects any path that reaches it).
    if (inserted.length > 0 && target.ownerId !== user.id) {
      await notify(tx, {
        recipientId: target.ownerId,
        actorId: user.id,
        type: 'reaction',
        recipeId: target.recipe.id,
        entityId: input.targetId,
        context: TARGET_LABEL[input.targetType],
      });
    }
    return { reacted: true };
  });
}

/** Per-target reaction tally plus who reacted (for the hover/long-press list). */
export type TargetReactions = {
  counts: ReactionCount[];
  /** emoji key → display names of members who reacted, for the reveal. */
  reactors: Partial<Record<ReactionEmojiKey, string[]>>;
};

const EMOJI_ORDER = new Map(REACTION_EMOJI.map((e, i) => [e.key, i]));

function emptyTargetReactions(): TargetReactions {
  return { counts: [], reactors: {} };
}

/**
 * Load reaction tallies for many targets of one type in a single query (#342),
 * so a comment thread or review list can render every bar without an N+1.
 * `viewerId` marks which emoji the viewer has reacted with.
 */
export async function getReactionsForTargets(
  targetType: ReactionTargetType,
  targetIds: string[],
  viewerId: string | null,
  hiddenAuthorIds = new Set<string>(),
): Promise<Map<string, TargetReactions>> {
  const result = new Map<string, TargetReactions>();
  if (!isDbConfigured() || targetIds.length === 0) return result;

  const rows = await db.query.reactions.findMany({
    where: and(eq(reactions.targetType, targetType), inArray(reactions.targetId, targetIds)),
    with: {
      user: { columns: { id: true, name: true, handle: true } },
    },
  });

  // targetId → emoji → { count, reacted, names }
  const acc = new Map<
    string,
    Map<ReactionEmojiKey, { count: number; reacted: boolean; names: string[] }>
  >();

  for (const row of rows) {
    // Block filtering (#355): a blocked member's reaction must not inflate the
    // count or surface their name in the reactors reveal.
    if (hiddenAuthorIds.has(row.userId)) continue;
    const emoji = row.emoji;
    let byEmoji = acc.get(row.targetId);
    if (!byEmoji) {
      byEmoji = new Map();
      acc.set(row.targetId, byEmoji);
    }
    const entry = byEmoji.get(emoji) ?? {
      count: 0,
      reacted: false,
      names: [],
    };
    entry.count += 1;
    if (viewerId && row.userId === viewerId) entry.reacted = true;
    const name = row.user?.name ?? row.user?.handle;
    if (name) entry.names.push(name);
    byEmoji.set(emoji, entry);
  }

  for (const [targetId, byEmoji] of acc) {
    const counts: ReactionCount[] = [];
    const reactors: Partial<Record<ReactionEmojiKey, string[]>> = {};
    for (const [emoji, entry] of byEmoji) {
      counts.push({ emoji, count: entry.count, reacted: entry.reacted });
      reactors[emoji] = entry.names;
    }
    counts.sort((a, b) => (EMOJI_ORDER.get(a.emoji) ?? 0) - (EMOJI_ORDER.get(b.emoji) ?? 0));
    result.set(targetId, { counts, reactors });
  }

  return result;
}

/** Single-target convenience wrapper around {@link getReactionsForTargets}. */
export async function getReactions(
  targetType: ReactionTargetType,
  targetId: string,
  viewerId: string | null,
): Promise<TargetReactions> {
  const map = await getReactionsForTargets(targetType, [targetId], viewerId);
  return map.get(targetId) ?? emptyTargetReactions();
}
