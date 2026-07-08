/**
 * Shared @mention parsing/serialization (issue #340) so comments and reviews
 * treat mentions identically. Pure and dependency-free: the composer, the
 * renderer, the server (for notifications), and unit tests all share this logic.
 *
 * A mention is an `@` immediately followed by a handle. Handles are the same
 * charset used for cook profiles (`/cooks/[handle]`): letters, digits,
 * underscore, hyphen, and dot, 1–40 chars. Matching is case-insensitive and a
 * mention only "resolves" when it maps to a real, known member — unknown handles
 * are left as plain text.
 */

export type MentionCandidate = {
  id: string;
  name: string | null;
  handle: string | null;
  avatarUrl: string | null;
};

export type MentionSegment =
  | { type: "text"; text: string }
  | { type: "mention"; raw: string; handle: string; user: MentionCandidate };

/** Handle charset, shared by extraction and the composer's active-token probe. */
const HANDLE_CHARS = "a-zA-Z0-9_.-";
const MENTION_RE = new RegExp(`@([${HANDLE_CHARS}]{1,40})`, "g");

/** Normalize a handle for comparison (case-insensitive, no leading @). */
export function normalizeHandle(handle: string): string {
  return handle.replace(/^@/, "").toLowerCase();
}

/**
 * Extract the unique handles mentioned in `body` (lowercased, no `@`). Order is
 * preserved by first appearance so callers can notify deterministically.
 */
export function extractMentionHandles(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of body.matchAll(MENTION_RE)) {
    const handle = normalizeHandle(match[1]!);
    if (!seen.has(handle)) {
      seen.add(handle);
      out.push(handle);
    }
  }
  return out;
}

/** Index candidates by normalized handle, ignoring any without a handle. */
export function candidatesByHandle(
  candidates: MentionCandidate[],
): Map<string, MentionCandidate> {
  const map = new Map<string, MentionCandidate>();
  for (const c of candidates) {
    if (c.handle) map.set(normalizeHandle(c.handle), c);
  }
  return map;
}

/**
 * Resolve mentioned handles in `body` to real candidates. Returns each matched
 * candidate once, in first-mention order. Unknown handles are dropped (they are
 * not "mentions" for notification purposes).
 */
export function resolveMentions(
  body: string,
  candidates: MentionCandidate[],
): MentionCandidate[] {
  const byHandle = candidatesByHandle(candidates);
  const out: MentionCandidate[] = [];
  const seen = new Set<string>();
  for (const handle of extractMentionHandles(body)) {
    const user = byHandle.get(handle);
    if (user && !seen.has(user.id)) {
      seen.add(user.id);
      out.push(user);
    }
  }
  return out;
}

/**
 * Split `body` into text + mention segments for rendering. Only handles that
 * resolve to a known candidate become `mention` segments; everything else
 * (including unknown `@handles`) stays as `text` so it renders verbatim.
 */
export function splitMentions(
  body: string,
  candidates: MentionCandidate[],
): MentionSegment[] {
  const byHandle = candidatesByHandle(candidates);
  const segments: MentionSegment[] = [];
  let lastIndex = 0;

  for (const match of body.matchAll(MENTION_RE)) {
    const raw = match[0];
    const handle = normalizeHandle(match[1]!);
    const user = byHandle.get(handle);
    if (!user) continue; // unknown handle → leave in the surrounding text run

    const start = match.index ?? 0;
    if (start > lastIndex) {
      segments.push({ type: "text", text: body.slice(lastIndex, start) });
    }
    segments.push({ type: "mention", raw, handle, user });
    lastIndex = start + raw.length;
  }

  if (lastIndex < body.length) {
    segments.push({ type: "text", text: body.slice(lastIndex) });
  }
  return segments;
}

/**
 * Given the text before the caret, return the handle fragment of an in-progress
 * `@mention` (e.g. `"…hi @gr"` → `"gr"`), or null if the caret isn't inside a
 * mention token. Powers the composer autocomplete.
 */
export function activeMentionQuery(textBeforeCaret: string): string | null {
  const match = /(?:^|\s)@([a-zA-Z0-9_.-]{0,40})$/.exec(textBeforeCaret);
  return match ? match[1]!.toLowerCase() : null;
}
