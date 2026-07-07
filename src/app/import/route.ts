import { type NextRequest, NextResponse } from "next/server";

import { pickSharedUrl } from "~/lib/share-target";

/**
 * PWA share-target handler (see `share_target` in app/manifest.ts). The
 * installed app receives a shared link/text via GET and we forward it into the
 * existing recipe importer on the New Recipe page as `?import=<url>`.
 *
 * We deliberately do NOT fetch anything here — the importer server action owns
 * fetching, with its own SSRF guards. This route only validates the shared
 * value and routes the user into the create flow.
 */
export function GET(request: NextRequest): NextResponse {
  const params = request.nextUrl.searchParams;
  const shared = pickSharedUrl(
    params.get("url"),
    params.get("text"),
    params.get("title"),
  );

  const target = new URL("/recipes/new", request.nextUrl.origin);
  if (shared) target.searchParams.set("import", shared);
  return NextResponse.redirect(target);
}
