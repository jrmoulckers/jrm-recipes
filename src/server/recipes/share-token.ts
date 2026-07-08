/**
 * High-entropy, URL-safe share token for an `unlisted` recipe (issue #204).
 *
 * Unlisted recipes are reachable only at `/r/<shareToken>`; the token — not the
 * guessable, title-derived slug — is the *entire* confidentiality boundary, so
 * it must come from a cryptographically secure RNG. We use the Web Crypto API
 * (available on Node ≥ 18 and the Edge runtime) to draw 32 random bytes and
 * encode them base64url, yielding ~256 bits of entropy in 43 URL-safe chars.
 * The `recipes_share_token_uq` DB constraint is the uniqueness backstop.
 *
 * NB: deliberately NOT cuid2 — its default factory is seeded from `Math.random`
 * (its own docs warn it is not suitable for security tokens).
 */
export function generateShareToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
