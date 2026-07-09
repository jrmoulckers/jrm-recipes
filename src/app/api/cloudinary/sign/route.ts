import { v2 as cloudinary } from "cloudinary";
import { z } from "zod";

import { env } from "~/env";
import { requireUser } from "~/server/auth";
import { getLimitStatus } from "~/server/billing/entitlements";
import { checkRateLimit } from "~/server/rate-limit";
import { type User } from "~/server/db/schema";

// The Cloudinary SDK relies on Node crypto for signing, so keep this off the
// edge runtime.
export const runtime = "nodejs";

/**
 * Root Cloudinary folder every Heirloom upload must live under. The route
 * refuses to sign uploads targeting anything outside this namespace so a caller
 * can't drop assets into (or overwrite assets in) arbitrary folders.
 */
const ROOT_FOLDER = "heirloom";

/**
 * Upper bound on the signing request body (issue #222). The allowlisted params
 * are a few short strings and a timestamp, so a few KB is generous; anything
 * larger is refused before it is buffered into memory.
 */
const MAX_SIGN_BODY_BYTES = 4_096;

/**
 * Matches `heirloom`, `heirloom/cooks`, `heirloom/a/b`, … but never a foreign
 * root, a leading/trailing slash, an empty segment, or path traversal (`..`),
 * because `.` is not part of the permitted per-segment character set.
 */
const folderSchema = z
  .string()
  .regex(
    new RegExp(`^${ROOT_FOLDER}(?:/[a-zA-Z0-9_-]+)*$`),
    "folder must live under the heirloom namespace",
  );

/**
 * How stale a client `timestamp` may be before we refuse to sign it. The upload
 * widget generates the timestamp immediately before requesting a signature, so
 * anything old is a replay attempt — bounding it limits signature reuse.
 */
const MAX_TIMESTAMP_AGE_SECONDS = 60 * 10;
/** Small allowance for client/server clock skew. */
const MAX_TIMESTAMP_SKEW_SECONDS = 60;

/**
 * Strict allowlist of the *only* parameters we will ever sign. `.strict()`
 * rejects any unexpected key — `public_id`, `notification_url`, `callback`,
 * `eager`, `transformation`, `upload_preset`, … — with a 400 so this endpoint
 * can't be abused as a general-purpose Cloudinary signing oracle.
 */
const paramsToSignSchema = z
  .object({
    timestamp: z
      .coerce.number()
      .int()
      .positive()
      .refine((ts) => {
        const now = Math.floor(Date.now() / 1000);
        return (
          ts <= now + MAX_TIMESTAMP_SKEW_SECONDS &&
          ts >= now - MAX_TIMESTAMP_AGE_SECONDS
        );
      }, "timestamp is missing or stale"),
    // Required: a signature must never be issued without a heirloom-namespaced
    // folder, so every signed upload stays inside our account's namespace.
    folder: folderSchema,
    source: z
      .string()
      .regex(/^[a-z][a-z_]{0,31}$/)
      .optional(),
  })
  .strict();

const requestSchema = z.object({
  paramsToSign: paramsToSignSchema,
});

/**
 * Same-site guard: the request `Origin` must match either the request's own
 * host or the configured canonical app URL. A missing or foreign `Origin` is
 * rejected as CSRF defense-in-depth — browsers always attach `Origin` to the
 * cross-site-capable `POST` the upload widget makes.
 */
function hasTrustedOrigin(request: Request): boolean {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return false;

  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }

  const host = request.headers.get("host");
  if (host && origin.host === host) return true;

  if (env.NEXT_PUBLIC_APP_URL) {
    try {
      if (origin.origin === new URL(env.NEXT_PUBLIC_APP_URL).origin) {
        return true;
      }
    } catch {
      // Misconfigured app URL — fall through and reject.
    }
  }

  return false;
}

/**
 * Signs Cloudinary upload-widget parameters server-side so the browser can
 * upload directly without ever seeing the API secret.
 *
 * Hardened per issue #173: it requires an authenticated user, verifies the
 * request originates from our own site, and signs *only* an allowlisted,
 * server-validated set of parameters (never `public_id`, `notification_url`,
 * transformations, or arbitrary folders). Returns 501 when Cloudinary isn't
 * configured, which is the signal the editor uses to fall back to plain
 * image-URL entry.
 */
export async function POST(request: Request) {
  // 1. CSRF defense-in-depth: reject foreign/missing origins before anything else.
  if (!hasTrustedOrigin(request)) {
    return Response.json({ error: "Untrusted origin." }, { status: 403 });
  }

  // 2. Never act as a signing oracle for anonymous callers.
  let user: User;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: "Sign in to upload." }, { status: 401 });
  }

  // 2a. Throttle signature issuance per user to blunt Cloudinary quota/cost
  //     abuse (issue #199). Friendly 429 with Retry-After, no internals leaked.
  const limit = checkRateLimit("sign", user.id);
  if (!limit.ok) {
    return Response.json(
      { error: "Too many upload requests. Please slow down." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const cloudName = env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return Response.json(
      { error: "Cloudinary is not configured." },
      { status: 501 },
    );
  }

  // 2b. Soft storage cap (issue #318): refuse to sign *new* uploads once the
  //     account is at/over its plan's storage allowance. Existing assets are
  //     never touched; an unconfigured DB or unlimited plan resolves to `ok`.
  const storage = await getLimitStatus(user, "maxStorageMb", "storage_mb");
  if (storage.state === "blocked") {
    return Response.json(
      {
        error:
          "You've reached your plan's photo storage limit. Upgrade to Family for more space — your existing photos stay safe and accessible.",
        upgrade: true,
      },
      { status: 402 },
    );
  }

  // 2c. Bound the request body (issue #222). The signed payload is a handful of
  //     short fields; anything large is abuse, so refuse to buffer it. Guard on
  //     the declared length up front and hard-cap the bytes we actually read.
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SIGN_BODY_BYTES) {
    return Response.json({ error: "Request body too large." }, { status: 413 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (raw.length > MAX_SIGN_BODY_BYTES) {
    return Response.json({ error: "Request body too large." }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // 3. Strictly validate + allowlist the params. Anything unexpected or
  //    dangerous (foreign folder, stale timestamp, disallowed key) is rejected
  //    here, so only a vetted set is ever handed to the signer.
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Unsupported signing parameters." },
      { status: 400 },
    );
  }

  const signature = cloudinary.utils.api_sign_request(
    parsed.data.paramsToSign,
    apiSecret,
  );

  return Response.json({ signature });
}
