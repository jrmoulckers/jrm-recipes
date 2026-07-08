import { v2 as cloudinary } from "cloudinary";
import { z } from "zod";

import { env } from "~/env";
import { requireUser } from "~/server/auth";

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
    folder: folderSchema.optional(),
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
  try {
    await requireUser();
  } catch {
    return Response.json({ error: "Sign in to upload." }, { status: 401 });
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

  let json: unknown;
  try {
    json = await request.json();
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
