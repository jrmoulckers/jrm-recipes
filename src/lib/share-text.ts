import { brand } from "~/config/brand";

/**
 * Default share message that rides along with a shared recipe link (#143).
 *
 * Sharing is the "pass it down" loop, so the words matter: a warm, familial
 * one-liner naming the recipe (and the cook, when known) beats a naked URL in a
 * family chat. Kept short for messaging apps, with no hashtags or promo fluff —
 * see the share-text pattern in docs/voice-and-tone.md.
 *
 * The returned `text` is the message WITHOUT the URL (for `navigator.share`,
 * which takes `url` separately). Use {@link shareMessageWithUrl} for the
 * clipboard fallback, where the link must be part of the copied text.
 */
export function shareText({
  title,
  author,
}: {
  title: string;
  author?: string | null;
}): string {
  const cook = author?.trim();
  if (cook) {
    return `${title}, from ${cook}'s kitchen. Made with ${brand.name}.`;
  }
  return `${title} — a family recipe on ${brand.name}.`;
}

/** The share message with the link appended, for the clipboard fallback. */
export function shareMessageWithUrl(
  args: { title: string; author?: string | null },
  url: string,
): string {
  return `${shareText(args)} ${url}`;
}
