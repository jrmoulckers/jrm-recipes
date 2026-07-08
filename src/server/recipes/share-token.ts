import { createId } from "@paralleldrive/cuid2";

/**
 * High-entropy, URL-safe share token for an `unlisted` recipe (issue #204).
 *
 * Unlisted recipes are reachable only at `/r/<shareToken>`; the token — not the
 * guessable, title-derived slug — is the confidentiality secret. A cuid2 gives
 * ~120 bits of collision-resistant entropy in 24 URL-safe chars, and the
 * `recipes_share_token_uq` DB constraint is the uniqueness backstop.
 */
export function generateShareToken(): string {
  return createId();
}
