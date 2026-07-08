import { type NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

import { env } from "~/env";
import { getCurrentUser } from "~/server/auth";
import { isShareableImage, pickSharedUrl } from "~/lib/share-target";

/**
 * PWA share-target handler (see `share_target` in app/manifest.ts). The
 * installed app can share EITHER a link/text (GET, or POST with no file) OR a
 * photo (POST multipart) into the recipe importer on the New Recipe page.
 *
 * For links we deliberately do NOT fetch anything here — the importer server
 * action owns fetching, with its own SSRF guards. This route only validates the
 * shared value and routes the user into the create flow. For a shared photo we
 * upload it to Cloudinary server-side and hand its URL to the editor as a
 * pre-filled cover (`?cover=`).
 *
 * The Cloudinary SDK needs Node crypto, so this stays on the Node runtime.
 */
export const runtime = "nodejs";

function newRecipeUrl(origin: string, params?: Record<string, string>): URL {
  const target = new URL("/recipes/new", origin);
  for (const [key, value] of Object.entries(params ?? {})) {
    target.searchParams.set(key, value);
  }
  return target;
}

function asString(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Upload a shared photo to Cloudinary and return its `secure_url`, or `null`
 * when Cloudinary isn't configured or the upload fails. The secret is used
 * server-side only (never exposed); config is passed per call so we don't
 * mutate global SDK state across concurrent requests.
 */
async function uploadSharedImage(file: File): Promise<string | null> {
  const cloudName = env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const dataUri = `data:${file.type};base64,${bytes.toString("base64")}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      folder: "heirloom/shared",
      resource_type: "image",
    });
    return result.secure_url ?? null;
  } catch {
    return null;
  }
}

/** GET share target: forward a shared link/text into the importer. */
export function GET(request: NextRequest): NextResponse {
  const params = request.nextUrl.searchParams;
  const shared = pickSharedUrl(
    params.get("url"),
    params.get("text"),
    params.get("title"),
  );
  const target = shared
    ? newRecipeUrl(request.nextUrl.origin, { import: shared })
    : newRecipeUrl(request.nextUrl.origin);
  return NextResponse.redirect(target);
}

/**
 * POST share target: a photo (multipart) and/or link/text. A valid photo is
 * uploaded and handed to the editor as a pre-filled cover; otherwise we fall
 * back to the link/text path. Always answers with a 303 so the browser turns
 * the POST into a plain GET navigation to the editor.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.nextUrl.origin;

  // Require a signed-in user before doing ANY work. The photo branch uploads to
  // Cloudinary (consuming storage + credits) and hands back a hosted secure_url,
  // and the app's middleware is a bare `clerkMiddleware()` with no `.protect()`,
  // so without this gate anyone could script `POST /import` in a loop to burn
  // Cloudinary quota and get free image hosting. Checked up front, before the
  // body is even parsed. In dev-bypass `getCurrentUser()` is never null, so
  // local + e2e share-target flows are unaffected.
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.redirect(newRecipeUrl(origin), 303);
  }

  const file = form.get("photo");
  if (file instanceof File && isShareableImage(file)) {
    const coverUrl = await uploadSharedImage(file);
    if (coverUrl) {
      return NextResponse.redirect(
        newRecipeUrl(origin, { cover: coverUrl }),
        303,
      );
    }
    // Upload unavailable/failed — fall through to any shared link/text.
  }

  const shared = pickSharedUrl(
    asString(form.get("url")),
    asString(form.get("text")),
    asString(form.get("title")),
  );
  const target = shared
    ? newRecipeUrl(origin, { import: shared })
    : newRecipeUrl(origin);
  return NextResponse.redirect(target, 303);
}
