/**
 * Helpers for the PWA share target (see `share_target` in app/manifest.ts and
 * the `/import` route). Kept free of any Next/server imports so the URL-picking
 * logic stays easy to unit-test.
 */

function toHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    // Not a parseable URL — ignore.
  }
  return undefined;
}

/**
 * Pull the first usable http(s) URL out of a Web Share payload. Browsers place
 * the link in different fields depending on what was shared (a page → `url`, a
 * highlighted link → `text`, occasionally `title`), so we check each candidate
 * in order and also dig a bare URL out of free-form text. Only http/https is
 * accepted, so `javascript:`/`data:` URIs can't be smuggled into the importer.
 */
export function pickSharedUrl(
  ...candidates: (string | null | undefined)[]
): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;

    const direct = toHttpUrl(trimmed);
    if (direct) return direct;

    const match = /https?:\/\/\S+/i.exec(trimmed);
    const found = match?.[0];
    if (found) {
      const normalized = toHttpUrl(found);
      if (normalized) return normalized;
    }
  }
  return undefined;
}
