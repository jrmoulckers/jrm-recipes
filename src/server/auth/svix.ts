import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/** The three Svix headers that carry a webhook's id, timestamp, and signature. */
export type SvixHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

/** Reject timestamps more than five minutes off to blunt replay attacks. */
const TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a Svix-signed webhook (as used by Clerk) without pulling in the `svix`
 * SDK — a dependency-free HMAC check, mirroring the self-contained approach used
 * elsewhere in this codebase (issue #217).
 *
 * The signed content is `${id}.${timestamp}.${payload}`, HMAC-SHA256'd with the
 * base64-decoded secret (the part after the `whsec_` prefix) and base64-encoded.
 * The `svix-signature` header is a space-separated list of `v1,<sig>` entries;
 * any timing-safe match passes. The timestamp is bounded to a ±5-minute window
 * so a captured request can't be replayed indefinitely.
 */
export function verifySvixSignature(
  secret: string,
  headers: SvixHeaders,
  payload: string,
  now: number = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(now / 1000 - ts) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${payload}`;
  const expected = createHmac("sha256", key)
    .update(signedContent)
    .digest("base64");

  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    if (timingSafeEqualString(value, expected)) return true;
  }
  return false;
}

/** Constant-time string compare that never throws on length mismatch. */
function timingSafeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
