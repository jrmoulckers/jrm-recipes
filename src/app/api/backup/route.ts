import { requireUser } from "~/server/auth";
import { type User } from "~/server/db/schema";
import { checkRateLimit } from "~/server/rate-limit";
import { buildCookbookArchive } from "~/server/recipes/backup";
import { listOwnedRecipesForBackup } from "~/server/recipes/queries";
import { toPrintRecipe } from "~/server/recipes/serialize";

// Buffers the whole archive in memory and reads the DB, so keep it on Node.
export const runtime = "nodejs";
// Always reflects the user's live recipes; never cache the download.
export const dynamic = "force-dynamic";

/**
 * "Download my whole cookbook" (issue #420).
 *
 * A long-time user's peace of mind is that their family's recipes are *theirs* —
 * this hands back a complete, self-contained ZIP (human-readable Markdown per
 * recipe plus a lossless `recipes.json`) with no third-party service involved.
 * Stories and provenance ride along so nothing about the family's history is
 * left behind. Requires sign-in and is rate-limited because it assembles the
 * entire archive in memory.
 */
export async function GET() {
  let user: User;
  try {
    user = await requireUser();
  } catch {
    return Response.json(
      { error: "Sign in to download your recipes." },
      { status: 401 },
    );
  }

  const limit = checkRateLimit("backup", user.id);
  if (!limit.ok) {
    return Response.json(
      { error: "Too many backups. Please try again in a moment." },
      {
        status: 429,
        headers: { "retry-after": String(limit.retryAfterSeconds) },
      },
    );
  }

  const recipes = await listOwnedRecipesForBackup(user.id);
  const archive = buildCookbookArchive(recipes.map(toPrintRecipe));

  // Copy into a fresh ArrayBuffer-backed view so the response body is a plain,
  // transferable byte buffer.
  const body = new Uint8Array(archive.bytes);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${archive.filename}"`,
      "content-length": String(body.byteLength),
      "cache-control": "no-store",
    },
  });
}
