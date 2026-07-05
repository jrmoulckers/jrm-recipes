import { v2 as cloudinary } from "cloudinary";

import { env } from "~/env";

// The Cloudinary SDK relies on Node crypto for signing, so keep this off the
// edge runtime.
export const runtime = "nodejs";

/**
 * Signs Cloudinary upload-widget parameters server-side so the browser can
 * upload directly without ever seeing the API secret. Returns 501 when
 * Cloudinary isn't configured, which is the signal the editor uses to fall
 * back to plain image-URL entry.
 */
export async function POST(request: Request) {
  const cloudName = env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return Response.json(
      { error: "Cloudinary is not configured." },
      { status: 501 },
    );
  }

  const body = (await request.json()) as {
    paramsToSign?: Record<string, string>;
  };
  if (!body?.paramsToSign) {
    return Response.json({ error: "Missing paramsToSign." }, { status: 400 });
  }

  const signature = cloudinary.utils.api_sign_request(
    body.paramsToSign,
    apiSecret,
  );

  return Response.json({ signature });
}
